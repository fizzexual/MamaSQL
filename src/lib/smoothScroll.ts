// Dependency-free smooth wheel scrolling (Lenis-style easing) for every scroll
// container in the app. The native mouse wheel snaps a fixed step per notch; this
// intercepts wheel events and eases the nearest scrollable ancestor toward a
// target position with a per-frame lerp, so wheel scrolling glides.
//
// Notes:
// - Only wheel is hijacked. Keyboard / scrollbar / programmatic scrolls keep the
//   CSS `scroll-behavior: smooth` path (direct scrollTop writes here are instant
//   per frame, so the two don't compound).
// - Ctrl+wheel (browser/diagram zoom) and any event another handler already
//   preventDefault'd (e.g. the ER-diagram canvas) are left alone.

const EASE = 0.2; // fraction of the remaining distance covered each frame
const LINE = 16; // px per "line" when deltaMode is line-based

type ScrollAnim = { top: number; left: number; running: boolean };
const states = new WeakMap<HTMLElement, ScrollAnim>();

const clamp = (v: number, lo: number, hi: number) => (v < lo ? lo : v > hi ? hi : v);

function scrollable(target: EventTarget | null, horizontal: boolean): HTMLElement | null {
  let node = target as HTMLElement | null;
  while (node && node instanceof HTMLElement) {
    const cs = getComputedStyle(node);
    const overflow = horizontal ? cs.overflowX : cs.overflowY;
    const canScroll = horizontal
      ? node.scrollWidth - node.clientWidth > 1
      : node.scrollHeight - node.clientHeight > 1;
    if ((overflow === "auto" || overflow === "scroll" || overflow === "overlay") && canScroll) return node;
    node = node.parentElement;
  }
  return null;
}

function tick(el: HTMLElement) {
  const s = states.get(el);
  if (!s) return;
  // Re-clamp every frame so the loop still settles if the content shrank.
  s.top = clamp(s.top, 0, el.scrollHeight - el.clientHeight);
  s.left = clamp(s.left, 0, el.scrollWidth - el.clientWidth);
  const dy = s.top - el.scrollTop;
  const dx = s.left - el.scrollLeft;
  if (Math.abs(dy) < 0.5 && Math.abs(dx) < 0.5) {
    el.scrollTop = s.top;
    el.scrollLeft = s.left;
    states.delete(el);
    return;
  }
  el.scrollTop += dy * EASE;
  el.scrollLeft += dx * EASE;
  requestAnimationFrame(() => tick(el));
}

function onWheel(e: WheelEvent) {
  if (e.ctrlKey || e.defaultPrevented) return; // zoom / already-handled (ER diagram)
  const horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY);
  const el = scrollable(e.target, horizontal);
  if (!el) return; // nothing scrollable in this axis — leave it native
  let delta = horizontal ? e.deltaX : e.deltaY;
  if (e.deltaMode === 1) delta *= LINE;
  else if (e.deltaMode === 2) delta *= horizontal ? el.clientWidth : el.clientHeight;
  e.preventDefault();
  let s = states.get(el);
  if (!s) {
    s = { top: el.scrollTop, left: el.scrollLeft, running: false };
    states.set(el, s);
  }
  if (horizontal) s.left = clamp(s.left + delta, 0, el.scrollWidth - el.clientWidth);
  else s.top = clamp(s.top + delta, 0, el.scrollHeight - el.clientHeight);
  if (!s.running) {
    s.running = true;
    requestAnimationFrame(() => tick(el));
  }
}

/** Install the global smooth-wheel handler. Returns a disposer. */
export function installSmoothScroll(): () => void {
  window.addEventListener("wheel", onWheel, { passive: false });
  return () => window.removeEventListener("wheel", onWheel);
}
