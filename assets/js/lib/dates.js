/* Local-time date helpers.

   Every date in this app is a local `YYYY-MM-DD` string. The day boundary is
   local midnight, and the week starts Monday. We never touch UTC — a habit
   tracker that flips days at 7pm because you flew east is broken. */

export const DAY_NAMES = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const DAY_ABBR = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const pad = (n) => String(n).padStart(2, '0');

/** Date object -> local 'YYYY-MM-DD'. */
export function toKey(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** 'YYYY-MM-DD' -> Date at local midnight. */
export function fromKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayKey() {
  return toKey(new Date());
}

export function addDays(key, n) {
  const d = fromKey(key);
  d.setDate(d.getDate() + n);
  return toKey(d);
}

/** Whole days from `a` to `b`; negative if b is earlier. */
export function daysBetween(a, b) {
  return Math.round((fromKey(b) - fromKey(a)) / 86400000);
}

/** 0 = Monday ... 6 = Sunday. */
export function weekdayIndex(key) {
  return (fromKey(key).getDay() + 6) % 7;
}

export function isSunday(key) {
  return weekdayIndex(key) === 6;
}

/** The Monday that begins the week containing `key`. */
export function mondayOf(key) {
  return addDays(key, -weekdayIndex(key));
}

/** All seven day keys of the week beginning at `mondayKey`. */
export function weekDays(mondayKey) {
  return Array.from({ length: 7 }, (_, i) => addDays(mondayKey, i));
}

export function compare(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
}

/* --- Display ------------------------------------------------------------- */

export function dayName(key) {
  return DAY_NAMES[weekdayIndex(key)];
}

export function dayAbbr(key) {
  return DAY_ABBR[weekdayIndex(key)];
}

/** '14 Aug' — mono-friendly and unambiguous. */
export function shortDate(key) {
  const d = fromKey(key);
  return `${d.getDate()} ${d.toLocaleDateString(undefined, { month: 'short' })}`;
}

/** '11 – 17 Aug' for a week row. */
export function weekRange(mondayKey) {
  return `${shortDate(mondayKey)} – ${shortDate(addDays(mondayKey, 6))}`;
}

/** '09:00' -> minutes since local midnight. */
export function timeToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}
