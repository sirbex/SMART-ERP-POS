/**
 * Idle Timeout Hook
 *
 * Monitors user activity (mouse, keyboard, touch, scroll) and triggers
 * a callback after a configurable period of inactivity.
 *
 * Used by AuthContext to auto-logout idle users.
 *
 * Default: 15 minutes idle → logout
 * Warning: Shows a "session expiring" toast 60 seconds before logout
 */

import { useEffect, useRef, useCallback } from 'react';

/** Events that count as "user activity" */
const ACTIVITY_EVENTS: (keyof WindowEventMap)[] = [
    'mousemove',
    'mousedown',
    'keydown',
    'touchstart',
    'scroll',
    'click',
    'wheel',        // trackpad / mouse-wheel scroll (bubbles, unlike scroll)
    'pointerdown',  // covers stylus / pen input not caught by mouse/touch
];

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
        // Clear existing timers
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        if (warningTimerRef.current) clearTimeout(warningTimerRef.current);
        warningFiredRef.current = false;

        // Set warning timer (fires WARNING_BEFORE_MS before the idle timer)
        const warningDelay = Math.max(timeoutMs - WARNING_BEFORE_MS, 0);
        if (onWarningRef.current && warningDelay > 0) {
            warningTimerRef.current = setTimeout(() => {
                warningFiredRef.current = true;
                onWarningRef.current?.();
            }, warningDelay);
        }

        // Set idle timer
        idleTimerRef.current = setTimeout(() => {
            onIdleRef.current();
        }, timeoutMs);
    }, [timeoutMs]);

    useEffect(() => {
        if (!enabled) return;

        // Track when the tab was last hidden so we can detect long absences
        let hiddenAt: number | null = null;

        // Start timers initially
        resetTimers();

        // Reset on any user activity
        const handleActivity = () => resetTimers();

        for (const event of ACTIVITY_EVENTS) {
            window.addEventListener(event, handleActivity, { passive: true });
        }

        // Visibility change: if user was away longer than timeout, logout immediately
        const handleVisibilityChange = () => {
            if (document.visibilityState === 'hidden') {
                hiddenAt = Date.now();
            } else if (document.visibilityState === 'visible') {
                if (hiddenAt && Date.now() - hiddenAt >= timeoutMs) {
                    // Tab was hidden longer than idle threshold → fire immediately
                    onIdleRef.current();
                } else {
                    // Tab was hidden briefly → reset (user came back quickly)
                    resetTimers();
                }
                hiddenAt = null;
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            // Cleanup
            if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
            if (warningTimerRef.current) clearTimeout(warningTimerRef.current);

            for (const event of ACTIVITY_EVENTS) {
                window.removeEventListener(event, handleActivity);
            }
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [enabled, resetTimers, timeoutMs]);
}
