/**
 * Idle Timeout Hook
 *
 * Monitors user activity (mouse, keyboard, touch) and triggers
 * a callback after a configurable period of inactivity.
 *
 * Used by AuthContext to auto-logout idle users.
 *
 * Default: 15 minutes idle → logout
 * Warning: Shows a "session expiring" toast 60 seconds before logout
 *
 * SAP/Odoo: peer-tab activity resets this tab's timer; fire-time re-checks
 * isUserActiveOrGuarded so working users are never idle-logged-out.
 */

import { useEffect, useRef, useCallback } from 'react';
import {
  touchSessionActivity,
  ACTIVITY_STORAGE_KEY,
  isUserActiveOrGuarded,
} from '../lib/sessionActivity';
import { IDLE_SESSION_ACTIVITY_EVENTS } from '../lib/sessionActivityEvents';
import { shouldPerformIdleLogout } from '../lib/sessionLogoutPolicy';

/** Events that reset the idle logout timer — deliberate interaction only. */
const ACTIVITY_EVENTS = IDLE_SESSION_ACTIVITY_EVENTS;

/** Default idle threshold in milliseconds (15 minutes) */
const DEFAULT_IDLE_MS = 15 * 60 * 1000;

/** How long before logout to fire the warning callback (60 seconds) */
const WARNING_BEFORE_MS = 60 * 1000;

interface UseIdleTimeoutOptions {
  /** Milliseconds of inactivity before auto-logout (default: 15 min) */
  timeoutMs?: number;
  /** Called when the idle threshold is reached */
  onIdle: () => void;
  /** Called ~60s before logout so UI can warn the user (optional) */
  onWarning?: () => void;
  /** Set false to disable (e.g. when not authenticated) */
  enabled?: boolean;
}

export function useIdleTimeout({
  timeoutMs = DEFAULT_IDLE_MS,
  onIdle,
  onWarning,
  enabled = true,
}: UseIdleTimeoutOptions): void {
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningFiredRef = useRef(false);

  // Stable refs so we don't re-attach listeners on every render
  const onIdleRef = useRef(onIdle);
  const onWarningRef = useRef(onWarning);
  onIdleRef.current = onIdle;
  onWarningRef.current = onWarning;

  const resetTimers = useCallback(() => {
    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
    warningFiredRef.current = false;

    const warningDelay = Math.max(timeoutMs - WARNING_BEFORE_MS, 0);
    if (onWarningRef.current && warningDelay > 0) {
      warningTimerRef.current = setTimeout(() => {
        warningFiredRef.current = true;
        onWarningRef.current?.();
      }, warningDelay);
    }

    // Re-check activity at fire time — peer tab may still be working.
    idleTimerRef.current = setTimeout(() => {
      if (!shouldPerformIdleLogout(isUserActiveOrGuarded(timeoutMs))) {
        resetTimers();
        return;
      }
      onIdleRef.current();
    }, timeoutMs);
  }, [timeoutMs]);

  useEffect(() => {
    if (!enabled) return;

    let hiddenAt: number | null = null;
    let idleStartedAt = Date.now();

    resetTimers();

    const handleActivity = () => {
      touchSessionActivity();
      idleStartedAt = Date.now();
      resetTimers();
    };

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, handleActivity, { passive: true });
    }

    // Peer tab activity must reset THIS tab's idle clock (Odoo multi-tab).
    const handlePeerActivity = (e: StorageEvent) => {
      if (e.key !== ACTIVITY_STORAGE_KEY || !e.newValue) return;
      idleStartedAt = Date.now();
      resetTimers();
    };
    window.addEventListener('storage', handlePeerActivity);

    const scheduleIdleFire = (delayMs: number) => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      idleTimerRef.current = setTimeout(() => {
        if (!shouldPerformIdleLogout(isUserActiveOrGuarded(timeoutMs))) {
          idleStartedAt = Date.now();
          resetTimers();
          return;
        }
        onIdleRef.current();
      }, delayMs);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
      } else if (document.visibilityState === 'visible') {
        if (hiddenAt) {
          const totalIdle = Date.now() - idleStartedAt;
          const remaining = timeoutMs - totalIdle;
          if (remaining <= 0) {
            if (!shouldPerformIdleLogout(isUserActiveOrGuarded(timeoutMs))) {
              idleStartedAt = Date.now();
              resetTimers();
            } else {
              onWarningRef.current?.();
              scheduleIdleFire(WARNING_BEFORE_MS);
            }
          } else if (remaining <= WARNING_BEFORE_MS) {
            onWarningRef.current?.();
            scheduleIdleFire(remaining);
          } else {
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
            warningFiredRef.current = false;
            warningTimerRef.current = setTimeout(() => {
              warningFiredRef.current = true;
              onWarningRef.current?.();
            }, remaining - WARNING_BEFORE_MS);
            scheduleIdleFire(remaining);
          }
        } else {
          resetTimers();
        }
        hiddenAt = null;
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, handleActivity);
      }
      window.removeEventListener('storage', handlePeerActivity);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [enabled, resetTimers, timeoutMs]);
}
