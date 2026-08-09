/**
 * Presentation helpers safe to import from both server and client components.
 * Kept out of `@/server/files`, which pulls in the storage provider and must
 * never be bundled into the browser.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
