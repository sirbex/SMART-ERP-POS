// Express type extensions for authentication
import type { UserRole } from '../../../shared/zod/user.js';

declare global {
  namespace Express {
    export interface Request {
      user?: {
        id: string;
        email: string;
        fullName: string;
        role: UserRole;
      };
    }
  }
}

export {};
