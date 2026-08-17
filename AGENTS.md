# Working in this repo

A static PWA — four HTML pages, vendored ES modules, no build step. Read
`SPEC.md` for why the product behaves the way it does; this file is about the
traps.

## Bump `CACHE_VERSION` when you change any asset

`sw.js` precaches the whole app shell and serves it **cache-first**. If you edit
CSS or JS and don't bump `CACHE_VERSION`, installed clients keep serving the old
files — including yours.

The symptom is nasty because it looks like your change didn't happen: you edit a
file, hard-reload, and see the previous version. It is easy to spend a while
"fixing" code that was already correct.

```js
// sw.js
const CACHE_VERSION = 'habits-v2';   // was habits-v1
```

During local development, clear the worker instead of bumping every time:

```js
navigator.serviceWorker.getRegistrations().then(rs => rs.forEach(r => r.unregister()));
caches.keys().then(ks => ks.forEach(k => caches.delete(k)));
```

Then reload. Bump `CACHE_VERSION` once, properly, before you ship.

Adding or renaming a file also means updating the `SHELL` array in `sw.js`, or it
won't be available offline.

## Tests

```bash
npm test
```

Pure Node, no browser. Note the quoted glob — `node --test test/` fails with
`MODULE_NOT_FOUND`; it needs `node --test 'test/*.test.mjs'`.

All scoring logic lives in `assets/js/lib/rules.js` and is tested there. If you
change what counts as a win, when the wheel is owed, or what reads as travel,
change it in `rules.js` and nowhere else — controllers read the rules, they don't
reimplement them.

One test is a property check: a longer run of missed days must never owe less
than a shorter one. It exists because the travel-gap rule had exactly that bug.
Don't delete it to make a change pass.

## Constraints that are deliberate, not accidental

- **No build step.** Turbo and Stimulus are vendored in `assets/js/vendor/` as
  plain ES modules. Don't add a bundler, and don't add runtime npm dependencies.
  See `VENDOR.md` to refresh them.
- **No CDN references, ever.** Fonts are self-hosted in `assets/fonts/`. The app
  must work fully offline and must not phone home.
- **No React.** This was an explicit product decision.
- **Every path is relative.** GitHub Pages serves project sites from `/<repo>/`,
  not the domain root, so a leading `/` in any `src`, `href`, or fetch will 404
  in production while working fine locally. This is the second-easiest way to
  ship a broken deploy, after the cache.
- **Dates are local `YYYY-MM-DD` strings**, and the day boundary is local
  midnight (see `assets/js/lib/dates.js`). Never introduce UTC — a habit tracker
  that flips days at 7pm because you flew east is broken.
- **Storage is IndexedDB**, one whole-state record, read once and written whole.
  Don't migrate to localStorage; don't add partial-update paths.

## Layout

The weekly grid is 3-3-1 (Mon/Tue/Wed, Thu/Fri/Sat, Sun full width), matching the
notebook sketch the app came from. Grid columns are `minmax(0, 1fr)` — plain
`1fr` defaults to `min-width: auto` and lets the status labels push the grid
wider than the viewport.

`.shell` is horizontal only. Page bottom padding lives on `.page`, because the
top bar is also a `.shell` and would otherwise inherit a page's worth of it.
