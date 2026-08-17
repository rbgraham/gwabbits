import { Controller } from '../vendor/stimulus.js';
import * as app from '../lib/app.js';
import { EVENTS, emit, haptic, html, raw } from '../lib/dom.js';
import { todayKey } from '../lib/dates.js';

/* The Wheel of Pain. Five segments, skull hub, lands on 1–5.

   Opened two ways:
   - Voluntarily, from the PAIN button. Closable at any time.
   - Mandatorily, when days were missed. Then it refuses to close until spun,
     which is the one place this app deliberately traps you. */

const SEGMENTS = 5;
const SEG_DEG = 360 / SEGMENTS;
const SPIN_MS = 4200;
const SEG_FILLS = ['#8f1219', '#5c0d12', '#a8161e', '#43090d', '#c2181f'];

export default class extends Controller {
  static targets = ['wheel', 'result', 'punishments', 'close', 'spinBtn', 'prompt'];

  async connect() {
    await app.ready;
    this.mandatory = false;
    this.pendingDates = [];
    this.rotation = 0;
    this.spinning = false;

    this.onOpen = (e) => this.open(e.detail);
    window.addEventListener(EVENTS.OPEN_WHEEL, this.onOpen);

    // A mandatory spin must survive Escape and the backdrop.
    this.element.addEventListener('cancel', (e) => {
      if (this.mandatory && !this.spun) e.preventDefault();
    });

    this.drawWheel();
  }

  disconnect() {
    window.removeEventListener(EVENTS.OPEN_WHEEL, this.onOpen);
  }

  open({ mandatory = false, dates = [] } = {}) {
    this.mandatory = mandatory;
    this.pendingDates = dates;
    this.spun = false;
    this.resultTarget.innerHTML = '';
    this.closeTarget.hidden = mandatory;
    // The gate has already said how many days were missed; repeating it here
    // just wraps into the Close button.
    this.promptTarget.textContent = mandatory
      ? 'Spin to carry on.'
      : 'Nobody is making you.';
    this.renderPunishments();
    if (!this.element.open) this.element.showModal();
  }

  close() {
    if (this.mandatory && !this.spun) return;
    this.element.close();
  }

  /* --- Wheel geometry ---------------------------------------------------- */

  drawWheel() {
    const cx = 100, cy = 100, r = 92;
    const pt = (deg, radius) => {
      const rad = (deg * Math.PI) / 180;
      return [cx + radius * Math.sin(rad), cy - radius * Math.cos(rad)];
    };

    const parts = [];
    for (let i = 0; i < SEGMENTS; i++) {
      const [x1, y1] = pt(i * SEG_DEG, r);
      const [x2, y2] = pt((i + 1) * SEG_DEG, r);
      const [lx, ly] = pt(i * SEG_DEG + SEG_DEG / 2, r * 0.62);
      parts.push(
        `<path d="M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2} Z"
               fill="${SEG_FILLS[i]}" stroke="#0a0a0b" stroke-width="1.5"/>`,
        `<text x="${lx}" y="${ly}" class="wheel__numeral"
               text-anchor="middle" dominant-baseline="central">${i + 1}</text>`,
      );
    }

    this.wheelTarget.innerHTML = `
      <circle cx="${cx}" cy="${cy}" r="${r + 4}" fill="#1c1c20"/>
      ${parts.join('')}
      <circle cx="${cx}" cy="${cy}" r="26" fill="#0a0a0b" stroke="#34343b" stroke-width="2"/>
      <text x="${cx}" y="${cy + 1}" text-anchor="middle" dominant-baseline="central"
            font-size="26">💀</text>`;
  }

  /* --- Spinning ---------------------------------------------------------- */

  async spin() {
    if (this.spinning) return;
    this.spinning = true;
    this.spinBtnTarget.disabled = true;
    this.resultTarget.innerHTML = '';
    haptic([15, 40, 15]);

    const landed = Math.floor(Math.random() * SEGMENTS);       // 0-indexed
    const turns = 5 + Math.floor(Math.random() * 3);
    // Bring the landed segment's midpoint under the pointer at 12 o'clock.
    const target = turns * 360 - (landed * SEG_DEG + SEG_DEG / 2);
    this.rotation = target;

    const group = this.wheelTarget;
    group.style.transition = `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.85, 0.15, 1)`;
    group.style.transform = `rotate(${this.rotation}deg)`;

    await new Promise((resolve) => setTimeout(resolve, SPIN_MS + 120));

    this.spinning = false;
    this.spun = true;
    this.spinBtnTarget.disabled = false;
    this.spinBtnTarget.textContent = 'Spin again';
    this.closeTarget.hidden = false;
    haptic([30, 60, 30]);

    await this.recordSpin(landed + 1);
    this.showResult(landed + 1);
  }

  showResult(number) {
    const punishment = app.get().punishments[number - 1] || 'Whatever you decide.';
    this.resultTarget.innerHTML = html`
      <div class="result" role="status">
        <p class="label">The wheel says</p>
        <p class="numeric result__number">${number}</p>
        <p class="result__text">${punishment}</p>
      </div>`;
  }

  async recordSpin(number) {
    await app.mutate((state) => {
      state.spins.push({
        at: new Date().toISOString(),
        date: todayKey(),
        result: number,
        punishment: state.punishments[number - 1] || '',
        mandatory: this.mandatory,
        forDates: [...this.pendingDates],
      });

      // One spin settles every outstanding miss, per SPEC.md.
      if (this.mandatory && this.pendingDates.length) {
        const latest = this.pendingDates[this.pendingDates.length - 1];
        if (latest > (state.spinResolvedThrough || '')) state.spinResolvedThrough = latest;
      }
    });
    emit(EVENTS.SPIN_DONE, { result: number });
  }

  /* --- Punishment list --------------------------------------------------- */

  renderPunishments() {
    this.punishmentsTarget.innerHTML = app.get().punishments
      .map(
        (text, i) => html`
          <li class="punishment">
            <span class="numeric punishment__index">${i + 1}</span>
            <input class="field punishment__input" type="text" value="${text}"
                   aria-label="Punishment ${i + 1}"
                   data-action="wheel#editPunishment" data-index="${i}">
          </li>`,
      )
      .join('');
  }

  editPunishment(event) {
    const index = Number(event.currentTarget.dataset.index);
    const value = event.currentTarget.value;
    app.mutate((state) => { state.punishments[index] = value; });
  }
}
