import { Controller } from '../vendor/stimulus.js';
import * as app from '../lib/app.js';
import { EVENTS, haptic, html, makeDismissable, raw } from '../lib/dom.js';
import { dayName, mondayOf, shortDate, todayKey } from '../lib/dates.js';
import {
  Outcome, PENALTY_TEXT, applyLatePenalty, dayFor, isLateCheck,
} from '../lib/rules.js';

/* The day detail sheet — an iOS bottom sheet on a native <dialog>, which gives
   us modal semantics, focus trapping and Escape-to-close for free.

   This is where the late-check penalty is explained *before* it's incurred:
   Nielsen's error-prevention heuristic says confirm a consequential, hard-to-
   reverse action rather than reporting it afterwards. */

export default class extends Controller {
  static targets = ['body', 'title', 'subtitle'];

  async connect() {
    await app.ready;
    this.dateKey = null;
    this.pendingLateTaskId = null;

    this.onOpen = (e) => this.open(e.detail.dateKey);
    window.addEventListener(EVENTS.OPEN_DAY, this.onOpen);
    this.unsubscribe = app.subscribe(() => { if (this.element.open) this.renderBody(); });

    makeDismissable(this.element, () => this.close());
  }

  disconnect() {
    window.removeEventListener(EVENTS.OPEN_DAY, this.onOpen);
    this.unsubscribe?.();
  }

  open(dateKey) {
    this.dateKey = dateKey;
    this.pendingLateTaskId = null;
    this.titleTarget.textContent = dayName(dateKey);
    this.subtitleTarget.textContent = shortDate(dateKey);
    this.renderBody();
    if (!this.element.open) this.element.showModal();
  }

  close() {
    this.pendingLateTaskId = null;
    if (this.element.open) this.element.close();
  }

  /* --- Rendering --------------------------------------------------------- */

  renderBody() {
    const state = app.get();
    const today = todayKey();
    const key = this.dateKey;
    const day = dayFor(state, key);
    const outcome = app.snapshot().outcomes[key];

    if (!day) {
      this.bodyTarget.innerHTML = html`
        <p class="sheet__empty">
          Nothing planned for this day.
          ${raw(key >= today ? '<a class="link" href="week.html">Plan the week</a>' : '')}
        </p>`;
      return;
    }

    if (day.tasks.length === 0) {
      this.bodyTarget.innerHTML = html`
        <p class="sheet__empty">Rest day. Nothing to do, nothing to miss.</p>`;
      return;
    }

    const future = key > today;
    const late = isLateCheck(key, today);
    const notice = this.noticeFor({ future, late, outcome, state, today });

    this.bodyTarget.innerHTML = html`
      ${raw(notice)}
      <ul class="tasks">
        ${raw(day.tasks.map((task) => this.taskRow(task, { future })).join(''))}
      </ul>
      ${raw(this.pendingLateTaskId ? this.confirmPanel() : '')}`;
  }

  taskRow(task, { future }) {
    const id = `task-${task.id}`;
    return html`
      <li class="task${raw(task.done ? ' task--done' : '')}${raw(task.penalty ? ' task--penalty' : '')}">
        <input class="task__box" type="checkbox" id="${id}"
               ${raw(task.done ? 'checked' : '')}
               ${raw(future ? 'disabled' : '')}
               data-action="daysheet#toggle" data-task-id="${task.id}">
        <label class="task__label" for="${id}">
          ${task.text}
          ${raw(task.penalty ? '<span class="task__tag">penalty</span>' : '')}
          ${raw(task.checkedLate ? '<span class="task__tag task__tag--late">late</span>' : '')}
        </label>
      </li>`;
  }

  noticeFor({ future, late, outcome, state, today }) {
    if (future) {
      return html`<p class="notice notice--locked">
        Locked until ${dayName(this.dateKey)} comes round. You can see it, not tick it.
      </p>`;
    }
    if (outcome === Outcome.ABSENCE) {
      return html`<p class="notice notice--absence">
        Counted as time away, not a failure. Your streak paused rather than broke.
      </p>`;
    }
    if (late) {
      const week = state.weeks[mondayOf(today)];
      return week?.penaltyActive
        ? html`<p class="notice notice--late">
            This week already carries the late penalty, so checking this costs nothing more.
          </p>`
        : html`<p class="notice notice--late">
            Checking this late adds “${PENALTY_TEXT}” to today and every remaining day this week.
          </p>`;
    }
    return '';
  }

  confirmPanel() {
    return html`
      <div class="confirm" role="alertdialog" aria-label="Confirm late check">
        <p class="confirm__text">
          That adds “${PENALTY_TEXT}” to today and the rest of your week. It only
          happens once — later late checks won’t stack.
        </p>
        <div class="confirm__actions">
          <button class="btn btn--quiet btn--sm" data-action="daysheet#cancelLate">Leave it</button>
          <button class="btn btn--danger btn--sm" data-action="daysheet#acceptLate">Check it anyway</button>
        </div>
      </div>`;
  }

  /* --- Actions ----------------------------------------------------------- */

  toggle(event) {
    const taskId = event.currentTarget.dataset.taskId;
    const today = todayKey();
    const state = app.get();
    const day = dayFor(state, this.dateKey);
    const task = day?.tasks.find((t) => t.id === taskId);
    if (!task) return;

    // Unchecking is always free; only a late *check* triggers the penalty.
    const needsConfirm =
      !task.done &&
      isLateCheck(this.dateKey, today) &&
      !state.weeks[mondayOf(today)]?.penaltyActive;

    if (needsConfirm) {
      event.currentTarget.checked = false;
      this.pendingLateTaskId = taskId;
      this.renderBody();
      return;
    }

    this.commitToggle(taskId, isLateCheck(this.dateKey, today));
  }

  acceptLate() {
    const taskId = this.pendingLateTaskId;
    this.pendingLateTaskId = null;
    if (taskId) this.commitToggle(taskId, true);
  }

  cancelLate() {
    this.pendingLateTaskId = null;
    this.renderBody();
  }

  async commitToggle(taskId, late) {
    haptic();
    await app.mutate((state) => {
      const day = dayFor(state, this.dateKey);
      const task = day?.tasks.find((t) => t.id === taskId);
      if (!task) return;

      task.done = !task.done;
      task.doneAt = task.done ? new Date().toISOString() : null;

      if (task.done && late) {
        task.checkedLate = true;
        applyLatePenalty(state, this.dateKey, todayKey());
      }
    });
  }
}
