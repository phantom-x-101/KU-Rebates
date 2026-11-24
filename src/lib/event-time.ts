/** Calendar day of a stock-event timestamp. Works for ISO and SQLite datetime('now'). */
export function eventDay(at: string) {
  return at.slice(0, 10);
}

export function nowEventAt(at: Date = new Date()) {
  return at.toISOString();
}
