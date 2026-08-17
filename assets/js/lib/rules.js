/* The rules engine. Every scoring decision in the app lives here and nowhere
   else, so the mechanics can be reasoned about (and changed) in one place.

   See SPEC.md for the decisions these encode. In short:
     - A day is won at x/x, not 3/3.
     - A day with no tasks is a rest day: neutral for the streak.
     - Days outside any planned week don't exist. They can't be missed.
     - 1–2 consecutive missed days cost one spin of the wheel.
     - 3+ consecutive missed days read as travel — but only if the run spans a
       week boundary. Without that condition, missing 3 days inside one week
       would be strictly better than missing 2, which is backwards.
     - Checking a past day late applies a non-stacking penalty task to the
       rest of that week.
*/

import { addDays, compare, isSunday, mondayOf, weekDays } from './dates.js';

export const MAX_TASKS_PER_DAY = 3;      // self-set only; penalties sit outside
export const ABSENCE_THRESHOLD = 3;      // consecutive misses that can read as travel
export const PENALTY_TEXT = 'Check in on time';

export const Outcome = {
  COMPLETE: 'complete',
  MISSED: 'missed',
  REST: 'rest',
  ABSENCE: 'absence',
  UNPLANNED: 'unplanned',
  TODAY: 'today',
  FUTURE: 'future',
};

/* --- Day-level ----------------------------------------------------------- */

export function makeTask(text, { penalty = false } = {}) {
  return {
    id: crypto.randomUUID(),
    text,
    done: false,
    doneAt: null,
    penalty,
    checkedLate: false,
  };
}

export function isRestDay(day) {
  return !day || day.tasks.length === 0;
}

export function isDayComplete(day) {
  return !!day && day.tasks.length > 0 && day.tasks.every((t) => t.done);
}

export function selfSetTasks(day) {
  return day ? day.tasks.filter((t) => !t.penalty) : [];
}

export function canAddTask(day) {
  return selfSetTasks(day).length < MAX_TASKS_PER_DAY;
}

export function dayProgress(day) {
  if (!day) return { done: 0, total: 0 };
  return { done: day.tasks.filter((t) => t.done).length, total: day.tasks.length };
}

/* --- Week lookup --------------------------------------------------------- */

export function weekFor(state, dateKey) {
  return state.weeks[mondayOf(dateKey)] || null;
}

export function dayFor(state, dateKey) {
  const week = weekFor(state, dateKey);
  return week ? week.days[dateKey] || null : null;
}

/** Every planned day key, ascending. Days outside a planned week are absent. */
export function plannedDayKeys(state) {
  return Object.keys(state.weeks)
    .sort(compare)
    .flatMap((monday) => weekDays(monday).filter((k) => state.weeks[monday].days[k]));
}

/* --- Timeline evaluation ------------------------------------------------- */

/**
 * Walk the planned timeline once and derive everything scored from it.
 *
 * Returns { outcomes, streak, longestStreak, spinRequired, unresolvedMisses }.
 * `outcomes` maps every planned day key to an Outcome.
 */
export function evaluate(state, todayKey) {
  const keys = plannedDayKeys(state);
  const outcomes = {};
  const past = [];

  for (const key of keys) {
    if (key > todayKey) { outcomes[key] = Outcome.FUTURE; continue; }
    if (key === todayKey) { outcomes[key] = Outcome.TODAY; continue; }

    const day = dayFor(state, key);
    if (isRestDay(day)) outcomes[key] = Outcome.REST;
    else if (isDayComplete(day)) outcomes[key] = Outcome.COMPLETE;
    else outcomes[key] = Outcome.MISSED;
    past.push(key);
  }

  // Promote long runs of misses to absences. Runs are consecutive over the
  // *planned* timeline, so an unplanned gap doesn't join two short runs.
  //
  // A run must also cross a Monday to count as travel. Length alone would make
  // missing 3 days inside one week cheaper than missing 2 — no spin owed and
  // the streak preserved — which rewards giving up harder. Real absences run
  // across a week boundary; a bad Tuesday-to-Thursday does not.
  let run = [];
  const flushRun = () => {
    const spansWeeks = run.length > 0 && mondayOf(run[0]) !== mondayOf(run[run.length - 1]);
    if (run.length >= ABSENCE_THRESHOLD && spansWeeks) {
      for (const k of run) outcomes[k] = Outcome.ABSENCE;
    }
    run = [];
  };
  for (let i = 0; i < past.length; i++) {
    const key = past[i];
    const contiguous = i === 0 || past[i - 1] === addDays(key, -1);
    if (outcomes[key] === Outcome.MISSED && contiguous) {
      run.push(key);
    } else if (outcomes[key] === Outcome.MISSED) {
      flushRun();
      run = [key];
    } else {
      flushRun();
    }
  }
  flushRun();

  // Streak: completions accumulate; rest days and absences are skipped; a
  // real miss resets. Today counts only once it's actually finished.
  let streak = 0;
  let longestStreak = 0;
  for (const key of past) {
    const o = outcomes[key];
    if (o === Outcome.COMPLETE) { streak += 1; longestStreak = Math.max(longestStreak, streak); }
    else if (o === Outcome.MISSED) streak = 0;
    // REST and ABSENCE: pass through untouched.
  }
  if (isDayComplete(dayFor(state, todayKey))) {
    streak += 1;
    longestStreak = Math.max(longestStreak, streak);
  }

  // Spins are owed for real misses only, and only for days not already settled.
  const settledThrough = state.spinResolvedThrough || '';
  const unresolvedMisses = past.filter(
    (k) => outcomes[k] === Outcome.MISSED && k > settledThrough,
  );

  return {
    outcomes,
    streak,
    longestStreak,
    unresolvedMisses,
    spinRequired: unresolvedMisses.length > 0,
  };
}

/* --- Editing windows ----------------------------------------------------- */

/**
 * Why the week editor is or isn't open right now.
 *
 * Nielsen's visibility-of-system-status: the UI always states the reason, and
 * per SPEC.md an override always exists, so `locked` is never a dead end.
 */
export function editability(state, todayKey) {
  if (!state.firstRunComplete) {
    return { open: true, reason: 'first-run', message: 'Set up your first week.' };
  }
  if (!weekFor(state, todayKey)) {
    return { open: true, reason: 'no-plan', message: 'No plan for this week yet.' };
  }
  if (isSunday(todayKey)) {
    return { open: true, reason: 'sunday', message: "It's Sunday. Set next week." };
  }
  return {
    open: false,
    reason: 'not-sunday',
    message: 'The week is set. Editing reopens on Sunday.',
  };
}

/* --- Mutations ----------------------------------------------------------- */

/**
 * Apply the late-check penalty to the rest of `todayKey`'s week.
 *
 * "The rest of the week" includes today: on Sunday there is no later day, and
 * without this the penalty would silently apply to nothing while still marking
 * itself used — making a late check on the last day of the week entirely free.
 * Today is still actionable, so that's where the cost lands.
 *
 * Non-stacking: once a week carries the penalty, further late checks add
 * nothing. Returns the number of days that gained a task.
 */
export function applyLatePenalty(state, lateDateKey, todayKey) {
  const monday = mondayOf(todayKey);
  const week = state.weeks[monday];
  if (!week || week.penaltyActive) return 0;

  let applied = 0;
  for (const key of weekDays(monday)) {
    if (key < todayKey) continue;            // never backdated
    const day = week.days[key];
    if (!day) continue;
    day.tasks.push(makeTask(PENALTY_TEXT, { penalty: true }));
    applied += 1;
  }

  // Only burn the once-per-week penalty if it actually cost something.
  if (applied > 0) {
    week.penaltyActive = true;
    week.penaltyFrom = lateDateKey;
  }
  return applied;
}

/** Would checking this day count as late? */
export function isLateCheck(dateKey, todayKey) {
  return dateKey < todayKey;
}
