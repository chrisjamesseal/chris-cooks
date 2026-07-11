// Name of the one-time Apple Shortcut that adds each line as its own reminder.
export const SHORTCUT_NAME = 'Add to Shopping List'

/**
 * Hand a list of ingredient lines to the Reminders shortcut. The list is
 * copied to the clipboard first as a universal fallback (Reminders splits a
 * multi-line paste into separate items).
 */
export function sendToShoppingList(lines: string[]): void {
  const text = lines.join('\n')
  navigator.clipboard?.writeText(text).catch(() => {})
  window.location.href = `shortcuts://run-shortcut?name=${encodeURIComponent(SHORTCUT_NAME)}&input=text&text=${encodeURIComponent(text)}`
}
