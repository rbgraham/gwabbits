/* Minimal rendering helpers. No framework, no virtual DOM — just safe string
   templating and a couple of iOS-flavoured interaction utilities. */

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/**
 * Tagged template that escapes every interpolation by default.
 * Opt out for known-safe fragments with `raw()`.
 */
export function html(strings, ...values) {
  return strings.reduce((out, str, i) => {
    if (i === 0) return str;
    const v = values[i - 1];
    const rendered = Array.isArray(v) ? v.join('') : v;
    const safe = rendered && rendered.__raw ? rendered.value : escapeHtml(rendered ?? '');
    return out + safe + str;
  }, '');
}

export function raw(value) {
  return { __raw: true, value: Array.isArray(value) ? value.join('') : String(value ?? '') };
}

/** Short haptic tap where supported. Silent no-op on iOS Safari. */
export function haptic(pattern = 10) {
  try {
    navigator.vibrate?.(pattern);
  } catch { /* not supported */ }
}

export function emit(name, detail = {}) {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

export const EVENTS = {
  OPEN_DAY: 'habits:open-day',
  OPEN_WHEEL: 'habits:open-wheel',
  SPIN_DONE: 'habits:spin-done',
  CHANGED: 'habits:changed',
};

/**
 * Bottom-sheet behaviour on a native <dialog>: modal semantics, focus trap and
 * Escape come free; this adds the iOS drag-down-to-dismiss gesture.
 */
export function makeDismissable(dialog, onClose) {
  let startY = 0;
  let dragging = false;

  const grip = dialog.querySelector('[data-sheet-grip]') || dialog;

  grip.addEventListener('touchstart', (e) => {
    if (dialog.scrollTop > 0) return;
    startY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });

  grip.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) dialog.style.transform = `translateY(${dy}px)`;
  }, { passive: true });

  grip.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    const dy = parseFloat(dialog.style.transform.replace(/[^0-9.-]/g, '')) || 0;
    dialog.style.transform = '';
    if (dy > 100) onClose();
  });

  // Tapping the backdrop closes — the dialog element itself fills the sheet,
  // so a click landing on ::backdrop reports coordinates outside its box.
  dialog.addEventListener('click', (e) => {
    const box = dialog.getBoundingClientRect();
    const outside =
      e.clientY < box.top || e.clientY > box.bottom ||
      e.clientX < box.left || e.clientX > box.right;
    if (outside) onClose();
  });
}
