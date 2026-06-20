import { css, html, LitElement, type PropertyValues, type TemplateResult } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { WFR_NEXT, WFR_PREV } from './nav-events';

const ACTIVITY_EVENTS: readonly string[] = ['pointermove', 'pointerdown', 'touchstart', 'focusin'];

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
 * Headless paging controls. Renders accessible prev/next buttons that fade in on
 * hover/tap/focus over a `target` (defaults to the parent element) and auto-hide
 * after `hideDelay` ms of inactivity. Left/Right arrows page while the target is
 * active. Emits bubbling, composed `wfr-prev` / `wfr-next` events.
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
    for (const name of ACTIVITY_EVENTS) {
      next.addEventListener(name, this.poke, { passive: true });
    }
    next.addEventListener('keydown', this.#onKeydown);
    next.addEventListener('pointerenter', this.#onPointerEnter);
    next.addEventListener('pointerleave', this.#onPointerLeave);
  }

  #unbind(): void {
    const bound = this.#boundTarget;
    if (bound === undefined) return;
    for (const name of ACTIVITY_EVENTS) bound.removeEventListener(name, this.poke);
    bound.removeEventListener('keydown', this.#onKeydown);
    bound.removeEventListener('pointerenter', this.#onPointerEnter);
    bound.removeEventListener('pointerleave', this.#onPointerLeave);
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

  #onPointerEnter = (): void => {
    this.#pointerInside = true;
    this.poke();
  };

  #onPointerLeave = (): void => {
    this.#pointerInside = false;
    this.#restartTimer();
  };
}

declare global {
  interface HTMLElementTagNameMap {
    'wfr-viewer-nav': WfrViewerNav;
  }
}
