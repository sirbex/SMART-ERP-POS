import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  cpSync,
  createWriteStream,
  statSync,
} from 'node:fs';
import { spawn, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pipeline } from 'node:stream/promises';

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export type ProductPaths = {
  productRoot: string;
  printServiceDir: string;
  printServiceExe: string;
  versionFile: string;
  updateStaging: string;
};

export function resolvePaths(): ProductPaths {
  // Service Helper\app\dist → Service Helper → product root
  const helperRoot = path.resolve(__dirname, '..', '..');
  const inferredProduct = path.resolve(helperRoot, '..');
  const root = process.env.SMART_PRODUCT_ROOT
    ? process.env.SMART_PRODUCT_ROOT
    : existsSync(path.join(inferredProduct, 'Print Service'))
      ? inferredProduct
      : helperRoot;

  const printServiceDir = process.env.SMART_PRINT_SERVICE_DIR || path.join(root, 'Print Service');
  return {
    productRoot: root,
    printServiceDir,
    printServiceExe: path.join(printServiceDir, 'SMART Print Service.exe'),
    versionFile: path.join(root, 'version.json'),
    updateStaging: path.join(root, 'updates', 'staging'),
  };
}

export function readLocalVersion(): { productVersion: string; printServiceVersion: string } {
  const paths = resolvePaths();
  try {
    if (existsSync(paths.versionFile)) {
      const raw = readFileSync(paths.versionFile, 'utf8').replace(/^\uFEFF/, '');
      const v = JSON.parse(raw) as {
        productVersion?: string;
        printServiceVersion?: string;
      };
      return {
        productVersion: v.productVersion || '0.0.0',
        printServiceVersion: v.printServiceVersion || '0.0.0',
      };
    }
  } catch {
    /* ignore */
  }
  return { productVersion: '2.0.0', printServiceVersion: '1.3.1' };
}

async function runWinsw(args: string[]): Promise<{ ok: boolean; stdout: string; stderr: string }> {
  const { printServiceExe } = resolvePaths();
  if (!existsSync(printServiceExe)) {
    return { ok: false, stdout: '', stderr: `Print Service executable not found: ${printServiceExe}` };
  }
  try {
    const { stdout, stderr } = await execFileAsync(printServiceExe, args, {
      windowsHide: true,
      timeout: 60_000,
    });
    return { ok: true, stdout: String(stdout || ''), stderr: String(stderr || '') };
  } catch (err) {
    const e = err as { stdout?: string; stderr?: string; message?: string };
    return {
      ok: false,
      stdout: String(e.stdout || ''),
      stderr: String(e.stderr || e.message || 'WinSW failed'),
    };
  }
}

export async function printServiceStatus(): Promise<{
  installed: boolean;
  running: boolean;
  detail: string;
}> {
  const { printServiceExe } = resolvePaths();
  if (!existsSync(printServiceExe)) {
    return { installed: false, running: false, detail: 'not_installed' };
  }
  const res = await runWinsw(['status']);
  const text = `${res.stdout}\n${res.stderr}`.toLowerCase();
  const running = /\bstarted\b|\brunning\b/.test(text);
  return {
    installed: true,
    running,
    detail: (res.stdout || res.stderr || text).trim() || (res.ok ? 'unknown' : 'error'),
  };
}

export async function startPrintService(): Promise<{ ok: boolean; error?: string }> {
  await runWinsw(['install']);
  const start = await runWinsw(['start']);
  if (start.ok) return { ok: true };

  const paths = resolvePaths();
  const node = path.join(paths.printServiceDir, 'runtime', 'node.exe');
  const entry = path.join(paths.printServiceDir, 'app', 'dist', 'index.js');
  if (existsSync(node) && existsSync(entry)) {
    const child = spawn(node, [entry], {
      cwd: path.join(paths.printServiceDir, 'app'),
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env: { ...process.env, SMART_PRINT_CHANNEL: 'commercial' },
    });
    child.unref();
    return { ok: true };
  }
  return { ok: false, error: start.stderr || 'Failed to start Print Service' };
}

export async function stopPrintService(): Promise<{ ok: boolean; error?: string }> {
  const stop = await runWinsw(['stop']);
  return stop.ok ? { ok: true } : { ok: false, error: stop.stderr || 'Failed to stop Print Service' };
}

export async function restartPrintService(): Promise<{ ok: boolean; error?: string }> {
  await stopPrintService();
  await new Promise((r) => setTimeout(r, 800));
  return startPrintService();
}

export type UpdateManifest = {
  productVersion: string;
  printServiceVersion?: string;
  notes?: string;
  /** https://…/update.zip OR absolute local folder / zip path */
  packageUrl: string;
};

export type UpdateChannel = {
  manifestUrl: string;
  channel: string;
  checkIntervalMinutes: number;
};

function cmpSemver(a: string, b: string): number {
  const pa = a.replace(/^v/i, '').split('.').map((x) => Number(x) || 0);
  const pb = b.replace(/^v/i, '').split('.').map((x) => Number(x) || 0);
  for (let i = 0; i < 3; i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function readJsonFile<T>(filePath: string): T {
  return JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '')) as T;
}

function readManifestFile(filePath: string): UpdateManifest {
  return readJsonFile<UpdateManifest>(filePath);
}

function updateChannelPath(): string {
  return path.join(resolvePaths().productRoot, 'config', 'update-channel.json');
}

export function readUpdateChannel(): UpdateChannel {
  const defaults: UpdateChannel = {
    manifestUrl: '',
    channel: 'stable',
    checkIntervalMinutes: 60,
  };
  try {
    const p = updateChannelPath();
    if (!existsSync(p)) return defaults;
    const raw = readJsonFile<Partial<UpdateChannel>>(p);
    return {
      manifestUrl: typeof raw.manifestUrl === 'string' ? raw.manifestUrl.trim() : '',
      channel: typeof raw.channel === 'string' && raw.channel ? raw.channel : 'stable',
      checkIntervalMinutes:
        typeof raw.checkIntervalMinutes === 'number' && raw.checkIntervalMinutes > 0
          ? raw.checkIntervalMinutes
          : 60,
    };
  } catch {
    return defaults;
  }
}

export function writeUpdateChannel(input: Partial<UpdateChannel>): UpdateChannel {
  const current = readUpdateChannel();
  const next: UpdateChannel = {
    manifestUrl:
      typeof input.manifestUrl === 'string' ? input.manifestUrl.trim() : current.manifestUrl,
    channel: typeof input.channel === 'string' && input.channel ? input.channel : current.channel,
    checkIntervalMinutes:
      typeof input.checkIntervalMinutes === 'number' && input.checkIntervalMinutes > 0
        ? input.checkIntervalMinutes
        : current.checkIntervalMinutes,
  };
  const p = updateChannelPath();
  mkdirSync(path.dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

/** Resolve manifest URL: explicit arg → env → CDN channel file → local updates/manifest.json */
export function resolveManifestUrl(explicit?: string): string {
  if (explicit?.trim()) return explicit.trim();
  if (process.env.SMART_UPDATE_MANIFEST_URL?.trim()) {
    return process.env.SMART_UPDATE_MANIFEST_URL.trim();
  }
  const channel = readUpdateChannel();
  if (channel.manifestUrl) return channel.manifestUrl;
  return path.join(resolvePaths().productRoot, 'updates', 'manifest.json');
}

export async function checkForUpdate(manifestUrl?: string): Promise<{
  updateAvailable: boolean;
  current: ReturnType<typeof readLocalVersion>;
  latest: UpdateManifest | null;
  source: string;
  channel: UpdateChannel;
  error?: string;
}> {
  const current = readLocalVersion();
  const channel = readUpdateChannel();
  const resolved = resolveManifestUrl(manifestUrl);
  try {
    let latest: UpdateManifest | null = null;
    if (resolved.startsWith('http://') || resolved.startsWith('https://')) {
      const res = await fetch(resolved, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) throw new Error(`Manifest HTTP ${res.status}`);
      latest = (await res.json()) as UpdateManifest;
    } else {
      if (!existsSync(resolved)) {
        return {
          updateAvailable: false,
          current,
          latest: null,
          source: resolved,
          channel,
        };
      }
      latest = readManifestFile(resolved);
    }
    return {
      updateAvailable: cmpSemver(latest.productVersion, current.productVersion) > 0,
      current,
      latest,
      source: resolved,
      channel,
    };
  } catch (e) {
    return {
      updateAvailable: false,
      current,
      latest: null,
      source: resolved,
      channel,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function expandZip(zipPath: string, destDir: string): Promise<void> {
  mkdirSync(destDir, { recursive: true });
  await execFileAsync(
    'powershell.exe',
    [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ],
    { windowsHide: true, timeout: 300_000 },
  );
}

export async function applyUpdate(manifest: UpdateManifest): Promise<{ ok: boolean; error?: string }> {
  const paths = resolvePaths();
  mkdirSync(paths.updateStaging, { recursive: true });
  const extractDir = path.join(paths.updateStaging, 'extracted');
  if (existsSync(extractDir)) rmSync(extractDir, { recursive: true, force: true });
  mkdirSync(extractDir, { recursive: true });

  try {
    const pkg = manifest.packageUrl;
    if (existsSync(pkg) && statSync(pkg).isDirectory()) {
      cpSync(pkg, extractDir, { recursive: true });
    } else if (existsSync(pkg) && pkg.toLowerCase().endsWith('.zip')) {
      await expandZip(pkg, extractDir);
    } else if (pkg.startsWith('http://') || pkg.startsWith('https://')) {
      const zipPath = path.join(paths.updateStaging, 'update.zip');
      const res = await fetch(pkg, { signal: AbortSignal.timeout(300_000) });
      if (!res.ok || !res.body) throw new Error(`Download HTTP ${res.status}`);
      await pipeline(res.body as unknown as NodeJS.ReadableStream, createWriteStream(zipPath));
      await expandZip(zipPath, extractDir);
    } else {
      throw new Error(`Unknown packageUrl: ${pkg}`);
    }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }

  // Zip may contain a single top-level folder
  let payloadRoot = extractDir;
  const printDirect = path.join(extractDir, 'Print Service');
  if (!existsSync(printDirect)) {
    const kids = (await import('node:fs')).readdirSync(extractDir);
    if (kids.length === 1) {
      const maybe = path.join(extractDir, kids[0]!);
      if (existsSync(path.join(maybe, 'Print Service'))) payloadRoot = maybe;
    }
  }

  await stopPrintService();

  const printSrc = path.join(payloadRoot, 'Print Service');
  if (existsSync(printSrc)) {
    const cfg = path.join(paths.printServiceDir, 'app', 'config');
    const logs = path.join(paths.printServiceDir, 'app', 'logs');
    const cfgBak = path.join(paths.updateStaging, 'config-preserve');
    const logsBak = path.join(paths.updateStaging, 'logs-preserve');
    if (existsSync(cfg)) cpSync(cfg, cfgBak, { recursive: true });
    if (existsSync(logs)) cpSync(logs, logsBak, { recursive: true });

    if (existsSync(paths.printServiceDir)) {
      rmSync(paths.printServiceDir, { recursive: true, force: true });
    }
    cpSync(printSrc, paths.printServiceDir, { recursive: true });
    if (existsSync(cfgBak)) {
      mkdirSync(path.join(paths.printServiceDir, 'app', 'config'), { recursive: true });
      cpSync(cfgBak, path.join(paths.printServiceDir, 'app', 'config'), { recursive: true });
    }
    if (existsSync(logsBak)) {
      mkdirSync(path.join(paths.printServiceDir, 'app', 'logs'), { recursive: true });
      cpSync(logsBak, path.join(paths.printServiceDir, 'app', 'logs'), { recursive: true });
    }
  }

  // Optional Frontend / Service Helper refresh
  for (const name of ['Frontend', 'Service Helper'] as const) {
    const src = path.join(payloadRoot, name);
    const dest = path.join(paths.productRoot, name);
    if (existsSync(src)) {
      if (existsSync(dest)) rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
    }
  }

  writeFileSync(
    paths.versionFile,
    JSON.stringify(
      {
        productVersion: manifest.productVersion,
        printServiceVersion: manifest.printServiceVersion || manifest.productVersion,
        updatedAt: new Date().toISOString(),
        notes: manifest.notes || null,
      },
      null,
      2,
    ),
    'utf8',
  );

  const start = await startPrintService();
  return start.ok
    ? { ok: true }
    : { ok: false, error: start.error || 'Updated files but failed to restart Print Service' };
}
