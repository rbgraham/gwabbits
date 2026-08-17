/* Tests for the rules engine.
   Run with:  node --test test/
   Pure ES modules with no DOM dependency, so they run straight in Node. */

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ABSENCE_THRESHOLD, Outcome, PENALTY_TEXT, applyLatePenalty, canAddTask,
  editability, evaluate, isDayComplete, isRestDay, makeTask, selfSetTasks,
} from '../assets/js/lib/rules.js';
import { addDays, weekDays } from '../assets/js/lib/dates.js';

const MON_A = '2026-08-03';   // Monday
const MON_B = '2026-08-10';   // the following Monday

/** Build a week. `spec` has 7 entries, one per Mon–Sun:
      null            -> no day record at all (unplanned)
      []              -> a rest day
      [true, false]   -> two tasks with those done states           */
function makeWeek(monday, spec) {
  const days = {};
  weekDays(monday).forEach((key, i) => {
    const entry = spec[i];
    if (entry === null || entry === undefined) return;
    days[key] = {
      tasks: entry.map((done) => ({ ...makeTask(`task ${key}`), done })),
    };
  });
  return { startDate: monday, plannedAt: null, days, penaltyActive: false };
}

function makeState(weeks, extra = {}) {
  return { weeks, spins: [], spinResolvedThrough: '', firstRunComplete: true, ...extra };
}

const DONE = [true, true];
const PARTIAL = [true, false];
const REST = [];

/* --- Day completion ------------------------------------------------------ */

test('a day is won at x/x, not 3/3', () => {
  assert.equal(isDayComplete({ tasks: [{ done: true }, { done: true }] }), true);
  assert.equal(isDayComplete({ tasks: [{ done: true }] }), true);
  assert.equal(isDayComplete({ tasks: [{ done: true }, { done: false }] }), false);
});

test('a day with no tasks is a rest day, not a win', () => {
  assert.equal(isRestDay({ tasks: [] }), true);
  assert.equal(isDayComplete({ tasks: [] }), false);
});

test('the 3-task cap counts self-set tasks only, so penalties can exceed it', () => {
  const day = { tasks: [makeTask('a'), makeTask('b'), makeTask('c')] };
  assert.equal(canAddTask(day), false);

  day.tasks.push(makeTask(PENALTY_TEXT, { penalty: true }));
  assert.equal(selfSetTasks(day).length, 3);
  assert.equal(day.tasks.length, 4);
});

/* --- Streaks -------------------------------------------------------------- */

test('rest days neither break nor extend a streak', () => {
  const state = makeState({
    [MON_A]: makeWeek(MON_A, [DONE, REST, DONE, DONE, REST, DONE, DONE]),
  });
  const { streak } = evaluate(state, MON_B);
  assert.equal(streak, 5);
});

test('a single missed day resets the streak', () => {
  const state = makeState({
    [MON_A]: makeWeek(MON_A, [DONE, DONE, PARTIAL, DONE, DONE, DONE, DONE]),
  });
  const { streak, longestStreak } = evaluate(state, MON_B);
  assert.equal(streak, 4);        // Thu–Sun
  assert.equal(longestStreak, 4);
});

test('today counts toward the streak only once it is finished', () => {
  const openToday = makeState({ [MON_A]: makeWeek(MON_A, [DONE, DONE, PARTIAL, null, null, null, null]) });
  assert.equal(evaluate(openToday, addDays(MON_A, 2)).streak, 2);

  const doneToday = makeState({ [MON_A]: makeWeek(MON_A, [DONE, DONE, DONE, null, null, null, null]) });
  assert.equal(evaluate(doneToday, addDays(MON_A, 2)).streak, 3);
});

/* --- Misses, spins and the travel gap ------------------------------------ */

test('two consecutive misses owe exactly one spin', () => {
  const state = makeState({
    [MON_A]: makeWeek(MON_A, [DONE, PARTIAL, PARTIAL, DONE, DONE, DONE, DONE]),
  });
  const { outcomes, spinRequired, unresolvedMisses } = evaluate(state, MON_B);

  assert.equal(outcomes[addDays(MON_A, 1)], Outcome.MISSED);
  assert.equal(outcomes[addDays(MON_A, 2)], Outcome.MISSED);
  assert.equal(spinRequired, true);
  assert.equal(unresolvedMisses.length, 2);   // two days, but the UI spins once
});

test('a long gap that crosses a Monday reads as travel: no spin, streak pauses', () => {
  const state = makeState({
    // Away from Saturday through the following Monday.
    [MON_A]: makeWeek(MON_A, [DONE, DONE, DONE, DONE, DONE, PARTIAL, PARTIAL]),
    [MON_B]: makeWeek(MON_B, [PARTIAL, DONE, DONE, null, null, null, null]),
  });
  const { outcomes, spinRequired, streak } = evaluate(state, addDays(MON_B, 3));

  assert.equal(outcomes[addDays(MON_A, 5)], Outcome.ABSENCE);
  assert.equal(outcomes[addDays(MON_A, 6)], Outcome.ABSENCE);
  assert.equal(outcomes[MON_B], Outcome.ABSENCE);
  assert.equal(spinRequired, false);
  assert.equal(streak, 7, 'Mon–Fri plus Tue–Wed carry across the absence');
});

test('three misses inside a single week is a collapse, not travel', () => {
  // The whole point of the week-boundary rule: without it, missing 3 days here
  // would cost less than missing 2, which rewards giving up harder.
  const state = makeState({
    [MON_A]: makeWeek(MON_A, [DONE, PARTIAL, PARTIAL, PARTIAL, DONE, DONE, DONE]),
  });
  const { outcomes, spinRequired, unresolvedMisses } = evaluate(state, MON_B);

  for (let i = 1; i <= ABSENCE_THRESHOLD; i++) {
    assert.equal(outcomes[addDays(MON_A, i)], Outcome.MISSED);
  }
  assert.equal(spinRequired, true);
  assert.equal(unresolvedMisses.length, 3);
});

test('missing more days is never cheaper than missing fewer', () => {
  // Property check across every run length inside one week: a longer run must
  // never owe less than a shorter one.
  const cost = (missDays) => {
    const spec = [DONE, DONE, DONE, DONE, DONE, DONE, DONE];
    for (let i = 0; i < missDays; i++) spec[i + 1] = PARTIAL;
    const state = makeState({ [MON_A]: makeWeek(MON_A, spec) });
    return evaluate(state, MON_B).spinRequired;
  };

  for (let n = 1; n <= 5; n++) {
    assert.equal(cost(n), true, `${n} missed days inside one week should owe a spin`);
  }
});

test('a two-day gap across a Monday is still just two misses', () => {
  const state = makeState({
    [MON_A]: makeWeek(MON_A, [DONE, DONE, DONE, DONE, DONE, DONE, PARTIAL]),
    [MON_B]: makeWeek(MON_B, [PARTIAL, DONE, null, null, null, null, null]),
  });
  const { outcomes, spinRequired } = evaluate(state, addDays(MON_B, 2));

  assert.equal(outcomes[addDays(MON_A, 6)], Outcome.MISSED);
  assert.equal(outcomes[MON_B], Outcome.MISSED);
  assert.equal(spinRequired, true, 'crossing a Monday is not enough on its own');
});

test('an unplanned gap does not fuse two short miss runs into an absence', () => {
  // Miss Sunday of week A, skip week B entirely, miss Mon+Tue of week C.
  const MON_C = addDays(MON_A, 14);
  const state = makeState({
    [MON_A]: makeWeek(MON_A, [DONE, DONE, DONE, DONE, DONE, DONE, PARTIAL]),
    [MON_C]: makeWeek(MON_C, [PARTIAL, PARTIAL, null, null, null, null, null]),
  });
  const { outcomes } = evaluate(state, addDays(MON_C, 3));

  assert.equal(outcomes[addDays(MON_A, 6)], Outcome.MISSED);
  assert.equal(outcomes[MON_C], Outcome.MISSED);
  assert.equal(outcomes[addDays(MON_C, 1)], Outcome.MISSED);
});

test('days outside any planned week cannot be missed', () => {
  const state = makeState({ [MON_A]: makeWeek(MON_A, [DONE, DONE, null, null, null, null, null]) });
  const { outcomes, spinRequired } = evaluate(state, MON_B);

  assert.equal(outcomes[addDays(MON_A, 2)], undefined);
  assert.equal(spinRequired, false);
});

test('a settled spin is not owed twice', () => {
  const weeks = { [MON_A]: makeWeek(MON_A, [DONE, PARTIAL, DONE, DONE, DONE, DONE, DONE]) };
  assert.equal(evaluate(makeState(weeks), MON_B).spinRequired, true);

  const settled = makeState(weeks, { spinResolvedThrough: addDays(MON_A, 1) });
  assert.equal(evaluate(settled, MON_B).spinRequired, false);
});

/* --- Editing windows ------------------------------------------------------ */

test('first run unlocks editing so the app is usable before a Sunday arrives', () => {
  const state = makeState({}, { firstRunComplete: false });
  const edit = editability(state, addDays(MON_A, 2));   // a Wednesday
  assert.equal(edit.open, true);
  assert.equal(edit.reason, 'first-run');
});

test('a week with no plan is always editable', () => {
  const state = makeState({});
  assert.equal(editability(state, addDays(MON_A, 2)).open, true);
});

test('a planned week locks midweek and reopens on Sunday', () => {
  const state = makeState({ [MON_A]: makeWeek(MON_A, [DONE, DONE, DONE, DONE, DONE, DONE, DONE]) });

  const midweek = editability(state, addDays(MON_A, 2));
  assert.equal(midweek.open, false);
  assert.equal(midweek.reason, 'not-sunday');
  assert.match(midweek.message, /Sunday/, 'the reason is always stated, never just disabled');

  const sunday = editability(state, addDays(MON_A, 6));
  assert.equal(sunday.open, true);
  assert.equal(sunday.reason, 'sunday');
});

/* --- The late-check penalty ---------------------------------------------- */

test('a late check penalises today and the days still ahead, and only once', () => {
  const state = makeState({ [MON_B]: makeWeek(MON_B, [PARTIAL, DONE, REST, REST, REST, REST, REST]) });
  const wednesday = addDays(MON_B, 2);

  const applied = applyLatePenalty(state, MON_B, wednesday);
  assert.equal(applied, 5, 'Wed through Sun');

  const week = state.weeks[MON_B];
  assert.equal(week.penaltyActive, true);
  assert.equal(week.days[MON_B].tasks.some((t) => t.penalty), false, 'never backdated');
  assert.equal(week.days[wednesday].tasks.at(-1).text, PENALTY_TEXT, 'today is still actionable');
  assert.equal(week.days[addDays(MON_B, 3)].tasks.at(-1).text, PENALTY_TEXT);

  // Non-stacking: a second late check that week changes nothing.
  assert.equal(applyLatePenalty(state, addDays(MON_B, 1), wednesday), 0);
  assert.equal(week.days[addDays(MON_B, 3)].tasks.filter((t) => t.penalty).length, 1);
});

test('a late check on Sunday still costs something', () => {
  // Regression: "every remaining day" is empty on the last day of the week, so
  // the penalty applied to nothing while still marking itself used.
  const state = makeState({ [MON_B]: makeWeek(MON_B, [PARTIAL, DONE, DONE, DONE, DONE, DONE, [false]]) });
  const sunday = addDays(MON_B, 6);

  assert.equal(applyLatePenalty(state, MON_B, sunday), 1);
  assert.equal(state.weeks[MON_B].days[sunday].tasks.at(-1).text, PENALTY_TEXT);
});

test('a penalty is not burned when it lands on nothing', () => {
  const state = makeState({ [MON_B]: makeWeek(MON_B, [PARTIAL, null, null, null, null, null, null]) });
  const tuesday = addDays(MON_B, 1);

  assert.equal(applyLatePenalty(state, MON_B, tuesday), 0, 'no planned days from Tuesday on');
  assert.equal(state.weeks[MON_B].penaltyActive, false, 'stays available to bite later');
});

test('a penalty task counts toward that day being won', () => {
  const state = makeState({ [MON_B]: makeWeek(MON_B, [REST, REST, REST, [true], REST, REST, REST]) });
  const thursday = addDays(MON_B, 3);

  applyLatePenalty(state, MON_B, addDays(MON_B, 2));
  assert.equal(isDayComplete(state.weeks[MON_B].days[thursday]), false, 'penalty is unticked');

  state.weeks[MON_B].days[thursday].tasks.at(-1).done = true;
  assert.equal(isDayComplete(state.weeks[MON_B].days[thursday]), true);
});
