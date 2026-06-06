/**
 * Browser events that count as user activity across ALL ERP modules.
 *
 * SAP/Odoo idle timeout: only deliberate interaction resets the logout timer.
 * Passive events (mousemove, scroll, wheel) do NOT count — they keep sessions
 * alive forever when the user walks away with the mouse on the desk.
 */
export const IDLE_SESSION_ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousedown',
  'keydown',
  'input',
  'click',
  'touchstart',
  'pointerdown',
  'paste',
  'compositionstart',
  'compositionupdate',
];

/** @deprecated Use IDLE_SESSION_ACTIVITY_EVENTS — kept for test imports during transition */
export const GLOBAL_SESSION_ACTIVITY_EVENTS = IDLE_SESSION_ACTIVITY_EVENTS;
