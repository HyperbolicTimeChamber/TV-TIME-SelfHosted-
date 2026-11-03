/**
 * UTC instant of a wall-clock time in an IANA timezone ("2026-11-03", "18:00",
 * "America/Los_Angeles" → 2026-11-04T02:00Z), DST included. No date library: Intl gives the
 * zone's offset at an instant; the second pass settles times near a DST switch.
 */
export function zonedTimeToUtc(date: string, time: string, timeZone: string): Date {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const wall = Date.UTC(y, m - 1, d, hh, mm);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const offset = (t: number) => {
    const parts = fmt.formatToParts(new Date(t));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second")) - t;
  };
  const first = wall - offset(wall);
  return new Date(wall - offset(first));
}
