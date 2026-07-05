#!/usr/bin/env node
/**
 * Fail-fast guard for production verification scripts.
 *
 * Production mode (default): required env vars must be set explicitly.
 * Local mode: PROOF_ALLOW_LOCAL=1 or --local allows dev fallbacks.
 *
 * Exit code 2 = configuration error (not a proof failure).
 */

const LOCAL_FLAG = process.env.PROOF_ALLOW_LOCAL === '1' || process.argv.includes('--local');

/**
 * @param {object} opts
 * @param {string} [opts.scriptName]
 * @param {boolean} [opts.requireHenberDatabase]
 * @param {boolean} [opts.requireBaseUrl]
 * @param {boolean} [opts.requireTenantCredentials]
 * @param {boolean} [opts.requireClientUrl]
 * @param {string} [opts.defaultBaseUrl] - local fallback only
 * @param {string} [opts.defaultClientUrl] - local fallback only
 */
export function resolveVerificationEnvironment(opts = {}) {
  const {
    scriptName = 'Production verification',
    requireHenberDatabase = false,
    requireBaseUrl = false,
    requireTenantCredentials = false,
    requireClientUrl = false,
    defaultBaseUrl = 'http://localhost:3001',
    defaultClientUrl = 'http://localhost:5173',
  } = opts;

  const missing = [];
  if (requireHenberDatabase && !process.env.HENBER_DATABASE_URL) {
    missing.push('HENBER_DATABASE_URL');
  }
  if (requireBaseUrl && !process.env.BASE_URL) {
    missing.push('BASE_URL');
  }
  if (requireTenantCredentials) {
    if (!process.env.TEST_EMAIL) missing.push('TEST_EMAIL');
    if (!process.env.TEST_PASSWORD) missing.push('TEST_PASSWORD');
  }
  if (requireClientUrl && !process.env.CLIENT_URL) {
    missing.push('CLIENT_URL');
  }

  if (missing.length > 0 && !LOCAL_FLAG) {
    console.error(`${scriptName} cannot be executed: ${missing.join(', ')} ${missing.length === 1 ? 'is' : 'are'} not configured.`);
    console.error('');
    console.error('Production verification requires explicit environment configuration.');
    console.error('Local/dev runs: set PROOF_ALLOW_LOCAL=1 or pass --local');
    process.exit(2);
  }

  const mode = LOCAL_FLAG ? 'local' : 'production';

  if (mode === 'local' && missing.length > 0) {
    console.warn(`WARN  ${scriptName} running in LOCAL mode (PROOF_ALLOW_LOCAL=1 or --local)`);
    for (const key of missing) {
      console.warn(`WARN  Missing ${key} — using dev fallback where applicable`);
    }
  }

  const henberDatabaseUrl =
    process.env.HENBER_DATABASE_URL ||
    (LOCAL_FLAG ? process.env.DATABASE_URL || 'postgresql://postgres:password@localhost:5432/pos_system' : '');

  const baseUrl = process.env.BASE_URL || (LOCAL_FLAG ? defaultBaseUrl : '');
  const clientUrl = process.env.CLIENT_URL || (LOCAL_FLAG ? defaultClientUrl : baseUrl.replace(/\/$/, ''));
  const testEmail = process.env.TEST_EMAIL || (LOCAL_FLAG ? 'admin@samplepos.com' : '');
  const testPassword = process.env.TEST_PASSWORD || (LOCAL_FLAG ? 'admin123' : '');

  return {
    mode,
    henberDatabaseUrl,
    baseUrl,
    clientUrl,
    testEmail,
    testPassword,
  };
}

export function isLocalVerificationMode() {
  return LOCAL_FLAG;
}
