import { screen, waitFor, within } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import { expect } from 'vitest'

/** The grid row whose label reads `rowName`. */
export async function findRow(rowName: string): Promise<HTMLElement> {
  const row = (await screen.findByText(rowName)).closest('tr')
  expect(row).toBeTruthy()
  return row!
}

/**
 * Open a grid row's "..." menu from the keyboard and choose the item labeled
 * `label`. The menu button is focused and opened with Enter, then the item is
 * reached with `arrowTo` — never a pointer click on an item, never typeahead.
 */
export async function chooseRowMenuItem(ui: ReturnType<typeof userEvent.setup>, rowName: string, label: string) {
  const trigger = within(await findRow(rowName)).getByRole('button', { name: 'Open menu' })
  trigger.focus()
  await ui.keyboard('{Enter}')
  // The popup mounts a tick after the key, and takes focus a moment after that;
  // keys pressed in between would go to the button.
  await waitFor(() => expect(screen.getByRole('menu')).toBeInTheDocument())
  await waitFor(() => expect(document.activeElement?.closest('[role="menu"]')).toBeTruthy())
  await arrowTo(ui, (el) => el.textContent?.trim() === label)
  await ui.keyboard('{Enter}')
}

/**
 * ArrowDown through the focused menu until focus is on an item that `matches`.
 *
 * NOT typeahead. Base UI's menu typeahead forgets what was typed after 500ms
 * without a key (`TYPEAHEAD_RESET_MS`), so on a loaded machine a label typed a
 * key at a time turns into several shorter searches: `Language` lands on
 * whatever its last letters match, and no wait afterwards brings focus back.
 * That failed the v0.2.6 release gate. Arrow keys have no clock — each press
 * moves one item, and the loop waits for focus to move before the next.
 */
export async function arrowTo(ui: ReturnType<typeof userEvent.setup>, matches: (el: Element) => boolean) {
  const menu = document.activeElement?.closest('[role="menu"]')
  const items = menu?.querySelectorAll('[role^="menuitem"]').length ?? 0
  // One full lap: the menu loops, so a miss after that is a real absence.
  for (let i = 0; i < items && !(document.activeElement && matches(document.activeElement)); i++) {
    const before = document.activeElement
    await ui.keyboard('{ArrowDown}')
    await waitFor(() => expect(document.activeElement).not.toBe(before))
  }
  expect(document.activeElement && matches(document.activeElement)).toBe(true)
}
