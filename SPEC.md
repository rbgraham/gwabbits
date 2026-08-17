# Habits — Build Spec

Decisions resolved from the README plus the requirements conversation. This is the
contract; the README stays as the product pitch.

## Platform

Static PWA on GitHub Pages. **No Rails** — Pages serves flat files only, so there is no
Ruby process, no server-rendered Turbo Frames, no ActionCable. We use Hotwire's
client-side half instead:

- **Turbo Drive** for navigation between the static pages (home, week editor, history,
  settings), so transitions feel app-like without full reloads.
- **Stimulus** controllers for behavior, attached via `data-controller` on
  hand-written HTML.
- **No build step.** Turbo and Stimulus are vendored as local ES modules and wired with
  an import map. Deploy is `git push`. No CDN references anywhere — the app must work
  fully offline.

**All paths are relative, all pages are flat files at the repo root**
(`index.html`, `week.html`, `history.html`, `settings.html`). GitHub Pages serves
project sites from `/<repo>/` rather than the domain root, so root-absolute paths would
404. Relative paths make the app work unchanged at any subpath, on a custom domain, or
opened straight off the filesystem — no base-path configuration anywhere.

### Reminders in v1: foreground only

**v1 ships as pure GitHub Pages — no server, no accounts, no second deploy target.**
Reminders use the Notification API and fire only while the app is open, exactly as the
original README describes.

Deferred to v2: a Cloudflare Worker (free tier) on a 1-minute Cron Trigger for true
background push, storing only `{push endpoint, keys, reminder times, timezone}` — never
habit data. The reminder scheduling logic is kept behind a single module boundary
(`lib/reminders.js`) so adding push later does not touch the rest of the app.

## Design direction

**Dark base, Kit.com typographic rhythm, iOS HIG interaction, Fluent tokens.**

- Palette stays as the README specifies: near-black ground, blood-red (danger/incomplete),
  muted sage-green (success), warm gold (streaks/achievement). No neon, no purple.
- Typefaces stay: Bebas Neue (display/wordmark), Inter (body), JetBrains Mono (all
  numerics — dates, streak counts, week labels). Self-hosted, subset, `font-display: swap`.
- Kit.com's contribution is **rhythm, not palette**: its generous line-height, restrained
  type scale, wide margins, and comfortable measure. The app should read as designed
  rather than merely loud.
- Fluent supplies the token layer underneath: 4px spacing ramp, elevation steps, and
  motion curves/durations.
- iOS HIG drives interaction: bottom sheets over modals, swipe actions on list rows,
  large-title collapse on scroll, safe-area inset handling, 44pt minimum touch targets,
  no hover-dependent affordances, momentum scrolling, `display: standalone`.

Nielsen/Norman heuristics are the review lens — in particular *visibility of system
status* (why a day is locked is always stated, never just disabled) and *user control
and freedom* (see the Sunday override below).

## Rules

### Completion

- A day is **complete when every task defined for it is checked** — x/x, not 3/3. A day
  with two tasks is won at 2/2.
- A day with **zero tasks is a rest day**: neither breaks nor extends the streak.
- Task cap: **3 self-set tasks per day.** Penalty tasks sit outside the cap and are
  visually distinct.

### Late checking

Checking off a past day is allowed, but it costs: a **"Check in on time"** penalty task
is appended to every remaining day of the current week. It does **not** stack — once the
penalty is active for the week, further late-checks add nothing new. Penalty tasks count
toward that day's x/x.

### Sunday editing lock

The week's task list is editable on Sunday. First run unlocks editing immediately so the
app is usable without waiting for a Sunday.

Per *user control and freedom*, the lock is **not absolute**: a clearly labeled override
exists behind a confirmation step. The friction is the mechanic; a trap is not.

### Missed days and the Wheel of Pain

- Missing a day triggers the wheel on next open. Spinning is **required** — the app is
  blocked until you spin. The result is dismissible once shown; there is no "did you
  actually do it?" follow-up.
- Multiple missed days produce **one spin on return**, not one per day.
- Spun punishments are **logged into history** alongside the week's hit/miss dots.
- The five punishments are user-editable at any time.

### Travel gap

**A run of missed days reads as an absence when it is three or more days long *and*
crosses a Monday.** Then no spin is owed, the streak *pauses* rather than breaks, and the
user lands on a "reset your week" screen. Anything else — one or two missed days, or any
run contained inside a single week — still costs a spin.

The week-boundary condition is not decoration. On length alone, missing three days inside
one week would owe nothing and preserve the streak, while missing two would break it and
cost a spin: giving up harder would be strictly cheaper. Requiring the run to cross a
Monday matches what real absences look like and removes the incentive. A test asserts the
property directly — a longer run must never owe less than a shorter one.

The new week does not auto-advance or auto-punish — it waits for the user to reset their
habits on return. A backpacking trip should not cost a streak.

### Streaks and history

- Current streak and longest streak, computed from fully-completed days.
- Full history retained indefinitely (kilobytes), shown as per-week rows of 7 hit/miss dots.

## Data

- **IndexedDB**, versioned schema. Not localStorage.
- **Export/import JSON** in Settings. Safari evicts site storage after ~7 days of non-use,
  so this is necessary insurance, not a nicety.
- Dates stored as local `YYYY-MM-DD`; day boundary is local midnight. Week starts Monday.
- Service worker precaches the app shell, cache-first with a versioned bust, and prompts
  before activating an update rather than swapping under the user.

## Layout

Weekly calendar as **3-3-1** (Mon/Tue/Wed, Thu/Fri/Sat, Sun alone), per the original
notebook sketch. Today's card shows the first task with tap-to-expand to the full
checklist. Past days grayed and locked; future days visible and locked.

The red **PAIN** button is pinned at the top of the home screen at all times.

## Corrections to the README

- The README's "no true background push" limitation is **accurate for v1** (foreground
  only) but not a permanent platform limit: iOS 16.4+ supports Web Push for home-screen
  installed PWAs. It needs a scheduled sender, which v2 adds.
- The README lists `habits-app.html` and `habits-app.jsx`. Neither exists in the repo, and
  neither will — this is a from-scratch, React-free build.
