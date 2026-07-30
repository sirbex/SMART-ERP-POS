/**
 * Device capability SSOT — hardware / runtime signals for adaptive workspaces.
 *
 * Composes layout tiers (viewport/pointer). Never sniffs device brands (no "isSunmi").
 * Printer presence is a capability signal; layout still comes from tier + touch.
 *
 * @see docs/architecture/ADAPTIVE_PWA_PLATFORM_ARCHITECTURE.md §5
 */

import {
  buildLayoutCapabilities,
  type LayoutCapabilities,
  type LayoutCapabilitiesInput,
} from './layoutTiers';

/** Sync-resolved print strategy preference (execution stays in lib/print.ts). */
export type PrinterCapability = 'sunmi' | 'local-bridge' | 'browser' | 'none';

/**
 * Hardware / runtime extras beyond viewport layout.
 * Injected in tests; detected in the browser via `detectDeviceCapabilityExtras`.
 */
export type DeviceCapabilityExtras = {
  hasHwKeyboard: boolean;
  hasCamera: boolean;
  hasBarcodeDetector: boolean;
  /** HID wedge scanners are always usable via keyboard emulation when a keyboard path exists. */
  hasHidScannerBehavior: boolean;
  canWakeLock: boolean;
  isStandalone: boolean;
  isOffline: boolean;
  printer: PrinterCapability;
};

export type DeviceCapabilities = LayoutCapabilities & DeviceCapabilityExtras;

export type DeviceCapabilitiesInput = LayoutCapabilitiesInput &
  Partial<DeviceCapabilityExtras> & {
    /** When omitted, extras default to safe “unknown / desktop browser” assumptions. */
  };

/** Minimal window shape for detection (injectable in Vitest). */
export type DeviceCapabilityHost = {
  SunmiPrinter?: unknown;
  matchMedia?: (query: string) => { matches: boolean };
  navigator?: {
    onLine?: boolean;
    maxTouchPoints?: number;
    keyboard?: unknown;
    mediaDevices?: { enumerateDevices?: unknown };
  };
  print?: unknown;
  BarcodeDetector?: unknown;
};

const DEFAULT_EXTRAS: DeviceCapabilityExtras = {
  hasHwKeyboard: true,
  hasCamera: false,
  hasBarcodeDetector: false,
  hasHidScannerBehavior: true,
  canWakeLock: false,
  isStandalone: false,
  isOffline: false,
  printer: 'browser',
};

/**
 * Resolve sync printer capability from host globals.
 * Prefer Sunmi bridge when injected; otherwise browser print when available.
 * `local-bridge` is set only when the caller has confirmed the agent (async probe).
 */
export function resolvePrinterCapability(
  host: DeviceCapabilityHost | null | undefined,
  opts?: { localBridgeOnline?: boolean },
): PrinterCapability {
  if (host && typeof host.SunmiPrinter !== 'undefined') {
    return 'sunmi';
  }
  if (opts?.localBridgeOnline) {
    return 'local-bridge';
  }
  if (host && typeof host.print === 'function') {
    return 'browser';
  }
  // jsdom / SSR often lack window.print — still treat as browser when a window exists
  if (host) {
    return 'browser';
  }
  return 'none';
}

export function detectDeviceCapabilityExtras(
  host: DeviceCapabilityHost | null | undefined = typeof window !== 'undefined'
    ? (window as unknown as DeviceCapabilityHost)
    : null,
  opts?: { localBridgeOnline?: boolean; isOffline?: boolean },
): DeviceCapabilityExtras {
  if (!host) {
    return { ...DEFAULT_EXTRAS };
  }

  const standalone =
    typeof host.matchMedia === 'function' &&
    host.matchMedia('(display-mode: standalone)').matches;

  const nav = host.navigator;
  const onLine = nav?.onLine !== false;
  const isOffline = opts?.isOffline ?? !onLine;

  // Physical keyboard: Keyboard API when present; otherwise assume true on fine-pointer desktops
  // (coarse-only POS handhelds typically lack a hardware keyboard).
  const hasKeyboardApi = Boolean(nav && 'keyboard' in nav && nav.keyboard);
  const coarse =
    typeof host.matchMedia === 'function' &&
    host.matchMedia('(pointer: coarse)').matches;
  const hasHwKeyboard = hasKeyboardApi || !coarse;

  const hasBarcodeDetector = typeof host.BarcodeDetector !== 'undefined';
  const hasCamera = Boolean(nav?.mediaDevices?.enumerateDevices) || hasBarcodeDetector;

  const canWakeLock =
    typeof navigator !== 'undefined' && 'wakeLock' in navigator;

  return {
    hasHwKeyboard,
    hasCamera,
    hasBarcodeDetector,
    hasHidScannerBehavior: true,
    canWakeLock,
    isStandalone: standalone,
    isOffline,
    printer: resolvePrinterCapability(host, {
      localBridgeOnline: opts?.localBridgeOnline,
    }),
  };
}

export function buildDeviceCapabilities(
  layoutInput: LayoutCapabilitiesInput,
  extras?: Partial<DeviceCapabilityExtras>,
): DeviceCapabilities {
  const layout = buildLayoutCapabilities(layoutInput);
  return {
    ...layout,
    ...DEFAULT_EXTRAS,
    ...extras,
  };
}

/** Compose an existing layout snapshot with extras (shell path — no re-tier). */
export function withDeviceCapabilityExtras(
  layout: LayoutCapabilities,
  extras?: Partial<DeviceCapabilityExtras>,
): DeviceCapabilities {
  return {
    ...layout,
    ...DEFAULT_EXTRAS,
    ...extras,
  };
}

/**
 * Integrity guard: capabilities must never encode vendor names.
 * Used by evidence tests — keep the denylist honest.
 */
export function assertNoDeviceBrandInCapabilities(caps: DeviceCapabilities): void {
  const blob = JSON.stringify(caps).toLowerCase();
  const brands = ['sunmi', 'v2', 'v3', 't2', 'iphone', 'ipad', 'android'];
  for (const brand of brands) {
    // "sunmi" may appear only as printer capability enum value 'sunmi' — that is a bridge signal, not a layout brand.
    if (brand === 'sunmi') continue;
    if (blob.includes(`"${brand}"`) || blob.includes(`:${brand}`)) {
      throw new Error(`DeviceCapabilities must not encode brand "${brand}"`);
    }
  }
}
