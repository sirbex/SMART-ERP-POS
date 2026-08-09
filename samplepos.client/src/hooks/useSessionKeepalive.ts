/**
 * Proactive access-token refresh while the user is actively working.
 *
 * Problem: access tokens expire in ~15 min but PO/data-entry can run 30–120+ min
 * with no API calls until save — then refresh races or 401 handlers log the user out.
 *
 * Solution: refresh in the background every KEEPALIVE_INTERVAL_MS when the user
 * had recent activity or a transaction guard (PO modal) is open.
 */

import { useEffect, useRef } from 'react';
import {
  getRefreshToken,
  getAccessToken,
  isTokenExpired,
  willExpireInNext,
  refreshAccessTokenDeduped,
  forceLogoutRedirect,
} from './useTokenRefresh';
import { shouldKeepSessionAlive, touchSessionActivity, ACTIVE_SESSION_WINDOW_MS } from '../lib/sessionActivity';
import { getAuthState } from '../lib/authStateMachine';

/** Check every 4 minutes; refresh if token expires within 5 minutes. */
const KEEPALIVE_INTERVAL_MS = 4 * 60 * 1000;
const REFRESH_WITHIN_MINUTES = 5;
/** Same window as idle timeout — keep heartbeat while user is working (Odoo/SAP pattern). */
const ACTIVE_WINDOW_MS = ACTIVE_SESSION_WINDOW_MS;

export function useSessionKeepalive(enabled: boolean): void {
  const tickingRef = useRef(false);

  useEffect(() => {
    if (!enabled) return;

    touchSessionActivity();

    const tick = async () => {
      if (tickingRef.current || !navigator.onLine) return;
      if (getAuthState() === 'EXPIRED') return;
      if (!getRefreshToken()) return;
      if (!shouldKeepSessionAlive(ACTIVE_WINDOW_MS)) return;

      const needsRefresh =
        isTokenExpired() || willExpireInNext(REFRESH_WITHIN_MINUTES);
      if (!needsRefresh) return;

      tickingRef.current = true;
      try {
        await refreshAccessTokenDeduped();
      } catch {
        // Definitive death already forceLogoutRedirects inside _refreshOnce.
        // Network/5xx must NOT logout here (enterprise preserve).
        if (getAuthState() === 'EXPIRED' || (!getAccessToken() && !getRefreshToken())) {
          forceLogoutRedirect('keepalive_session_dead');
        }
      } finally {
        tickingRef.current = false;
      }
    };

    const id = window.setInterval(() => {
      void tick();
    }, KEEPALIVE_INTERVAL_MS);

    // Run once soon after mount when resuming a long form session
    void tick();

    return () => window.clearInterval(id);
  }, [enabled]);
}
