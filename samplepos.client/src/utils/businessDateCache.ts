/**
 * Server-authoritative business date cache.
 * Populated by useServerDate / BusinessDateSync on app load.
 */
let serverBusinessDate: string | null = null;

export function setServerBusinessDate(date: string): void {
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    serverBusinessDate = date;
  }
}

export function getServerBusinessDateCached(): string | null {
  return serverBusinessDate;
}

export function clearServerBusinessDateCache(): void {
  serverBusinessDate = null;
}
