import { css, html, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { WFR_NEXT, WFR_PREV } from './nav-events';

// Mouse/keyboard reveal the controls on activity; touch is handled separately
// (single tap toggles, horizontal swipe pages) so scrolling never flashes them.
const POINTER_ACTIVITY_EVENTS: readonly string[] = ['pointermove', 'pointerdown'];

// Touch gesture thresholds.
const TAP_MOVE_LIMIT = 10; // px — movement under this counts as a tap
const TAP_TIME_LIMIT = 500; // ms — a tap must be quick
const SWIPE_MIN_DISTANCE = 48; // px — horizontal travel to count as a swipe
const SWIPE_RATIO = 1.4; // horizontal must dominate vertical by this factor
const AXIS_LOCK_THRESHOLD = 8; // px — first movement past this locks the gesture axis

const isEditable = (node: EventTarget | undefined): boolean => {
  if (!(node instanceof HTMLElement)) return false;
  return (
    node.isContentEditable ||
    node.tagName === 'INPUT' ||
    node.tagName === 'TEXTAREA' ||
    node.tagName === 'SELECT'
  );
};

/**
 * Headless paging controls. Renders accessible prev/next buttons.
 *
 * - **Mouse:** controls fade in on hover/movement over `target` and auto-hide
 *   after `hideDelay` ms of inactivity.
 * - **Keyboard:** Left/Right arrows page; focus reveals the controls.
 * - **Touch:** a single tap toggles the controls (tap again to hide); a
 *   horizontal swipe pages (swipe left → next, swipe right → previous). Scrolling
 *   never reveals the controls.
 *
 * Emits bubbling, composed `wfr-prev` / `wfr-next` events.
 */
@customElement('wfr-viewer-nav')
export class WfrViewerNav extends LitElement {
  static override styles = css`
    :host {
      display: contents;
    }
    [part='nav'] {
      display: flex;
      gap: var(--wfr-nav-gap, 0.5rem);
      opacity: 0;
      pointer-events: none;
      transition: opacity var(--wfr-nav-fade, 200ms) ease;
    }
    :host([visible]) [part='nav'] {
      opacity: 1;
      pointer-events: auto;
    }
    button {
      all: unset;
      cursor: pointer;
    }
    button:focus-visible {
      outline: var(--wfr-focus-outline, 2px solid currentColor);
      outline-offset: 2px;
    }
    button[disabled] {
      cursor: default;
      opacity: var(--wfr-nav-disabled-opacity, 0.4);
    }
    @media (prefers-reduced-motion: reduce) {
      [part='nav'] {
        transition: none;
      }
    }
  `;

  /** Whether paging to the previous item is possible. */
  @property({ type: Boolean }) canPrev = false;
  /** Whether paging to the next item is possible. */
  @property({ type: Boolean }) canNext = false;
  /** Idle time in ms before controls auto-hide. 0 keeps them always visible. */
  @property({ type: Number }) hideDelay = 2500;
  /** Whether controls are currently visible (reflected for styling). */
  @property({ type: Boolean, reflect: true }) visible = false;
  /** Element whose activity reveals the controls. Defaults to the parent. */
  @property({ attribute: false }) target: EventTarget | undefined = undefined;

  #boundTarget: EventTarget | undefined = undefined;
  #hideTimer: ReturnType<typeof setTimeout> | undefined = undefined;
  #pointerInside = false;
  #lastInputTouch = false;
  #touchTracking = false;
  #touchOnControl = false;
  #touchStartX = 0;
  #touchStartY = 0;
  #touchStartTime = 0;
  #touchAxis: 'x' | 'y' | undefined = undefined;
  #scrollEl: Element | undefined = undefined;
  #scrollLeftStart = 0;

  override connectedCallback(): void {
    super.connectedCallback();
    this.#bind();
  }

  override disconnectedCallback(): void {
    super.disconnectedCallback();
    this.#unbind();
    this.#clearTimer();
  }

  protected override updated(changed: PropertyValues<this>): void {
    if (changed.has('target')) this.#bind();
  }

  override render(): TemplateResult {
    return html`
      <div part="nav" role="group" aria-label="Pager">
        <button
          part="prev"
          type="button"
          aria-label="Previous"
          ?disabled=${!this.canPrev}
          @click=${this.#emitPrev}
        >
          <slot name="prev">‹</slot>
        </button>
        <button
          part="next"
          type="button"
          aria-label="Next"
          ?disabled=${!this.canNext}
          @click=${this.#emitNext}
        >
          <slot name="next">›</slot>
        </button>
      </div>
    `;
  }

  /** Reveal the controls and (re)start the auto-hide timer. */
  poke = (): void => {
    this.visible = true;
    this.#restartTimer();
  };

  #activityTarget(): EventTarget {
    return this.target ?? this.parentElement ?? this;
  }

  #bind(): void {
    const next = this.#activityTarget();
    if (next === this.#boundTarget) return;
    this.#unbind();
    this.#boundTarget = next;
    for (const name of POINTER_ACTIVITY_EVENTS) {
      next.addEventListener(name, this.#onPointerActivity, { passive: true });
    }
    next.addEventListener('focusin', this.#onFocusIn, { passive: true });
    next.addEventListener('keydown', this.#onKeydown);
    next.addEventListener('pointerenter', this.#onPointerEnter);
    next.addEventListener('pointerleave', this.#onPointerLeave);
    next.addEventListener('touchstart', this.#onTouchStart, { passive: true });
    next.addEventListener('touchmove', this.#onTouchMove, { passive: true });
    next.addEventListener('touchend', this.#onTouchEnd, { passive: true });
  }

  #unbind(): void {
    const bound = this.#boundTarget;
    if (bound === undefined) return;
    for (const name of POINTER_ACTIVITY_EVENTS) {
      bound.removeEventListener(name, this.#onPointerActivity);
    }
    bound.removeEventListener('focusin', this.#onFocusIn);
    bound.removeEventListener('keydown', this.#onKeydown);
    bound.removeEventListener('pointerenter', this.#onPointerEnter);
    bound.removeEventListener('pointerleave', this.#onPointerLeave);
    bound.removeEventListener('touchstart', this.#onTouchStart);
    bound.removeEventListener('touchmove', this.#onTouchMove);
    bound.removeEventListener('touchend', this.#onTouchEnd);
    this.#boundTarget = undefined;
  }

  #restartTimer(): void {
    this.#clearTimer();
    if (this.hideDelay <= 0) return;
    this.#hideTimer = setTimeout(() => {
      if (this.#pointerInside || this.matches(':focus-within')) {
        this.#restartTimer();
        return;
      }
      this.visible = false;
    }, this.hideDelay);
  }

  #clearTimer(): void {
    if (this.#hideTimer !== undefined) clearTimeout(this.#hideTimer);
    this.#hideTimer = undefined;
  }

  #emitPrev = (): void => {
    if (!this.canPrev) return;
    this.dispatchEvent(new CustomEvent(WFR_PREV, { bubbles: true, composed: true }));
  };

  #emitNext = (): void => {
    if (!this.canNext) return;
    this.dispatchEvent(new CustomEvent(WFR_NEXT, { bubbles: true, composed: true }));
  };

  #onKeydown = (event: Event): void => {
    if (!(event instanceof KeyboardEvent) || isEditable(event.target ?? undefined)) return;
    switch (event.key) {
      case 'ArrowLeft':
        this.poke();
        this.#emitPrev();
        return;
      case 'ArrowRight':
        this.poke();
        this.#emitNext();
        return;
      default:
        return;
    }
  };

  /** Reveal on mouse/pen activity only — touch is toggle-driven. */
  #onPointerActivity = (event: Event): void => {
    if (event instanceof PointerEvent && event.pointerType === 'touch') {
      this.#lastInputTouch = true;
      return;
    }
    this.#lastInputTouch = false;
    this.poke();
  };

  /** Reveal on keyboard focus, but not on the focus a tap incidentally causes. */
  #onFocusIn = (): void => {
    if (this.#lastInputTouch) return;
    this.poke();
  };

  #onPointerEnter = (event: Event): void => {
    if (event instanceof PointerEvent && event.pointerType === 'touch') return;
    this.#pointerInside = true;
    this.poke();
  };

  #onPointerLeave = (event: Event): void => {
    if (event instanceof PointerEvent && event.pointerType === 'touch') return;
    this.#pointerInside = false;
    this.#restartTimer();
  };

  #onTouchStart = (event: Event): void => {
    if (!(event instanceof TouchEvent)) return;
    this.#lastInputTouch = true;
    const touch = event.touches.length === 1 ? event.touches[0] : undefined;
    if (touch === undefined) {
      this.#touchTracking = false;
      return;
    }
    this.#touchTracking = true;
    this.#touchAxis = undefined;
    const path = event.composedPath();
    // A tap that begins on the prev/next buttons must not also toggle.
    this.#touchOnControl = path.includes(this);
    // Remember any horizontally-scrollable content under the finger so a swipe
    // that scrolls it (e.g. a wide table) does not also page.
    this.#scrollEl = this.#findScrollableX(path);
    this.#scrollLeftStart = this.#scrollEl?.scrollLeft ?? 0;
    this.#touchStartX = touch.clientX;
    this.#touchStartY = touch.clientY;
    this.#touchStartTime = event.timeStamp;
  };

  /** First horizontally-scrollable element on the touch path, up to the target. */
  #findScrollableX(path: readonly EventTarget[]): Element | undefined {
    for (const node of path) {
      if (node instanceof Element && node.scrollWidth > node.clientWidth + 1) {
        const overflowX = getComputedStyle(node).overflowX;
        if (overflowX === 'auto' || overflowX === 'scroll') return node;
      }
      if (node === this.#boundTarget) break;
    }
    return undefined;
  }

  /** Lock the gesture axis on first movement so a vertical scroll never pages. */
  #onTouchMove = (event: Event): void => {
    if (!(event instanceof TouchEvent) || !this.#touchTracking || this.#touchAxis !== undefined) {
      return;
    }
    const touch = event.touches[0];
    if (touch === undefined) return;
    const dx = Math.abs(touch.clientX - this.#touchStartX);
    const dy = Math.abs(touch.clientY - this.#touchStartY);
    if (dx > AXIS_LOCK_THRESHOLD || dy > AXIS_LOCK_THRESHOLD) {
      this.#touchAxis = dx > dy ? 'x' : 'y';
    }
  };

  #onTouchEnd = (event: Event): void => {
    if (!(event instanceof TouchEvent) || !this.#touchTracking) return;
    this.#touchTracking = false;
    if (this.#touchOnControl) return;
    const touch = event.changedTouches[0];
    if (touch === undefined) return;
    const dx = touch.clientX - this.#touchStartX;
    const dy = touch.clientY - this.#touchStartY;
    const dt = event.timeStamp - this.#touchStartTime;
    const absX = Math.abs(dx);
    const absY = Math.abs(dy);
    // Horizontal swipe → page (left = next, right = previous). Only when the
    // gesture locked to the horizontal axis, so a vertical scroll never pages.
    if (this.#touchAxis === 'x' && absX >= SWIPE_MIN_DISTANCE && absX > absY * SWIPE_RATIO) {
      // If the swipe scrolled horizontally-scrollable content (e.g. a wide
      // table), it was a scroll, not a page turn. When that content can't move
      // (none, or already at the edge) scrollLeft is unchanged → page.
      const scrolled =
        this.#scrollEl !== undefined &&
        Math.abs(this.#scrollEl.scrollLeft - this.#scrollLeftStart) > 2;
      if (scrolled) return;
      if (dx < 0) this.#emitNext();
      else this.#emitPrev();
      return;
    }
    // Quick, near-stationary touch (no axis lock) → toggle the controls.
    if (
      this.#touchAxis === undefined &&
      absX <= TAP_MOVE_LIMIT &&
      absY <= TAP_MOVE_LIMIT &&
      dt <= TAP_TIME_LIMIT
    ) {
      this.#toggle();
    }
  };

  /** Toggle visibility; touch is tap-controlled, so cancel any auto-hide. */
  #toggle = (): void => {
    this.#clearTimer();
    this.visible = !this.visible;
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'wfr-viewer-nav': WfrViewerNav;
  }
}
