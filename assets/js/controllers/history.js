import { Controller } from '../vendor/stimulus.js';
import * as app from '../lib/app.js';
import { html, raw } from '../lib/dom.js';
import { DAY_ABBR, compare, shortDate, todayKey, weekDays, weekRange } from '../lib/dates.js';
import { Outcome } from '../lib/rules.js';

/* History: streak readouts, a row of seven dots per week, and the log of
   everything the wheel has handed you. */

const DOT_TONE = {
  [Outcome.COMPLETE]: 'complete',
  [Outcome.MISSED]: 'missed',
  [Outcome.REST]: 'rest',
  [Outcome.ABSENCE]: 'absence',
  [Outcome.TODAY]: 'today',
  [Outcome.FUTURE]: 'future',
};

export default class extends Controller {
  static targets = ['streak', 'longest', 'weeks', 'spins', 'totals'];

  async connect() {
    await app.ready;
    this.unsubscribe = app.subscribe(() => this.render());
    this.render();
  }

  disconnect() {
    this.unsubscribe?.();
  }

  render() {
    const state = app.get();
    const snap = app.snapshot();
    const today = todayKey();

    this.streakTarget.textContent = String(snap.streak);
    this.longestTarget.textContent = String(snap.longestStreak);

    this.renderTotals(snap);
    this.renderWeeks(state, snap, today);
    this.renderSpins(state);
  }

  renderTotals(snap) {
    if (!this.hasTotalsTarget) return;
    const values = Object.values(snap.outcomes);
    const count = (o) => values.filter((v) => v === o).length;
    const done = count(Outcome.COMPLETE);
    const missed = count(Outcome.MISSED);
    const rate = done + missed > 0 ? Math.round((done / (done + missed)) * 100) : null;

    this.totalsTarget.innerHTML = html`
      <div class="stat"><p class="numeric stat__value">${done}</p><p class="label">Days won</p></div>
      <div class="stat"><p class="numeric stat__value">${missed}</p><p class="label">Days missed</p></div>
      <div class="stat">
        <p class="numeric stat__value">${rate === null ? '—' : `${rate}%`}</p>
        <p class="label">Hit rate</p>
      </div>`;
  }

  renderWeeks(state, snap, today) {
    const mondays = Object.keys(state.weeks).sort(compare).reverse();

    if (mondays.length === 0) {
      this.weeksTarget.innerHTML = html`
        <p class="empty">No weeks yet. Plan one and it’ll show up here.</p>`;
      return;
    }

    this.weeksTarget.innerHTML = mondays
      .map((monday) => {
        const dots = weekDays(monday)
          .map((key, i) => {
            const outcome = snap.outcomes[key] ?? Outcome.UNPLANNED;
            const tone = DOT_TONE[outcome] ?? 'unplanned';
            return html`<span class="dot dot--${tone}"
                              title="${DAY_ABBR[i]} ${shortDate(key)}: ${outcome}"
                              aria-label="${DAY_ABBR[i]}: ${outcome}"></span>`;
          })
          .join('');

        const week = state.weeks[monday];
        const isCurrent = weekDays(monday).includes(today);

        return html`
          <li class="week-row${raw(isCurrent ? ' week-row--current' : '')}">
            <div class="week-row__head">
              <span class="numeric week-row__range">${weekRange(monday)}</span>
              ${raw(week.penaltyActive
                ? '<span class="task__tag task__tag--late">late penalty</span>'
                : '')}
            </div>
            <div class="dots" role="img" aria-label="Week results">${raw(dots)}</div>
          </li>`;
      })
      .join('');
  }

  renderSpins(state) {
    const spins = [...(state.spins ?? [])].reverse();
    if (spins.length === 0) {
      this.spinsTarget.innerHTML = html`<p class="empty">The wheel hasn’t been spun yet.</p>`;
      return;
    }

    this.spinsTarget.innerHTML = spins
      .map(
        (spin) => html`
          <li class="spin-row">
            <span class="numeric spin-row__result">${spin.result}</span>
            <span class="spin-row__body">
              <span class="spin-row__text">${spin.punishment || '—'}</span>
              <span class="label spin-row__meta">
                ${shortDate(spin.date)}${raw(spin.mandatory ? ' · owed' : ' · voluntary')}
              </span>
            </span>
          </li>`,
      )
      .join('');
  }
}
