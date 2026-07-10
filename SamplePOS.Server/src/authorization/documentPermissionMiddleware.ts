import type { Request, Response, NextFunction } from 'express';
import {
  permissionsForDocumentType,
  permissionsForEntityFlow,
} from '@shared/authorization/documentPolicy.js';
import { requireAnyPermission } from '../rbac/middleware.js';

/**
 * Require read permission for PDF document type in route param `:type`.
 */
export function requireDocumentPdfPermission() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const documentType = String(req.params.type ?? '').toUpperCase();
    const permissions = [...permissionsForDocumentType(documentType)];
    void requireAnyPermission(permissions)(req, res, next);
  };
}

/**
 * Require read permission for document-flow entity type in route param `:entityType`.
 */
export function requireEntityFlowPermission() {
  return (req: Request, res: Response, next: NextFunction): void => {
    const entityType = String(req.params.entityType ?? '').toUpperCase();
    const permissions = [...permissionsForEntityFlow(entityType)];
    void requireAnyPermission(permissions)(req, res, next);
  };
}
