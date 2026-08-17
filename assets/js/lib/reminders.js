/* Reminders — v1: foreground only.

   The Notification API can show a notification, but nothing in the web platform
   can reliably *wake* a closed PWA at a chosen time. The Notification Triggers
   API never shipped. So v1 does what it can honestly do: while the app is open,
   a timer fires at each reminder time.

   v2 replaces the scheduler below with a Web Push subscription and a cron on a
   free Cloudflare Worker (iOS 16.4+ supports push for installed PWAs). That
   swap is contained entirely within this module — `start`, `stop` and
   `requestPermission` are the whole surface the rest of the app uses. */

import { timeToMinutes, todayKey } from './dates.js';

const CHECK_INTERVAL_MS = 30_000;

let timer = null;
let firedToday = new Set();
let firedDate = todayKey();

export function supported() {
  return 'Notification' in window;
}

export function permission() {
  return supported() ? Notification.permission : 'unsupported';
}

export async function requestPermission() {
  if (!supported()) return 'unsupported';
  // Must be called from a user gesture on iOS, and only when installed.
  return Notification.requestPermission();
}

/** True on iOS Safari when the app is *not* running from the home screen. */
export function needsInstallFirst() {
  const iOS = /iP(hone|ad|od)/.test(navigator.platform) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  return iOS && !window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * Start the foreground scheduler.
 * `getConfig()` returns `{ enabled, times }`; `getMessage()` returns the body.
 */
export function start(getConfig, getMessage) {
  stop();
  const tick = () => {
    const { enabled, times } = getConfig();
    if (!enabled || permission() !== 'granted') return;

    const today = todayKey();
    if (today !== firedDate) { firedDate = today; firedToday = new Set(); }

    const now = new Date();
    const minutes = now.getHours() * 60 + now.getMinutes();
    for (const time of times) {
      const due = timeToMinutes(time);
      // Fire within a minute of the target, once per time per day.
      if (minutes >= due && minutes < due + 1 && !firedToday.has(time)) {
        firedToday.add(time);
        show(getMessage());
      }
    }
  };
  timer = setInterval(tick, CHECK_INTERVAL_MS);
  tick();
}

export function stop() {
  if (timer) clearInterval(timer);
  timer = null;
}

function show(body) {
  try {
    new Notification('Habits', {
      body,
      icon: '/assets/icons/icon-192.png',
      badge: '/assets/icons/icon-192.png',
      tag: 'habits-reminder',
    });
  } catch (err) {
    console.warn('Could not show notification', err);
  }
}
