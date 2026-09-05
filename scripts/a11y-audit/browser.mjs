import { spawnSync } from 'node:child_process'
import { closeSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Thin wrapper over the `agent-browser` CLI.
 *
 * Everything here exists because of a specific way the CLI bites:
 *
 * - IT NEVER RETURNS IF ITS STDIO IS A PIPE. `agent-browser` keeps a background
 *   daemon per session, and the daemon inherits the pipe, so the pipe never
 *   closes and `spawnSync` waits forever even though the command itself finished
 *   in milliseconds. Every stream is therefore wired to a real FILE here, which
 *   the daemon can hold open harmlessly while the parent waits only on exit.
 *   This is the single most confusing failure mode in the whole harness — a
 *   command that works perfectly in a terminal and hangs forever from a script.
 * - `batch` in ARGUMENT mode strips single quotes, which silently mangles any JS
 *   payload passed through it. Not used here for that reason.
 * - `eval -b` (base64) fails on payloads the size of axe-core (580KB), so axe is
 *   injected with `--init-script` and only small probe scripts go through `eval`.
 * - Windows: `agent-browser` resolves to a `.cmd` shim, so spawn needs a shell.
 */

const SHELL = process.platform === 'win32'

export class Browser {
  constructor({ session = 'a11y-audit', initScripts = [], timeoutMs = 180_000 } = {}) {
    this.session = session
    this.initScripts = initScripts
    this.timeoutMs = timeoutMs
    this.registeredInitScripts = false
    this.tmp = mkdtempSync(join(tmpdir(), 'a11y-audit-'))
  }

  #run(args, { input, allowFailure = false } = {}) {
    const argv = ['--session', this.session, ...args]
    const outPath = join(this.tmp, 'stdout')
    const errPath = join(this.tmp, 'stderr')
    const inPath = join(this.tmp, 'stdin')
    writeFileSync(outPath, '')
    writeFileSync(errPath, '')
    writeFileSync(inPath, input ?? '')

    const fdIn = openSync(inPath, 'r')
    const fdOut = openSync(outPath, 'w')
    const fdErr = openSync(errPath, 'w')
    let result
    try {
      result = spawnSync('agent-browser', argv, {
        stdio: [fdIn, fdOut, fdErr],
        shell: SHELL,
        timeout: this.timeoutMs,
      })
    } finally {
      closeSync(fdIn)
      closeSync(fdOut)
      closeSync(fdErr)
    }

    const stdout = readFileSync(outPath, 'utf8')
    const stderr = readFileSync(errPath, 'utf8')

    if (result.error) {
      if (allowFailure) return { ok: false, stdout, stderr: String(result.error) }
      throw new Error(`agent-browser ${args[0]} failed to start: ${result.error.message}`)
    }
    const ok = result.status === 0
    if (!ok && !allowFailure) {
      throw new Error(`agent-browser ${argv.join(' ')} exited ${result.status}\n${stderr || stdout}`)
    }
    return { ok, stdout, stderr }
  }

  /**
   * Navigate. The init scripts are attached on the first navigation of the
   * session only — they persist for its lifetime, and re-passing them on every
   * open registers duplicates that each re-parse 580KB of axe.
   */
  open(url) {
    const args = []
    if (!this.registeredInitScripts) {
      for (const script of this.initScripts) args.push('--init-script', script)
      this.registeredInitScripts = true
    }
    args.push('open', url)
    return this.#run(args, { allowFailure: true })
  }

  setViewport(width, height) {
    return this.#run(['set', 'viewport', String(width), String(height)], { allowFailure: true })
  }

  /**
   * Emulate the OS color-scheme preference.
   *
   * This is the only correct lever for this app: next-themes runs with
   * `defaultTheme="system"`, so it subscribes to prefers-color-scheme. Writing
   * the `semantius-ui-theme` key or toggling `.dark` by hand desynchronizes the
   * provider from the DOM and measures a state no user can reach.
   */
  setMedia(theme) {
    return this.#run(['set', 'media', theme], { allowFailure: true })
  }

  /** Run JS in the page and parse its JSON result. The script must return a string. */
  evalJson(source) {
    const { ok, stdout, stderr } = this.#run(['eval', '--stdin'], {
      input: source,
      allowFailure: true,
    })
    if (!ok) return { error: (stderr || stdout).trim().slice(0, 500) || 'eval failed' }
    return parseEvalOutput(stdout)
  }

  screenshot(path, { fullPage = true } = {}) {
    const args = ['screenshot']
    if (fullPage) args.push('--full')
    args.push(path)
    return this.#run(args, { allowFailure: true })
  }

  /** Page errors recorded since the last clear. */
  errors({ clear = false } = {}) {
    const args = ['errors']
    if (clear) args.push('--clear')
    const { ok, stdout } = this.#run(args, { allowFailure: true })
    if (!ok) return []
    const text = stdout.trim()
    if (!text || /no (page )?errors/i.test(text)) return []
    try {
      const parsed = JSON.parse(text)
      if (Array.isArray(parsed)) return parsed
      if (Array.isArray(parsed?.errors)) return parsed.errors
    } catch {
      /* plain text output */
    }
    return text.split('\n').filter((l) => l.trim())
  }

  /**
   * Tear the session down and start clean.
   *
   * Over a long run the CLI's per-session daemon can stop answering ("daemon may
   * be busy or unresponsive"). Every subsequent cell then reports INCONCLUSIVE
   * for a reason that has nothing to do with the page, quietly turning a
   * conformance run into 200 cells of noise. Recreating the session costs a few
   * seconds and keeps the run's failures about the app.
   */
  restart() {
    this.#run(['close'], { allowFailure: true })
    this.registeredInitScripts = false
  }

  /** Does this result look like the daemon, rather than the page, giving up? */
  static isSessionFailure(result) {
    const text = String(result?.error ?? result?.stderr ?? '')
    return /daemon may be busy|unresponsive|Invalid response|EOF while parsing|ECONNREFUSED/i.test(text)
  }

  close() {
    this.#run(['close'], { allowFailure: true })
    rmSync(this.tmp, { recursive: true, force: true })
  }
}

/**
 * `agent-browser eval` prints the returned value, prefixed with a status glyph in
 * its human format. Every probe returns `JSON.stringify(...)`, so recover the
 * JSON from whatever framing the CLI put around it rather than assuming one.
 */
export function parseEvalOutput(stdout) {
  const text = stdout.trim()
  if (!text) return { error: 'empty eval output' }

  const attempt = (candidate) => {
    try {
      const value = JSON.parse(candidate)
      return typeof value === 'string' ? JSON.parse(value) : value
    } catch {
      return undefined
    }
  }

  const direct = attempt(text)
  if (direct !== undefined) return direct

  // Human format: a leading glyph/label line, then the value.
  const braceAt = text.search(/[[{]/)
  if (braceAt >= 0) {
    const sliced = attempt(text.slice(braceAt))
    if (sliced !== undefined) return sliced
  }
  return { error: `unparseable eval output: ${text.slice(0, 300)}` }
}
