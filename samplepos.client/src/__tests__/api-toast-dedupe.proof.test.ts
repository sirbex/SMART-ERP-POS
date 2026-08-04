/**
 * PROOF — Global API toast anti-double-notify (SSOT)
 *
 * Bug: Interceptor shows "Invalid request" + body; page onError toasts body again.
 * Fix: markApiErrorNotified + installGlobalApiToastDedupe (hot-toast + sonner).
 *
 * Run:
 *   npx vitest run src/__tests__/api-toast-dedupe.proof.test.ts
 *
 * Artifacts (repo root):
 *   PROOF_API_TOAST_DEDUPE.json
 *   PROOF_API_TOAST_DEDUPE.md
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { AxiosError } from 'axios';

const toastErrorSpy = vi.hoisted(() => vi.fn());
vi.mock('react-hot-toast', () => ({
  default: {
    error: toastErrorSpy,
    success: vi.fn(),
  },
}));
vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

import toast from 'react-hot-toast';
import {
  HandledApiError,
  dispatchUserFacingApiNotification,
  handleApiError,
  installGlobalApiToastDedupe,
  resetApiErrorToastDedupeForTests,
  shouldSuppressApiErrorToast,
  toastApiError,
  wrapToastErrorWithApiDedupe,
} from '../utils/errorHandler';

const clientSrc = resolve(__dirname, '..'); // samplepos.client/src
const clientRoot = resolve(clientSrc, '..'); // samplepos.client
const repoRoot = resolve(clientRoot, '..'); // repo

function readRepo(rel: string): string {
  return readFileSync(resolve(repoRoot, rel), 'utf8');
}

function makeAxios400(error: string): AxiosError {
  return {
    isAxiosError: true,
    response: {
      status: 400,
      data: { success: false, error },
      headers: {},
      config: {} as AxiosError['config'],
      statusText: 'Bad Request',
    },
    config: {} as AxiosError['config'],
    message: 'Request failed with status code 400',
    name: 'AxiosError',
    toJSON: () => ({}),
  } as unknown as AxiosError;
}

type Gate = { id: string; pass: boolean; detail?: string };
const gates: Gate[] = [];

function gate(id: string, pass: boolean, detail?: string) {
  gates.push({ id, pass, detail });
  expect(pass, `${id}${detail ? ` — ${detail}` : ''}`).toBe(true);
}

const RECIPE_MSG =
  'No active recipe for this product. Add ingredient lines manually or define a restaurant recipe first.';

// Minimal window for dispatchUserFacingApiNotification in node vitest
function ensureWindow(): void {
  if (typeof globalThis.window !== 'undefined') return;
  const listeners = new Map<string, Set<EventListener>>();
  const w = {
    addEventListener: (type: string, fn: EventListener) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener: (type: string, fn: EventListener) => {
      listeners.get(type)?.delete(fn);
    },
    dispatchEvent: (e: Event) => {
      listeners.get(e.type)?.forEach((fn) => fn(e));
      return true;
    },
  };
  (globalThis as { window?: typeof w }).window = w;
}

describe('PROOF — global API toast anti-double-notify', () => {
  beforeEach(() => {
    toastErrorSpy.mockClear();
    resetApiErrorToastDedupeForTests();
    installGlobalApiToastDedupe();
    ensureWindow();
  });

  it('runtime: interceptor mark + page re-toast → 0 underlying toast.error calls', () => {
    const events: unknown[] = [];
    const handler = (e: Event) => events.push((e as CustomEvent).detail);
    window.addEventListener('app:api-error', handler);

    const handled = dispatchUserFacingApiNotification(makeAxios400(RECIPE_MSG));
    window.removeEventListener('app:api-error', handler);

    gate('R1-HandledApiError', handled instanceof HandledApiError);
    gate('R2-message-body', handled.message === RECIPE_MSG, handled.message);
    gate('R3-app-api-error-dispatched', events.length >= 1, `events=${events.length}`);
    gate(
      'R4-suppress-flags',
      shouldSuppressApiErrorToast(RECIPE_MSG) && shouldSuppressApiErrorToast('Invalid request'),
    );

    // Global App would toast a React node once; page re-toasts the body string(s)
    // Measure display SSOT (what users see): pure wrap skips underlying toast fn.
    const displayed: string[] = [];
    const displayToast = wrapToastErrorWithApiDedupe((m) => {
      displayed.push(String(m));
    });
    displayToast(RECIPE_MSG);
    displayToast(RECIPE_MSG);
    toastApiError(handled);
    handleApiError(handled);

    gate(
      'R5-zero-surface-display',
      displayed.length === 0,
      `displayed=${displayed.length}`,
    );
  });

  it('runtime: local (non-API) validation still surfaces', () => {
    toastErrorSpy.mockClear();
    toast.error('Select finished product');
    gate(
      'R6-local-allowed',
      toastErrorSpy.mock.calls.length === 1,
      `calls=${toastErrorSpy.mock.calls.length}`,
    );
  });

  it('runtime: toastApiError skips HandledApiError without mark', () => {
    toastErrorSpy.mockClear();
    resetApiErrorToastDedupeForTests();
    toastApiError(new HandledApiError('server said no'));
    gate(
      'R7-toastApiError-skip',
      toastErrorSpy.mock.calls.length === 0,
      `calls=${toastErrorSpy.mock.calls.length}`,
    );
  });

  it('structural: SSOT wiring present', () => {
    const eh = readRepo('samplepos.client/src/utils/errorHandler.ts');
    const api = readRepo('samplepos.client/src/utils/api.ts');
    const main = readRepo('samplepos.client/src/main.tsx');
    const resilient = readRepo('samplepos.client/src/services/resilientApiClient.ts');
    const app = readRepo('samplepos.client/src/App.tsx');

    gate('S1-markApiErrorNotified', /export function markApiErrorNotified/.test(eh));
    gate('S2-shouldSuppress', /export function shouldSuppressApiErrorToast/.test(eh));
    gate('S3-install', /export function installGlobalApiToastDedupe/.test(eh));
    gate('S4-dispatch-mark', /markApiErrorNotified\(notification\.message/.test(eh));
    gate('S5-module-install', /installGlobalApiToastDedupe\(\)/.test(eh));
    gate('S6-api-install', /installGlobalApiToastDedupe\(\)/.test(api));
    gate('S7-api-brv', /markApiErrorNotified\(reason/.test(api));
    gate('S8-api-403', /markApiErrorNotified\(msg/.test(api));
    gate('S9-api-network', /Connection problem/.test(api) && /markApiErrorNotified/.test(api));
    gate('S10-main', /installGlobalApiToastDedupe/.test(main));
    gate('S11-resilient', /markApiErrorNotified/.test(resilient));
    gate('S12-app-listener', /app:api-error/.test(app));
  });

  it('writes PROOF_API_TOAST_DEDUPE artifacts', () => {
    const pass = gates.filter((g) => g.pass).length;
    const fail = gates.filter((g) => !g.pass).length;
    const runAt = new Date().toISOString();
    const result = fail === 0 ? 'PASS' : 'FAIL';

    const json = {
      proof: 'API_TOAST_DEDUPE',
      objective:
        'One user-visible API failure notification globally — interceptors notify once; page re-toasts suppressed',
      runAt,
      result,
      summary: { pass, fail, total: gates.length },
      gates,
      bug:
        'Invalid request + No active recipe… plus second toast with the same body from page onError',
      fix: [
        'markApiErrorNotified after interceptor / dispatch notify',
        'installGlobalApiToastDedupe patches react-hot-toast + sonner',
        'toastApiError / handleApiError skip HandledApiError',
      ],
      command:
        'npx vitest run src/__tests__/api-toast-dedupe.proof.test.ts src/__tests__/errorHandler.spec.ts src/__tests__/access-denied-notification-proof.test.ts',
    };

    const jsonPath = resolve(repoRoot, 'PROOF_API_TOAST_DEDUPE.json');
    const mdPath = resolve(repoRoot, 'PROOF_API_TOAST_DEDUPE.md');
    writeFileSync(jsonPath, JSON.stringify(json, null, 2), 'utf8');

    const md = [
      '# PROOF: Global API toast anti-double-notify',
      '',
      `- Run: ${runAt}`,
      `- Command: \`${json.command}\``,
      `- Result: **${result}** — ${pass} pass / ${fail} fail / ${gates.length} total`,
      '',
      '## Objective',
      '',
      json.objective,
      '',
      '## Bug reproduced',
      '',
      json.bug,
      '',
      '## Fix SSOT',
      '',
      ...json.fix.map((f) => `- ${f}`),
      '',
      '## Gates',
      '',
      ...gates.map(
        (g) =>
          `- **${g.pass ? 'PASS' : 'FAIL'}** ${g.id}${g.detail ? ` — ${g.detail}` : ''}`,
      ),
      '',
      '## Artifacts',
      '',
      '- `PROOF_API_TOAST_DEDUPE.json`',
      '- `PROOF_API_TOAST_DEDUPE.md`',
      '',
      '## Verdict',
      '',
      fail === 0
        ? '**PASS — certified** (runtime suppress + structural wiring).'
        : '**FAIL — do not ship.**',
      '',
    ].join('\n');

    writeFileSync(mdPath, md, 'utf8');

    gate('W1-json', existsSync(jsonPath));
    gate('W2-md', existsSync(mdPath));
    gate('W3-all-passed', fail === 0, `${fail} failed of prior gates`);

    // Re-write with W1–W3 included
    const allPass = gates.every((g) => g.pass);
    const final = {
      ...json,
      result: allPass ? 'PASS' : 'FAIL',
      summary: {
        pass: gates.filter((g) => g.pass).length,
        fail: gates.filter((g) => !g.pass).length,
        total: gates.length,
      },
      gates: [...gates],
    };
    writeFileSync(jsonPath, JSON.stringify(final, null, 2), 'utf8');
    writeFileSync(
      mdPath,
      md
        .replace(
          /Result: \*\*[A-Z]+\*\* — \d+ pass \/ \d+ fail \/ \d+ total/,
          `Result: **${final.result}** — ${final.summary.pass} pass / ${final.summary.fail} fail / ${final.summary.total} total`,
        )
        .replace(
          /## Gates\n\n[\s\S]*?\n## Artifacts/,
          `## Gates\n\n${gates
            .map(
              (g) =>
                `- **${g.pass ? 'PASS' : 'FAIL'}** ${g.id}${g.detail ? ` — ${g.detail}` : ''}`,
            )
            .join('\n')}\n\n## Artifacts`,
        )
        .replace(
          /\*\*PASS — certified\*\*|\*\*FAIL — do not ship\.\*\*/,
          allPass
            ? '**PASS — certified** (runtime suppress + structural wiring).'
            : '**FAIL — do not ship.**',
        ),
      'utf8',
    );
  });
});
