import type { Request } from 'express';
import { getRbacService } from '../../../rbac/middleware.js';
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

function legacyGrantsTransfer(role: string | undefined, key: string): boolean {
    if (!role) return false;
    if (role.toUpperCase() === 'ADMIN') return true;
    if (role.toUpperCase() === 'MANAGER' && key.startsWith('inventory.')) return true;
    if (key === TRANSFER_PERMISSION_KEYS.LEGACY_APPROVE && role.toUpperCase() === 'MANAGER') {
        return true;
    }
    return false;
}

export async function resolveTransferPermissions(req: Request): Promise<Set<string>> {
    const granted = new Set<string>();
    const userId = req.user?.id;
    const role = req.user?.role;

    const service = getRbacService(req);
    if (service && userId) {
        for (const key of TRANSFER_KEYS) {
            if (await service.checkPermission(userId, key)) {
                granted.add(key);
            }
        }
    }

    for (const key of TRANSFER_KEYS) {
        if (legacyGrantsTransfer(role, key)) {
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
        userRole: req.user?.role,
        permissions,
    };
}
