/**
 * Persistent PowerShell RAW writer — avoids Add-Type + powershell.exe cold start per ticket.
 */
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import os from 'node:os';
import { assertPrinterExists } from './printers.js';

const HELPER = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class RawPrinterHelper {
  [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Ansi)]
  public class DOCINFOA {
    [MarshalAs(UnmanagedType.LPStr)] public string pDocName;
    [MarshalAs(UnmanagedType.LPStr)] public string pOutputFile;
    [MarshalAs(UnmanagedType.LPStr)] public string pDataType;
  }
  [DllImport("winspool.Drv", EntryPoint="OpenPrinterA", SetLastError=true)]
  public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);
  [DllImport("winspool.Drv", EntryPoint="ClosePrinter", SetLastError=true)]
  public static extern bool ClosePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartDocPrinterA", SetLastError=true)]
  public static extern bool StartDocPrinter(IntPtr hPrinter, Int32 level, [In] DOCINFOA di);
  [DllImport("winspool.Drv", EntryPoint="EndDocPrinter", SetLastError=true)]
  public static extern bool EndDocPrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="StartPagePrinter", SetLastError=true)]
  public static extern bool StartPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="EndPagePrinter", SetLastError=true)]
  public static extern bool EndPagePrinter(IntPtr hPrinter);
  [DllImport("winspool.Drv", EntryPoint="WritePrinter", SetLastError=true)]
  public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, Int32 dwCount, out Int32 dwWritten);
}
"@

function Write-RawBytes([string]$printerName, [string]$docName, [string]$b64) {
  $bytes = [Convert]::FromBase64String($b64)
  if ([string]::IsNullOrWhiteSpace($printerName)) {
    $printerName = (Get-CimInstance Win32_Printer | Where-Object { $_.Default -eq $true } | Select-Object -First 1 -ExpandProperty Name)
  }
  if ([string]::IsNullOrWhiteSpace($printerName)) { throw 'No printer selected for RAW print' }
  $h = [IntPtr]::Zero
  if (-not [RawPrinterHelper]::OpenPrinter($printerName, [ref]$h, [IntPtr]::Zero)) { throw "OpenPrinter failed for $printerName" }
  try {
    $di = New-Object RawPrinterHelper+DOCINFOA
    $di.pDocName = $docName
    $di.pDataType = 'RAW'
    if (-not [RawPrinterHelper]::StartDocPrinter($h, 1, $di)) { throw 'StartDocPrinter failed' }
    try {
      [void][RawPrinterHelper]::StartPagePrinter($h)
      $ptr = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
      try {
        [Runtime.InteropServices.Marshal]::Copy($bytes, 0, $ptr, $bytes.Length)
        $written = 0
        if (-not [RawPrinterHelper]::WritePrinter($h, $ptr, $bytes.Length, [ref]$written)) { throw 'WritePrinter failed' }
        if ($written -ne $bytes.Length) {
          throw ("WritePrinter partial write: $written of $($bytes.Length) bytes")
        }
      } finally {
        [Runtime.InteropServices.Marshal]::FreeHGlobal($ptr)
      }
      [void][RawPrinterHelper]::EndPagePrinter($h)
    } finally {
      [void][RawPrinterHelper]::EndDocPrinter($h)
    }
  } finally {
    [void][RawPrinterHelper]::ClosePrinter($h)
  }
}

Write-Output 'READY'
while ($true) {
  $line = [Console]::In.ReadLine()
  if ($null -eq $line) { break }
  if ($line -eq 'EXIT') { break }
  try {
    $msg = $line | ConvertFrom-Json
    Write-RawBytes -printerName ([string]$msg.printer) -docName ([string]$msg.doc) -b64 ([string]$msg.b64)
    Write-Output ('OK:' + $msg.id)
  } catch {
    Write-Output ('ERR:' + $msg.id + ':' + $_.Exception.Message)
  }
}
`.trim();

type Pending = {
  resolve: () => void;
  reject: (err: Error) => void;
};

let child: ChildProcessWithoutNullStreams | null = null;
let ready: Promise<void> | null = null;
let stdoutBuf = '';
const pending = new Map<string, Pending>();
let reqSeq = 0;

function ensureWorker(): Promise<void> {
  if (os.platform() !== 'win32') {
    return Promise.reject(new Error('RAW ESC/POS print is currently supported on Windows only'));
  }
  if (ready) return ready;

  ready = new Promise<void>((resolve, reject) => {
    const ps = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', HELPER],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] },
    );
    child = ps;
    let settled = false;

    const failAll = (err: Error) => {
      for (const [, p] of pending) p.reject(err);
      pending.clear();
      child = null;
      ready = null;
      if (!settled) {
        settled = true;
        reject(err);
      }
    };

    ps.stdout.setEncoding('utf8');
    ps.stdout.on('data', (chunk: string) => {
      stdoutBuf += chunk;
      let idx: number;
      while ((idx = stdoutBuf.indexOf('\n')) >= 0) {
        const line = stdoutBuf.slice(0, idx).replace(/\r$/, '');
        stdoutBuf = stdoutBuf.slice(idx + 1);
        if (line === 'READY' && !settled) {
          settled = true;
          resolve();
          continue;
        }
        if (line.startsWith('OK:')) {
          const id = line.slice(3);
          const p = pending.get(id);
          if (p) {
            pending.delete(id);
            p.resolve();
          }
        } else if (line.startsWith('ERR:')) {
          const rest = line.slice(4);
          const colon = rest.indexOf(':');
          const id = colon >= 0 ? rest.slice(0, colon) : rest;
          const message = colon >= 0 ? rest.slice(colon + 1) : 'RAW print failed';
          const p = pending.get(id);
          if (p) {
            pending.delete(id);
            p.reject(new Error(message));
          }
        }
      }
    });

    ps.stderr.setEncoding('utf8');
    ps.stderr.on('data', (chunk: string) => {
      if (chunk.trim()) console.error('[raw-worker]', chunk.trim());
    });

    ps.on('exit', (code) => {
      failAll(new Error(`RAW print worker exited (code ${code})`));
    });

    ps.on('error', (err) => {
      failAll(err instanceof Error ? err : new Error(String(err)));
    });
  });

  return ready;
}

export async function writeRawToPrinter(
  raw: Buffer,
  printerName?: string | null,
  docName = 'SMART-RAW',
): Promise<{ assertMs: number; spoolMs: number }> {
  const name = printerName?.trim() || '';
  let assertMs = 0;
  if (name) {
    const a0 = Date.now();
    await assertPrinterExists(name);
    assertMs = Date.now() - a0;
  }

  await ensureWorker();
  if (!child?.stdin.writable) {
    throw new Error('RAW print worker not available');
  }

  const id = `r${++reqSeq}_${Date.now().toString(36)}`;
  const payload = JSON.stringify({
    id,
    printer: name,
    doc: docName,
    b64: raw.toString('base64'),
  });

  const s0 = Date.now();
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      reject(new Error('RAW print timed out (20s)'));
    }, 20_000);
    pending.set(id, {
      resolve: () => {
        clearTimeout(timer);
        resolve();
      },
      reject: (err) => {
        clearTimeout(timer);
        reject(err);
      },
    });
    child!.stdin.write(`${payload}\n`, (err) => {
      if (err) {
        clearTimeout(timer);
        pending.delete(id);
        reject(err);
      }
    });
  });

  return { assertMs, spoolMs: Date.now() - s0 };
}

/** Pre-start PowerShell + Add-Type so the first KOT is not cold. */
export function warmRawPrintWorker(): void {
  if (os.platform() !== 'win32') return;
  void ensureWorker().catch((err) => {
    console.warn('[raw-worker] warm failed', err instanceof Error ? err.message : err);
  });
}
