// Express type extensions for authentication and multi-tenancy
import type { UserRole } from '../../../shared/zod/user.js';
import type { Pool } from 'pg';
import type { Tenant } from '../../../shared/types/tenant.js';

declare global {
  namespace Express {
    export interface Request {
      user?: {
        id: string;
        email: string;
        fullName: string;
        role: UserRole;
        tenantId?: string;
        tenantSlug?: string;
      };
      // Multi-tenant context (set by tenantMiddleware)
      tenantPool?: Pool;
      tenant?: Tenant;
      tenantId?: string;
      // Resolved pool (tenantPool || globalPool, set by route middleware)
      pool?: Pool;
      // Audit context
      auditContext?: import('../../../shared/types/audit.js').AuditContext;
      requestId?: string;
      // JWT token payload (set by authenticate middleware)
      tokenPayload?: Record<string, unknown>;
    }
  }
}

export { };
