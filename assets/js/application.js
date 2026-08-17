/* Entry point.

   Importing Turbo starts it — link clicks and form submits become fetch-and-swap
   navigations, so moving between pages feels like an app rather than a website.
   Stimulus then binds behaviour to whatever markup is on screen, reconnecting
   automatically after each Turbo swap. No build step: these are plain ES modules
   served as files. */

import './vendor/turbo.js';
import { Application } from './vendor/stimulus.js';

import DaysheetController from './controllers/daysheet.js';
import HistoryController from './controllers/history.js';
import HomeController from './controllers/home.js';
import PlannerController from './controllers/planner.js';
import SettingsController from './controllers/settings.js';
import TopbarController from './controllers/topbar.js';
import WheelController from './controllers/wheel.js';

import * as app from './lib/app.js';
import * as reminders from './lib/reminders.js';
import { todayKey } from './lib/dates.js';
import { dayFor, dayProgress } from './lib/rules.js';

const application = Application.start();
application.register('daysheet', DaysheetController);
application.register('history', HistoryController);
application.register('home', HomeController);
application.register('planner', PlannerController);
application.register('settings', SettingsController);
application.register('topbar', TopbarController);
application.register('wheel', WheelController);

/* --- Reminders ------------------------------------------------------------ */

app.ready.then(() => {
  reminders.start(
    () => app.get().reminders,
    () => {
      const day = dayFor(app.get(), todayKey());
      const { done, total } = dayProgress(day);
      if (total === 0) return 'Rest day. Nothing owed.';
      if (done >= total) return "Today's done. You don't suck.";
      return `${total - done} of ${total} still open today.`;
    },
  );
});

/* --- Service worker ------------------------------------------------------- */

if ('serviceWorker' in navigator) {
  // Resolved from this module's own URL so it works at any deploy subpath —
  // GitHub Pages serves project sites from /<repo>/, not the domain root.
  const swUrl = new URL('../../sw.js', import.meta.url);
  const scope = new URL('./', swUrl);

  window.addEventListener('load', async () => {
    try {
      const reg = await navigator.serviceWorker.register(swUrl, { scope });

      // Never swap the app out from under someone mid-week. Ask first.
      reg.addEventListener('updatefound', () => {
        const incoming = reg.installing;
        if (!incoming) return;
        incoming.addEventListener('statechange', () => {
          if (incoming.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdatePrompt(incoming);
          }
        });
      });
    } catch (err) {
      console.warn('Service worker registration failed', err);
    }
  });

  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  });
}

function showUpdatePrompt(worker) {
  if (document.querySelector('.update-toast')) return;

  const toast = document.createElement('div');
  toast.className = 'update-toast';
  toast.setAttribute('role', 'status');
  toast.innerHTML = `
    <span class="update-toast__text">A new version is ready.</span>
    <button class="btn btn--sm btn--primary" type="button">Reload</button>
    <button class="btn btn--sm btn--bare" type="button">Later</button>`;

  const [reload, later] = toast.querySelectorAll('button');
  reload.addEventListener('click', () => worker.postMessage({ type: 'SKIP_WAITING' }));
  later.addEventListener('click', () => toast.remove());

  document.body.append(toast);
}
