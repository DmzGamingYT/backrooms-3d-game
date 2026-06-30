/**
 * Date / time formatters that are referenced from many sites (header clock,
 * transcript timestamps, future cards). Kept centralised so locale drift
 * stays in one place.
 */

/** "14:32" — short clock for transcript / list rows. */
export function fmtClock(d: Date): string {
  return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

/** "vendredi 14 juin" — long date for the header strip. */
export function fmtDateLong(d: Date): string {
  return d.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "14:32:07" — wall clock with seconds for the header. */
export function fmtHMS(d: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

/** Pass a millisecond timestamp → "14:32" formatted in current locale. */
export function fmtTime(ts: number): string {
  return fmtClock(new Date(ts));
}
