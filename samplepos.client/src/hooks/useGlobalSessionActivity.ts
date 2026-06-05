/**
 * Global activity tracker — runs for the entire authenticated app.
 *
 * Unlike idle timeout (which can be paused by transaction guard), this hook
 * ALWAYS records input across every module/screen/tab so keepalive and logout
 * policy see real user activity (SAP/Odoo enterprise rule).
 */

import { useEffect } from 'react';
import {
  touchSessionActivity,
  initCrossTabActivitySync,
  GLOBAL_SESSION_ACTIVITY_EVENTS,
} from '../lib/sessionActivity';

export function useGlobalSessionActivity(enabled: boolean): void {
  useEffect(() => {
    if (!enabled) return;

    touchSessionActivity();
    const cleanupSync = initCrossTabActivitySync();

    const onActivity = () => touchSessionActivity();

    for (const event of GLOBAL_SESSION_ACTIVITY_EVENTS) {
      window.addEventListener(event, onActivity, { passive: true });
    }

    return () => {
      cleanupSync();
      for (const event of GLOBAL_SESSION_ACTIVITY_EVENTS) {
        window.removeEventListener(event, onActivity);
      }
    };
  }, [enabled]);
}
