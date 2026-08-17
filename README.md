# Habits

A dark, no-nonsense weekly habit tracker with a built-in accountability mechanic: miss your day, and you spin the **Wheel of Pain**.

## Intent

Most habit trackers are gentle. This one isn't. The idea is simple: plan a short, achievable list for each day of the week, do it, and get a blunt "you don't suck" pat on the back. Don't do it, and the app doesn't let you quietly move on — it makes you spin a wheel that hands you a real, self-defined consequence. The friction is the feature.

It's designed around a single ritual: set your week once, every Sunday, then just show up and check boxes for the next seven days.

## Design

- **Palette**: near-black background with three deliberate accent colors — a blood-red for danger/incomplete, a muted sage-green for success, and a warm gold for streaks/achievement. No neon, no generic "dark mode purple."
- **Type**: condensed display face (Bebas Neue) for headers and the wordmark, a clean sans (Inter) for body text, and a monospace face (JetBrains Mono) for anything numeric — dates, streak counts, week labels — to give those a "readout" feel.
- **Signature element**: the Wheel of Pain itself — a 5-segment spinning wheel with a skull hub, landing on a random punishment each time it's spun.
- **Layout**: the weekly calendar is a 3-3-1 grid (Mon/Tue/Wed, Thu/Fri/Sat, Sun alone on its own row), matching the original notebook sketch this app was built from.

## Core capabilities

**Weekly calendar**
- Days run Monday → Sunday, laid out 3 over 3 over 1.
- Each day holds up to 3 self-set tasks. Penalty tasks sit outside that cap.
- Today's card shows only the first task, with a tap-to-expand view of the full checklist.
- Future days are visible but locked until it's their turn.

**Winning a day**
- A day is won at **x/x**, not 3/3 — two tasks both ticked is a win. Plan small.
- A day with no tasks is a **rest day**: it neither breaks nor extends your streak.
- Check everything off → an in-app banner: *"Well done! You don't suck!"*

**Late checking costs you**
- Past days aren't frozen — you can go back and tick one.
- But the first time you do it in a given week, a **"Check in on time"** task is added to today and every remaining day of that week. It doesn't stack: later late checks that week are free.
- You're told what it will cost *before* you confirm it.

**Sunday editing**
- The task list for the whole upcoming week can only be edited on Sunday.
- Exception: the very first time you open the app, editing is unlocked immediately (so you're not stuck waiting for a Sunday to use it at all). After that first save, the Sunday-only rule applies.
- There is always a visible way out. "Edit anyway" is one confirmation away — the ritual is the point, but being trapped isn't.

**Wheel of Pain**
- Accessed via the big red **PAIN** button, always pinned at the top of the home screen.
- Spins and lands on a random number, 1–5.
- Miss a day and it stops being optional: the app blocks with a 😭 banner until you spin. Several missed days cost **one** spin on return, not one each.
- Below the wheel, five numbered punishments are listed — fully editable at any time, so the consequences are always yours to define.
- Every spin is logged into your history.

**Time away is not failure**
- A run of missed days reads as an absence when it's three or more days **and** crosses a Monday. Then no spin is owed and your streak **pauses** rather than breaks.
- Bailing for three days midweek is not travel, and is treated as what it is. Otherwise missing three days would cost less than missing two, and giving up harder would be the winning move.
- A new week never auto-advances or auto-punishes; it waits for you to reset it. A backpacking trip shouldn't cost you a streak.

**Streaks & history**
- Current streak and longest streak, tracked automatically based on fully-completed days.
- A running history of past weeks, each shown as a row of 7 dots (hit/miss) so you can see your pattern over time.

**Reminders**
- Two customizable reminder times per day (default 9:00 AM / 6:00 PM), editable in Settings.
- Uses the browser's Notification API to alert you while the app is open.

## Known limitations

This is a web app (HTML/CSS/JS), not a native iOS/Android app, so a few things work differently than an App Store app would:

- **No true background push yet.** Reminders only fire while the app is open. Nothing in the web platform can wake a closed PWA at a chosen time — the Notification Triggers API never shipped — so real background reminders need a server to send them. iOS 16.4+ *does* support Web Push for home-screen-installed apps, so this is a v2 feature (a free Cloudflare Worker on a cron), not a permanent wall. All the scheduling lives behind `assets/js/lib/reminders.js` so adding it won't disturb anything else.
- **No App Store distribution.** It installs via "Add to Home Screen," not through the App Store, so there's no app icon install flow, auto-updates, or App Store review process.
- **Storage is local to the browser.** Your data (tasks, streaks, history, punishments) is saved in your phone's browser storage — IndexedDB, on-device, no account, nothing uploaded. Clearing site data will erase it, and Safari evicts storage after roughly a week of not opening the app, so **Settings → Export backup** is worth using. It doesn't sync across devices.
- **iOS home-screen web apps** work as standalone, storage-backed apps outside the EU; inside the EU they may behave more like a bookmark that opens in Safari, depending on iOS version — this is an Apple platform restriction, not something the app itself controls.

## How it's built

A static PWA with **no build step and no framework runtime you'd recognise as heavy**. Hotwire's client half does the work: Turbo Drive makes page-to-page navigation feel app-like, Stimulus binds behaviour to hand-written HTML. Both are vendored as plain ES modules, so `git push` is the whole deploy.

There is no Rails here, and there can't be — GitHub Pages serves static files only. What you get is the Rails *feel* (server-shaped page transitions, small sprinkles of JS) without a server.

```
index.html  week.html  history.html  settings.html   the four screens
sw.js  manifest.webmanifest                          offline + install
assets/css/     tokens → base → app                  design system, in that order
assets/js/lib/  rules.js  store.js  dates.js  app.js  all scoring lives in rules.js
assets/js/controllers/                               one per screen, plus the wheel
test/                                                node --test, no browser needed
```

`assets/js/lib/rules.js` is the file to read first: every scoring decision — what
counts as a win, when the wheel is owed, what reads as travel — is there and
nowhere else.

## Running it

```bash
npm test          # 26 tests, pure Node, no browser
npm run serve     # http://localhost:4173
```

## Deploying to GitHub Pages

Every path in the app is relative, so it works at `user.github.io/repo/`, on a custom domain, or straight off disk — no base-path configuration.

1. Push this repo to GitHub.
2. **Settings → Pages → Source: Deploy from a branch**, pick your branch and `/ (root)`.
3. Open the URL on your phone and use **Share → Add to Home Screen**.

`.nojekyll` is present so Pages serves the files as-is. When you change any
asset, bump `CACHE_VERSION` in `sw.js` — otherwise installed copies keep serving
the old cache. Users get a "new version is ready" prompt rather than having the
app swapped out from under them mid-week.
