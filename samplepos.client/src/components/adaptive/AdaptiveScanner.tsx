import { useCallback, useEffect, useRef, useState } from 'react';
import {
  useAdaptiveDeviceCapabilitiesOptional,
  useAdaptiveLayoutOptional,
} from './AdaptiveAppShell';
import { AdaptiveDialog } from './AdaptiveDialog';
import { useBarcodeScanner } from '../../hooks/useBarcodeScanner';
import { resolveScannerMode } from '../../lib/adaptiveFloorplan';
import BarcodeScannerIndicator from '../barcode/BarcodeScannerIndicator';
import type { DeviceCapabilities } from '../../lib/deviceCapabilities';

type AdaptiveScannerProps = {
  /** Same callback for HID wedge and camera — parent runs product lookup / commands. */
  onScan: (barcode: string) => void;
  enabled?: boolean;
  minLength?: number;
  maxLength?: number;
  timeout?: number;
  className?: string;
  /** Hide the status chip (still listens when enabled). */
  showIndicator?: boolean;
  /** Force camera affordance visibility (tests). */
  forceCameraAffordance?: boolean;
};

type BarcodeDetectorLike = {
  detect: (source: ImageBitmapSource) => Promise<Array<{ rawValue?: string }>>;
};

function getBarcodeDetectorCtor():
  | (new (opts?: { formats?: string[] }) => BarcodeDetectorLike)
  | null {
  const w = window as unknown as {
    BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike;
  };
  return typeof w.BarcodeDetector === 'function' ? w.BarcodeDetector : null;
}

/**
 * Adaptive scanner surface: HID keyboard-wedge (existing hook) + optional camera.
 * Emits barcodes only — never looks up products or calls sale APIs.
 */
export function AdaptiveScanner({
  onScan,
  enabled = true,
  minLength = 3,
  maxLength = 50,
  timeout = 100,
  className = '',
  showIndicator = true,
  forceCameraAffordance,
}: AdaptiveScannerProps) {
  const layout = useAdaptiveLayoutOptional();
  const deviceCaps = useAdaptiveDeviceCapabilitiesOptional();

  const capsForMode: Pick<
    DeviceCapabilities,
    'hasCamera' | 'hasBarcodeDetector' | 'touchFirst' | 'tier'
  > = {
    hasCamera: deviceCaps?.hasCamera ?? false,
    hasBarcodeDetector: deviceCaps?.hasBarcodeDetector ?? false,
    touchFirst: deviceCaps?.touchFirst ?? layout?.touchFirst ?? false,
    tier: deviceCaps?.tier ?? layout?.tier ?? 'desktop',
  };

  const mode = resolveScannerMode(capsForMode);
  const showCamera =
    forceCameraAffordance ??
    (mode === 'hid-and-camera' || mode === 'camera-preferred');

  const stableOnScan = useCallback(
    (code: string) => {
      const trimmed = code.trim();
      if (trimmed) onScan(trimmed);
    },
    [onScan],
  );

  const { buffer, lastScannedBarcode } = useBarcodeScanner({
    onScan: stableOnScan,
    minLength,
    maxLength,
    timeout,
    enabled,
  });

  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const stopCamera = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (!cameraOpen) {
      stopCamera();
      return;
    }

    let cancelled = false;
    setCameraError(null);

    async function start() {
      const Detector = getBarcodeDetectorCtor();
      if (!Detector) {
        setCameraError('Camera barcode scanning is not supported in this browser.');
        return;
      }
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraError('Camera access is not available on this device.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();

        const detector = new Detector({
          formats: ['ean_13', 'ean_8', 'code_128', 'qr_code', 'upc_a', 'upc_e'],
        });

        const tick = async () => {
          if (cancelled || !videoRef.current) return;
          try {
            if (video.readyState >= 2) {
              const codes = await detector.detect(video);
              const raw = codes[0]?.rawValue?.trim();
              if (raw && raw.length >= minLength) {
                stableOnScan(raw);
                setCameraOpen(false);
                return;
              }
            }
          } catch {
            // transient detect errors — keep looping
          }
          rafRef.current = requestAnimationFrame(() => {
            void tick();
          });
        };
        rafRef.current = requestAnimationFrame(() => {
          void tick();
        });
      } catch {
        setCameraError('Unable to open the camera. Check permissions and try again.');
      }
    }

    void start();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [cameraOpen, minLength, stableOnScan, stopCamera]);

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-2 ${className}`.trim()}
      data-adaptive-scanner="true"
      data-scanner-mode={mode}
      data-scanner-enabled={enabled ? 'true' : 'false'}
    >
      {showIndicator ? (
        <BarcodeScannerIndicator
          enabled={enabled}
          lastScanned={lastScannedBarcode}
          buffer={buffer}
        />
      ) : null}

      {showCamera ? (
        <button
          type="button"
          disabled={!enabled}
          onClick={() => setCameraOpen(true)}
          className="inline-flex items-center justify-center rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 min-h-[var(--layout-touch-target)] hover:bg-stone-50 disabled:opacity-50"
          data-adaptive-scanner-camera="true"
          aria-label="Scan with camera"
        >
          Camera
        </button>
      ) : null}

      <AdaptiveDialog
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        title="Scan barcode"
        description="Point the camera at a barcode. The same lookup runs as a hardware scanner."
        size="md"
      >
        <div className="space-y-3" data-adaptive-scanner-camera-panel="true">
          {cameraError ? (
            <p className="text-sm text-red-700" role="alert">
              {cameraError}
            </p>
          ) : (
            <video
              ref={videoRef}
              className="w-full max-h-[50vh] rounded-md bg-black object-cover"
              muted
              playsInline
            />
          )}
        </div>
      </AdaptiveDialog>
    </div>
  );
}
