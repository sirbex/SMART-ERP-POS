import { useState, type ReactNode } from 'react';
import {
  useAdaptiveDeviceCapabilitiesOptional,
  useAdaptiveLayoutOptional,
  useAdaptiveWorkspaceOptional,
} from './AdaptiveAppShell';
import { AdaptiveDialog } from './AdaptiveDialog';
import {
  resolveFloorplanFromWorkspace,
  type AdaptivePrintPreviewPresentation,
} from '../../lib/adaptiveFloorplan';
import { printHtmlDocument, type ReceiptData, printReceipt } from '../../lib/print';
import type { PrinterCapability } from '../../lib/deviceCapabilities';

type AdaptivePrintPreviewProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: ReactNode;
  /** Visual preview (HTML string rendered in a sandboxed iframe, or custom node). */
  previewHtml?: string;
  preview?: ReactNode;
  /**
   * When set, Print uses the existing receipt strategy chain (Sunmi → bridge → browser).
   * Prefer this for POS receipts so payload builders stay shared.
   */
  receipt?: ReceiptData;
  /** Generic HTML document print (reports / letters) via printHtmlDocument. */
  documentHtml?: string;
  /** Custom print handler — use when the parent already owns the print command. */
  onPrint?: () => void | Promise<void>;
  className?: string;
  presentationOverride?: AdaptivePrintPreviewPresentation;
};

function printerLabel(printer: PrinterCapability | undefined): string {
  switch (printer) {
    case 'sunmi':
      return 'Sunmi printer bridge';
    case 'local-bridge':
      return 'Local print agent';
    case 'browser':
      return 'Browser print';
    case 'none':
      return 'No printer detected';
    default:
      return 'Auto (print service)';
  }
}

/**
 * Adaptive print preview chrome.
 * Print execution reuses lib/print.ts — no new print backends or APIs.
 */
export function AdaptivePrintPreview({
  open,
  onOpenChange,
  title = 'Print preview',
  previewHtml,
  preview,
  receipt,
  documentHtml,
  onPrint,
  className = '',
  presentationOverride,
}: AdaptivePrintPreviewProps) {
  const layout = useAdaptiveLayoutOptional();
  const workspace = useAdaptiveWorkspaceOptional();
  const deviceCaps = useAdaptiveDeviceCapabilitiesOptional();
  const floorplan = resolveFloorplanFromWorkspace(workspace, layout?.tier ?? 'desktop');
  const presentation =
    presentationOverride ?? floorplan.printPreviewPresentation;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printer = deviceCaps?.printer;

  async function handlePrint() {
    setError(null);
    setBusy(true);
    try {
      if (onPrint) {
        await onPrint();
      } else if (receipt) {
        await printReceipt(receipt);
      } else if (documentHtml) {
        await printHtmlDocument(documentHtml);
      } else if (previewHtml) {
        await printHtmlDocument(previewHtml);
      } else {
        throw new Error('Nothing to print — provide receipt, documentHtml, or onPrint.');
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Print failed');
    } finally {
      setBusy(false);
    }
  }

  const body = (
    <div
      className={`space-y-3 ${className}`.trim()}
      data-adaptive-print-preview="true"
      data-print-presentation={presentation}
      data-printer-capability={printer ?? 'unknown'}
    >
      <p className="text-xs text-stone-500" data-adaptive-print-strategy="true">
        Output: {printerLabel(printer)}
      </p>

      {preview ? (
        <div data-adaptive-print-preview-custom="true">{preview}</div>
      ) : previewHtml ? (
        <iframe
          title="Print preview"
          sandbox=""
          srcDoc={previewHtml}
          className="h-[50vh] w-full rounded-md border border-stone-200 bg-white"
          data-adaptive-print-preview-frame="true"
        />
      ) : (
        <p className="text-sm text-stone-600">No preview content.</p>
      )}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );

  return (
    <AdaptiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description="Preview uses the same print service as POS and reports."
      size={presentation === 'modal' ? 'lg' : 'md'}
      footer={
        <div className="flex flex-wrap justify-end gap-2 w-full">
          <button
            type="button"
            className="rounded-md border border-stone-200 bg-white px-3 text-sm font-medium text-stone-700 min-h-[var(--layout-touch-target)]"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-blue-600 px-3 text-sm font-medium text-white min-h-[var(--layout-touch-target)] hover:bg-blue-700 disabled:opacity-60"
            onClick={() => void handlePrint()}
            disabled={busy}
            data-adaptive-print-confirm="true"
          >
            {busy ? 'Printing…' : 'Print'}
          </button>
        </div>
      }
    >
      {body}
    </AdaptiveDialog>
  );
}
