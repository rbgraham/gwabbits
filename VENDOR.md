# Vendored dependencies

`assets/js/vendor/` holds Turbo and Stimulus as plain ES modules, and
`assets/fonts/` holds the latin subsets of the three typefaces. They are
committed on purpose: the app has **no build step and no runtime CDN calls**, so
it works offline and deploys by copying files.

Current versions:

| What | Version | Source |
| --- | --- | --- |
| Turbo | 8.0.23 | `@hotwired/turbo` → `dist/turbo.es2017-esm.js` |
| Stimulus | 3.2.2 | `@hotwired/stimulus` → `dist/stimulus.js` |
| Bebas Neue / Inter / JetBrains Mono | latin subset | Google Fonts |

## Refreshing Turbo or Stimulus

```bash
npm pack @hotwired/turbo@latest @hotwired/stimulus@latest
tar xzf hotwired-turbo-*.tgz && cp package/dist/turbo.es2017-esm.js assets/js/vendor/turbo.js
rm -rf package && tar xzf hotwired-stimulus-*.tgz && cp package/dist/stimulus.js assets/js/vendor/stimulus.js
rm -rf package hotwired-*.tgz
```

Then bump `CACHE_VERSION` in `sw.js` so clients pick the new files up.

## Refreshing the icons

`assets/icons/*.png` are generated from the wheel motif. Regenerate with the
script in the repo history, or replace by hand — they only need to be square
PNGs at 180, 192 and 512, plus a 512 maskable with its art inside the centre 80%.
