/**
 * Browser events that count as user activity across ALL ERP modules.
 * Shared by global activity tracker and idle timeout (SAP/Odoo enterprise pattern).
 */
export const GLOBAL_SESSION_ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
  'mousemove',
  'mousedown',
  'keydown',
  'input',
  'focusin',
  'paste',
  'touchstart',
  'scroll',
  'click',
  'wheel',
  'pointerdown',
  'compositionstart',
  'compositionupdate',
];
