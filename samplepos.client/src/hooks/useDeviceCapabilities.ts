/**
 * Device capabilities hook — layout tier + hardware/runtime signals.
 * Presentation only; does not call business APIs.
 */

import { useEffect, useMemo, useState } from 'react';
import { useLayoutTier } from './useLayoutTier';
import { useMediaQuery } from './useMediaQuery';
import {
  detectDeviceCapabilityExtras,
  withDeviceCapabilityExtras,
  type DeviceCapabilities,
  type PrinterCapability,
} from '../lib/deviceCapabilities';
import { LOCAL_PRINT_BRIDGE_ORIGIN } from '../lib/localPrintBridge';

async function probeLocalPrintBridgeOnline(timeoutMs = 400): Promise<boolean> {
  if (typeof fetch === 'undefined') return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${LOCAL_PRINT_BRIDGE_ORIGIN}/printers`, {
      method: 'GET',
      signal: controller.signal,
      cache: 'no-store',
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Capability-driven device profile for adaptive workspaces.
 * Composes `useLayoutTier` — never forks viewport math.
 */
export function useDeviceCapabilities(): DeviceCapabilities {
  const layout = useLayoutTier();
  const isStandalone = useMediaQuery('(display-mode: standalone)');
  const [isOffline, setIsOffline] = useState(
    () => (typeof navigator !== 'undefined' ? !navigator.onLine : false),
  );
  const [localBridgeOnline, setLocalBridgeOnline] = useState(false);

  useEffect(() => {
    const onOnline = () => setIsOffline(false);
    const onOffline = () => setIsOffline(true);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    setIsOffline(!navigator.onLine);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Only probe when Sunmi is absent — Sunmi already wins printer SSOT.
    const host = window as unknown as { SunmiPrinter?: unknown };
    if (typeof host.SunmiPrinter !== 'undefined') {
      setLocalBridgeOnline(false);
      return;
    }
    void probeLocalPrintBridgeOnline().then((online) => {
      if (!cancelled) setLocalBridgeOnline(online);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(() => {
    const detected = detectDeviceCapabilityExtras(
      typeof window !== 'undefined' ? (window as never) : null,
      { localBridgeOnline, isOffline },
    );
    // Standalone from live matchMedia hook (more reactive than one-shot detect)
    const printer: PrinterCapability = detected.printer;
    return withDeviceCapabilityExtras(layout, {
      ...detected,
      isStandalone,
      isOffline,
      printer,
    });
  }, [layout, isStandalone, isOffline, localBridgeOnline]);
}
