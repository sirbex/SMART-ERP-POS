import type { Request } from 'express';
import { getAuthorizationService } from '../../../rbac/middleware.js';
import { TRANSFER_PERMISSION_KEYS } from '../../../../../shared/types/transferWorkflow.js';

const TRANSFER_KEYS = [
    TRANSFER_PERMISSION_KEYS.REQUEST,
    TRANSFER_PERMISSION_KEYS.APPROVE,
    TRANSFER_PERMISSION_KEYS.DISPATCH,
    TRANSFER_PERMISSION_KEYS.RECEIVE,
    TRANSFER_PERMISSION_KEYS.DIRECT,
    TRANSFER_PERMISSION_KEYS.OVERRIDE,
    TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE,
] as const;

/**
 * Resolve effective transfer permissions via AuthorizationService (RBAC + transition fallback).
 */
export async function resolveTransferPermissions(req: Request): Promise<Set<string>> {
    const granted = new Set<string>();
    const userId = req.user?.id;
    if (!userId) return granted;

    const authz = getAuthorizationService(req);
    const subject = authz.subjectFromUser(req.user);
    if (!subject) return granted;

    for (const key of TRANSFER_KEYS) {
        if (await authz.hasPermission(subject, key)) {
            granted.add(key);
        }
    }

    if (granted.has(TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE)) {
        for (const key of TRANSFER_KEYS) {
            granted.add(key);
        }
    }

    return granted;
}

export function buildTransferActor(req: Request, permissions: Set<string>) {
    return {
        userId: req.user?.id,
        permissions,
    };
}
