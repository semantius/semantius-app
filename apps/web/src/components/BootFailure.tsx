/**
 * Last-resort boot screen, rendered before the theme/router/auth providers exist.
 *
 * Deliberately styled with inline styles and no imports beyond React: it has to
 * render when the reason boot failed might be anything at all, so it must not
 * depend on config, providers, or the design system. Whatever is shown here is
 * the app's only remaining voice.
 */
interface BootFailureProps {
  title: string
  description: string
  detail: string
}

export function BootFailure({ title, description, detail }: BootFailureProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', fontFamily: 'system-ui, sans-serif', padding: '2rem' }}>
      <div style={{ maxWidth: '480px', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '0.75rem' }}>{title}</h1>
        <p style={{ color: '#666', marginBottom: '1rem' }}>{description}</p>
        <pre style={{ background: '#f5f5f5', padding: '1rem', borderRadius: '6px', fontSize: '0.8rem', textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{detail}</pre>
      </div>
    </div>
  )
}
