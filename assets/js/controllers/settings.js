import { Controller } from '../vendor/stimulus.js';
import * as app from '../lib/app.js';
import { html } from '../lib/dom.js';
import * as reminders from '../lib/reminders.js';

/* Settings: punishments, reminders, and the export/import that stands between
   you and Safari's storage eviction. */

export default class extends Controller {
  static targets = [
    'punishments', 'remindersToggle', 'timeA', 'timeB',
    'permissionNote', 'storageNote', 'importInput', 'importNote',
  ];

  async connect() {
    await app.ready;
    this.renderPunishments();
    this.renderReminders();
    this.renderStorage();
  }

  /* --- Punishments ------------------------------------------------------- */

  renderPunishments() {
    this.punishmentsTarget.innerHTML = app.get().punishments
      .map(
        (text, i) => html`
          <li class="punishment">
            <span class="numeric punishment__index">${i + 1}</span>
            <input class="field punishment__input" type="text" value="${text}"
                   aria-label="Punishment ${i + 1}" placeholder="Define a consequence"
                   data-action="settings#editPunishment" data-index="${i}">
          </li>`,
      )
      .join('');
  }

  editPunishment(event) {
    const index = Number(event.currentTarget.dataset.index);
    app.mutate((state) => { state.punishments[index] = event.currentTarget.value; });
  }

  /* --- Reminders --------------------------------------------------------- */

  renderReminders() {
    const { enabled, times } = app.get().reminders;
    this.remindersToggleTarget.checked = enabled;
    this.timeATarget.value = times[0] ?? '09:00';
    this.timeBTarget.value = times[1] ?? '18:00';

    let note;
    if (!reminders.supported()) {
      note = 'This browser has no Notification API, so reminders can’t fire at all.';
    } else if (reminders.needsInstallFirst()) {
      note = 'On iOS, add this to your home screen first — Safari tabs can’t show notifications.';
    } else if (reminders.permission() === 'denied') {
      note = 'Notifications are blocked for this site. Re-allow them in browser settings.';
    } else if (reminders.permission() !== 'granted') {
      note = 'You’ll be asked to allow notifications when you switch these on.';
    } else {
      note = 'Reminders only fire while the app is open — there’s no server sending them yet.';
    }
    this.permissionNoteTarget.textContent = note;
  }

  async toggleReminders(event) {
    const enabled = event.currentTarget.checked;

    if (enabled && reminders.permission() !== 'granted') {
      const result = await reminders.requestPermission();
      if (result !== 'granted') {
        event.currentTarget.checked = false;
        this.renderReminders();
        return;
      }
    }

    await app.mutate((state) => { state.reminders.enabled = enabled; });
    this.renderReminders();
  }

  updateTimes() {
    const times = [this.timeATarget.value, this.timeBTarget.value].filter(Boolean);
    app.mutate((state) => { state.reminders.times = times; });
  }

  /* --- Storage ----------------------------------------------------------- */

  async renderStorage() {
    if (!this.hasStorageNoteTarget) return;
    const persisted = await navigator.storage?.persisted?.().catch(() => false);
    this.storageNoteTarget.textContent = persisted
      ? 'Storage is marked persistent — the browser shouldn’t evict your data.'
      : 'Storage is not persistent. Safari clears unused site data after about a week, so keep a backup.';
  }

  async exportData() {
    const blob = app.store.exportBlob(app.get());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = app.store.exportFilename();
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  pickImport() {
    this.importInputTarget.click();
  }

  async importData(event) {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    event.currentTarget.value = '';

    try {
      const next = app.store.parseImport(await file.text());
      const ok = window.confirm(
        'Importing replaces everything currently in the app — tasks, streaks, history ' +
        'and punishments.\n\nContinue?',
      );
      if (!ok) return;

      await app.replace(next);
      this.importNoteTarget.textContent = 'Imported. Your data has been replaced.';
      this.renderPunishments();
      this.renderReminders();
    } catch (err) {
      this.importNoteTarget.textContent = err.message;
    }
  }

  async resetAll() {
    const ok = window.confirm(
      'This erases every task, streak, week and spin, permanently.\n\n' +
      'Export a backup first if you might want any of it. Erase everything?',
    );
    if (!ok) return;

    await app.store.wipe();
    await app.replace(app.store.blankState());
    this.renderPunishments();
    this.renderReminders();
    this.importNoteTarget.textContent = 'Everything erased.';
  }
}
