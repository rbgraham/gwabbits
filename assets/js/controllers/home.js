import { Controller } from '../vendor/stimulus.js';
import * as app from '../lib/app.js';
import { EVENTS, emit, haptic, html, raw } from '../lib/dom.js';
import {
  addDays, dayAbbr, mondayOf, shortDate, todayKey, weekDays, weekRange,
} from '../lib/dates.js';
import {
  Outcome, dayFor, dayProgress, editability, selfSetTasks, weekFor,
} from '../lib/rules.js';

/* The home screen: PAIN button, status banner, streak readout, and the 3-3-1
   weekly grid. Re-renders wholesale on any state change — the tree is tiny. */

const STATUS = {
  [Outcome.COMPLETE]: { word: 'Done', tone: 'complete' },
  [Outcome.MISSED]: { word: 'Missed', tone: 'missed' },
  [Outcome.REST]: { word: 'Rest', tone: 'rest' },
  [Outcome.ABSENCE]: { word: 'Away', tone: 'absence' },
  [Outcome.TODAY]: { word: 'Today', tone: 'today' },
  [Outcome.FUTURE]: { word: 'Locked', tone: 'future' },
  [Outcome.UNPLANNED]: { word: 'Unplanned', tone: 'unplanned' },
};

export default class extends Controller {
  static targets = ['banner', 'grid', 'streak', 'longest', 'weekLabel', 'gate', 'planLink'];

  async connect() {
    await app.ready;
    this.unsubscribe = app.subscribe(() => this.render());
    this.onOpenWheel = () => this.render();
    window.addEventListener(EVENTS.SPIN_DONE, this.onOpenWheel);
    this.render();
  }

  disconnect() {
    this.unsubscribe?.();
    window.removeEventListener(EVENTS.SPIN_DONE, this.onOpenWheel);
  }

  render() {
    const state = app.get();
    const today = todayKey();
    const snap = app.snapshot();

    this.renderGate(snap);
    this.renderBanner(state, snap, today);
    this.renderStreak(snap);
    this.renderGrid(state, snap, today);
  }

  /* --- Blocking spin gate ------------------------------------------------ */

  renderGate(snap) {
    if (!this.hasGateTarget) return;
    const blocked = snap.spinRequired;
    this.gateTarget.hidden = !blocked;
    this.element.classList.toggle('is-gated', blocked);

    if (blocked) {
      const n = snap.unresolvedMisses.length;
      this.gateTarget.innerHTML = html`
        <div class="gate__panel" role="alertdialog" aria-labelledby="gate-title">
          <p class="gate__emoji" aria-hidden="true">😭</p>
          <h2 class="display gate__title" id="gate-title">Time to spin the wheel of pain</h2>
          <p class="gate__body">
            You missed ${n === 1 ? 'a day' : `${n} days`}${raw(
              n === 1 ? '' : ' — that&rsquo;s one spin, not one each',
            )}. Spin to carry on.
          </p>
          <button class="btn btn--danger btn--full" data-action="home#forceSpin">Spin the wheel</button>
        </div>`;
    }
  }

  forceSpin() {
    haptic(20);
    emit(EVENTS.OPEN_WHEEL, { mandatory: true, dates: app.snapshot().unresolvedMisses });
  }

  /* --- Banner ------------------------------------------------------------ */

  renderBanner(state, snap, today) {
    if (!this.hasBannerTarget) return;
    const day = dayFor(state, today);
    const { done, total } = dayProgress(day);

    let banner = null;
    if (snap.spinRequired) {
      banner = null; // the gate is already saying it, louder
    } else if (total > 0 && done === total) {
      banner = { tone: 'good', emoji: '🎉', text: "Well done! You don't suck!" };
    } else if (!weekFor(state, today)) {
      banner = {
        tone: 'neutral',
        emoji: '🗓️',
        text: 'No plan for this week. Set one when you’re ready.',
      };
    }

    this.bannerTarget.innerHTML = banner
      ? html`<div class="banner banner--${banner.tone}" role="status">
          <span class="banner__emoji" aria-hidden="true">${banner.emoji}</span>
          <span class="banner__text">${banner.text}</span>
        </div>`
      : '';
  }

  /* --- Streak readout ---------------------------------------------------- */

  renderStreak(snap) {
    if (this.hasStreakTarget) this.streakTarget.textContent = String(snap.streak);
    if (this.hasLongestTarget) this.longestTarget.textContent = String(snap.longestStreak);
  }

  /* --- Weekly grid ------------------------------------------------------- */

  renderGrid(state, snap, today) {
    if (!this.hasGridTarget) return;

    const monday = mondayOf(today);
    const keys = weekDays(monday);

    if (this.hasWeekLabelTarget) this.weekLabelTarget.textContent = weekRange(monday);

    if (this.hasPlanLinkTarget) {
      const edit = editability(state, today);
      this.planLinkTarget.textContent = edit.open
        ? weekFor(state, today) ? 'Edit this week' : 'Plan this week'
        : 'View plan';
    }

    this.gridTarget.innerHTML = keys
      .map((key) => this.dayCard(state, snap, key, today))
      .join('');
  }

  dayCard(state, snap, key, today) {
    const day = dayFor(state, key);
    const outcome = snap.outcomes[key] ?? (day ? Outcome.FUTURE : Outcome.UNPLANNED);
    const status = STATUS[outcome];
    const { done, total } = dayProgress(day);
    const isToday = key === today;
    const isSunday = key === addDays(mondayOf(key), 6);

    // Today shows only its first task, per the README — tap expands the rest.
    const preview = isToday && day && day.tasks.length
      ? html`<p class="day__preview">${day.tasks[0].text}</p>`
      : '';

    // With no tasks there's nothing to count, and the status word already says
    // why — a bare dash next to "Unplanned" is just noise in a narrow card.
    const count = total > 0
      ? html`<span class="numeric day__count">${done}/${total}</span>`
      : '';

    const penaltyFlag = day?.tasks.some((t) => t.penalty)
      ? html`<span class="day__flag" title="Carries a penalty task">!</span>`
      : '';

    const label = `${dayAbbr(key)} ${shortDate(key)}, ${status.word}, ${done} of ${total} done`;

    return html`
      <button type="button"
              class="day day--${status.tone}${raw(isSunday ? ' day--sunday' : '')}"
              data-action="home#openDay"
              data-date="${key}"
              aria-label="${label}">
        <span class="day__head">
          <span class="label day__name">${dayAbbr(key)}</span>
          ${raw(penaltyFlag)}
        </span>
        <span class="numeric day__date">${shortDate(key)}</span>
        ${raw(preview)}
        <span class="day__foot">
          ${raw(count)}
          <span class="day__status label">${status.word}</span>
        </span>
      </button>`;
  }

  openDay(event) {
    const dateKey = event.currentTarget.dataset.date;
    haptic();
    emit(EVENTS.OPEN_DAY, { dateKey });
  }

  openWheel() {
    haptic(20);
    emit(EVENTS.OPEN_WHEEL, { mandatory: false, dates: [] });
  }
}
