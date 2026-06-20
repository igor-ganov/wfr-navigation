/** Dispatched when the user requests the previous item. */
export const WFR_PREV: 'wfr-prev' = 'wfr-prev';
/** Dispatched when the user requests the next item. */
export const WFR_NEXT: 'wfr-next' = 'wfr-next';

export type WfrPrevEvent = CustomEvent<undefined>;
export type WfrNextEvent = CustomEvent<undefined>;

declare global {
  interface HTMLElementEventMap {
    'wfr-prev': WfrPrevEvent;
    'wfr-next': WfrNextEvent;
  }
}
