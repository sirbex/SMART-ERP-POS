/**
 * Phase F0 — log and mark legacy reconciliation consumers during stabilization.
 */
import type { Request, Response } from 'express';
import logger from '../../utils/logger.js';
import {
  getLegacySurface,
  LEGACY_RECONCILIATION_SUNSET_HEADER,
  type LegacyReconciliationSurface,
} from './legacyReconciliationRegistry.js';

export interface LegacyAccessLog {
  surfaceId: string;
  path: string;
  method: string;
  userId?: string;
  tenantId?: string;
  userAgent?: string;
  asOfDate?: string;
  timestamp: string;
}

export function logLegacyReconciliationAccess(
  surfaceId: string,
  req: Pick<Request, 'method' | 'path' | 'query' | 'headers'>,
  user?: { id?: string; tenantId?: string },
): LegacyReconciliationSurface | undefined {
  const surface = getLegacySurface(surfaceId);
  if (!surface) {
    logger.warn('[LEGACY RECON] Unknown surface id', { surfaceId, path: req.path });
    return undefined;
  }

  const entry: LegacyAccessLog = {
    surfaceId,
    path: req.path,
    method: req.method,
    userId: user?.id,
    tenantId: user?.tenantId,
    userAgent: typeof req.headers['user-agent'] === 'string' ? req.headers['user-agent'] : undefined,
    asOfDate: typeof req.query.asOfDate === 'string' ? req.query.asOfDate : undefined,
    timestamp: new Date().toISOString(),
  };

  logger.warn('[LEGACY RECON] Deprecated consumer access', {
    ...entry,
    successor: surface.successor,
    implementation: surface.implementation,
    kind: surface.kind,
  });

  return surface;
}

export function applyLegacyDeprecationHeaders(
  res: Response,
  surface: LegacyReconciliationSurface,
): void {
  res.setHeader('Deprecation', 'true');
  res.setHeader('Sunset', LEGACY_RECONCILIATION_SUNSET_HEADER);
  res.setHeader('Link', `<${surface.successor}>; rel="successor-version"`);
  res.setHeader('X-Reconciliation-Framework', 'legacy');
  res.setHeader('X-Reconciliation-Successor', surface.successor);
}

export function legacyReconciliationMeta(surface: LegacyReconciliationSurface) {
  return {
    deprecated: true,
    stabilizationPhase: 'F0',
    surfaceId: surface.id,
    successor: surface.successor,
    sunset: LEGACY_RECONCILIATION_SUNSET_HEADER,
    message:
      'This reconciliation surface is deprecated. The Financial Lane Framework is authoritative during stabilization.',
  };
}

/** Express middleware factory for legacy ERP reconciliation routes. */
export function deprecateLegacyReconciliation(surfaceId: string) {
  return (req: Request, res: Response, next: () => void): void => {
    const surface = logLegacyReconciliationAccess(surfaceId, req, {
      id: req.user?.id,
      tenantId: (req as Request & { tenantId?: string }).tenantId,
    });
    if (surface) {
      applyLegacyDeprecationHeaders(res, surface);
    }
    next();
  };
}
