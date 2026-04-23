/**
 * lib/page-content-store.ts
 * In-memory store for admin inline text edits.
 * Keys are `page:elementId`, values are the edited text.
 * Swap the Map for a database call to persist across restarts.
 */

const store = new Map<string, string>()

export function getContent(key: string): string | undefined {
  return store.get(key)
}

export function setContent(key: string, value: string): void {
  store.set(key, value)
}

export function getAllContent(): Record<string, string> {
  return Object.fromEntries(store.entries())
}
