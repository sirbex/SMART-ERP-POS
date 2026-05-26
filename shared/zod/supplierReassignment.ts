import { z } from 'zod';

export const SupplierReassignmentBodySchema = z.object({
    grnId: z.string().uuid(),
    fromSupplierId: z.string().uuid(),
    toSupplierId: z.string().uuid(),
    reason: z.string().min(3).max(2000),
});

export type SupplierReassignmentBody = z.infer<typeof SupplierReassignmentBodySchema>;
