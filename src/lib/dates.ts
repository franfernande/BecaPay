/** ISO → value for <input type="datetime-local"> in the runtime's local time zone. */
export function toLocalInputValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** First day of next month at 12:00 local time. */
export function defaultNextCycle(now = new Date()): string {
  return new Date(now.getFullYear(), now.getMonth() + 1, 1, 12, 0).toISOString();
}
