import { Controller } from '../vendor/stimulus.js';
import { visit } from '../vendor/turbo.js';
import * as app from '../lib/app.js';
import { haptic, html, raw } from '../lib/dom.js';
import {
  addDays, dayName, isSunday, mondayOf, shortDate, todayKey, weekDays, weekRange,
} from '../lib/dates.js';
import { MAX_TASKS_PER_DAY, editability, makeTask } from '../lib/rules.js';

/* The week planner.

   Edits a draft in memory and commits on save, so a half-typed week never
   lands in storage. Structural changes (add/remove) re-render; typing does not,
   or every keystroke would blow away the caret. */

export default class extends Controller {
  static targets = ['days', 'label', 'notice', 'save', 'override'];

  async connect() {
    await app.ready;
    this.today = todayKey();
    this.monday = this.targetMonday();
    this.unlocked = false;
    this.buildDraft();
    this.render();
  }

  /** Which week this editor is pointed at. */
  targetMonday() {
    const state = app.get();
    const current = mondayOf(this.today);
    if (!state.weeks[current]) return current;      // nothing planned — plan now
    if (isSunday(this.today)) return addDays(current, 7); // Sunday sets next week
    return current;
  }

  buildDraft() {
    const state = app.get();
    const existing = state.weeks[this.monday];
    this.draft = {};
    for (const key of weekDays(this.monday)) {
      const tasks = existing?.days?.[key]?.tasks ?? [];
      this.draft[key] = tasks.map((t) => ({ ...t }));
    }
  }

  get locked() {
    if (this.unlocked) return false;
    return !editability(app.get(), this.today).open;
  }

  /* --- Rendering --------------------------------------------------------- */

  render() {
    const edit = editability(app.get(), this.today);
    const locked = this.locked;

    this.labelTarget.textContent = weekRange(this.monday);

    this.noticeTarget.innerHTML = locked
      ? html`
        <div class="notice notice--locked">
          <p>${edit.message}</p>
          <button class="btn btn--quiet btn--sm" data-action="planner#requestOverride">
            Edit anyway
          </button>
        </div>`
      : html`<p class="notice notice--open">${
          this.unlocked ? 'Editing unlocked. The ritual is yours to keep or break.' : edit.message
        }</p>`;

    this.saveTarget.disabled = locked;
    this.daysTarget.innerHTML = weekDays(this.monday)
      .map((key) => this.dayBlock(key, locked))
      .join('');
  }

  dayBlock(key, locked) {
    const tasks = this.draft[key];
    const selfSet = tasks.filter((t) => !t.penalty);
    const penalties = tasks.filter((t) => t.penalty);
    const full = selfSet.length >= MAX_TASKS_PER_DAY;

    return html`
      <section class="plan-day${raw(key === this.today ? ' plan-day--today' : '')}">
        <header class="plan-day__head">
          <h2 class="plan-day__name display">${dayName(key)}</h2>
          <span class="numeric plan-day__date">${shortDate(key)}</span>
        </header>

        <ul class="plan-day__tasks">
          ${raw(selfSet.map((task) => html`
            <li class="plan-task">
              <input class="field plan-task__input" type="text" value="${task.text}"
                     placeholder="Something small and real"
                     aria-label="Task for ${dayName(key)}"
                     ${raw(locked ? 'disabled' : '')}
                     data-action="planner#edit"
                     data-date="${key}" data-task-id="${task.id}">
              <button class="btn btn--bare plan-task__remove" type="button"
                      aria-label="Remove task"
                      ${raw(locked ? 'disabled' : '')}
                      data-action="planner#remove"
                      data-date="${key}" data-task-id="${task.id}">✕</button>
            </li>`).join(''))}

          ${raw(penalties.map((task) => html`
            <li class="plan-task plan-task--penalty">
              <span class="plan-task__static">${task.text}</span>
              <span class="task__tag">penalty</span>
            </li>`).join(''))}
        </ul>

        ${raw(full || locked ? '' : html`
          <button class="btn btn--quiet btn--sm plan-day__add" type="button"
                  data-action="planner#add" data-date="${key}">
            + Add task
          </button>`)}

        ${raw(selfSet.length === 0 && !locked
          ? '<p class="plan-day__hint">Leave empty for a rest day — it won’t break your streak.</p>'
          : '')}
      </section>`;
  }

  /* --- Draft edits ------------------------------------------------------- */

  edit(event) {
    const { date, taskId } = event.currentTarget.dataset;
    const task = this.draft[date].find((t) => t.id === taskId);
    if (task) task.text = event.currentTarget.value;   // no re-render: keep the caret
  }

  add(event) {
    const key = event.currentTarget.dataset.date;
    this.draft[key].push(makeTask(''));
    this.render();
    // Focus the input we just created.
    const inputs = this.daysTarget.querySelectorAll(`[data-date="${key}"].plan-task__input`);
    inputs[inputs.length - 1]?.focus();
  }

  remove(event) {
    const { date, taskId } = event.currentTarget.dataset;
    this.draft[date] = this.draft[date].filter((t) => t.id !== taskId);
    this.render();
  }

  requestOverride() {
    // User control and freedom: the Sunday rule is a ritual, not a cage — but
    // stepping over it should cost a deliberate second action.
    const ok = window.confirm(
      'The point of Sunday planning is that you commit once and live with it.\n\n' +
      'Edit this week anyway?',
    );
    if (!ok) return;
    this.unlocked = true;
    this.render();
  }

  /* --- Commit ------------------------------------------------------------ */

  async save() {
    haptic(15);
    const monday = this.monday;

    await app.mutate((state) => {
      const existing = state.weeks[monday];
      const week = existing ?? {
        startDate: monday,
        plannedAt: null,
        days: {},
        penaltyActive: false,
      };

      for (const key of weekDays(monday)) {
        const tasks = this.draft[key]
          .filter((t) => t.penalty || t.text.trim() !== '')
          .map((t) => ({ ...t, text: t.text.trim() }));
        week.days[key] = { tasks };
      }

      week.plannedAt = new Date().toISOString();
      state.weeks[monday] = week;
      state.firstRunComplete = true;
    });

    await app.store.requestPersistence();
    this.saveTarget.textContent = 'Saved';
    setTimeout(() => visit('index.html'), 450);
  }
}
