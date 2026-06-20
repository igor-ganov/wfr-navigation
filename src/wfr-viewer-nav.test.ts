import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import './wfr-viewer-nav';
import { type WfrViewerNav } from './wfr-viewer-nav';
import { WFR_NEXT, WFR_PREV } from './nav-events';

const mountInTarget = async (
  props: Partial<WfrViewerNav> = {},
): Promise<{ nav: WfrViewerNav; target: HTMLElement }> => {
  const target = document.createElement('div');
  const nav = document.createElement('wfr-viewer-nav');
  Object.assign(nav, { canPrev: true, canNext: true, ...props });
  target.append(nav);
  document.body.append(target);
  await nav.updateComplete;
  return { nav, target };
};

const button = (nav: WfrViewerNav, part: 'prev' | 'next'): HTMLButtonElement | null =>
  nav.shadowRoot?.querySelector(`[part="${part}"]`) ?? null;

beforeEach(() => vi.useFakeTimers());

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('paging events', () => {
  it('emits wfr-prev / wfr-next on button click when enabled', async () => {
    const { nav } = await mountInTarget();
    const prev = vi.fn();
    const next = vi.fn();
    nav.addEventListener(WFR_PREV, prev);
    nav.addEventListener(WFR_NEXT, next);
    button(nav, 'prev')?.click();
    button(nav, 'next')?.click();
    expect(prev).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledOnce();
  });

  it('disables buttons and suppresses events at the edges', async () => {
    const { nav } = await mountInTarget({ canPrev: false, canNext: true });
    const prev = vi.fn();
    nav.addEventListener(WFR_PREV, prev);
    expect(button(nav, 'prev')?.disabled).toBe(true);
    button(nav, 'prev')?.click();
    expect(prev).not.toHaveBeenCalled();
  });

  it('pages with Left/Right arrow keys on the target', async () => {
    const { nav, target } = await mountInTarget();
    const prev = vi.fn();
    const next = vi.fn();
    nav.addEventListener(WFR_PREV, prev);
    nav.addEventListener(WFR_NEXT, next);
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    expect(next).toHaveBeenCalledOnce();
    expect(prev).toHaveBeenCalledOnce();
  });
});

describe('auto-hide visibility', () => {
  it('reveals on activity and hides after the idle delay', async () => {
    const { nav, target } = await mountInTarget({ hideDelay: 1000 });
    expect(nav.visible).toBe(false);
    target.dispatchEvent(new Event('pointermove'));
    expect(nav.visible).toBe(true);
    vi.advanceTimersByTime(1000);
    expect(nav.visible).toBe(false);
  });

  it('stays visible while the pointer is inside the target', async () => {
    const { nav, target } = await mountInTarget({ hideDelay: 1000 });
    target.dispatchEvent(new Event('pointerenter'));
    expect(nav.visible).toBe(true);
    vi.advanceTimersByTime(5000);
    expect(nav.visible).toBe(true);
  });

  it('never hides when hideDelay is 0', async () => {
    const { nav } = await mountInTarget({ hideDelay: 0 });
    nav.poke();
    expect(nav.visible).toBe(true);
    vi.advanceTimersByTime(100000);
    expect(nav.visible).toBe(true);
  });
});
