import { z } from 'zod';

export const SupplierReassignmentBodySchema = z.object({
    grnId: z.string().uuid(),
    fromSupplierId: z.string().uuid(),
    toSupplierId: z.string().uuid(),
    reason: z.string().min(3).max(2000),
});

export type SupplierReassignmentBody = z.infer<typeof SupplierReassignmentBodySchema>;

/** Execute: reverse unpaid GR-linked bills automatically, then reclass GR/IR (default on). */
export const SupplierReassignmentExecuteSchema = SupplierReassignmentBodySchema.extend({
    autoReverseInvoices: z.boolean().optional().default(true),
});

export type SupplierReassignmentExecuteBody = z.infer<typeof SupplierReassignmentExecuteSchema>;
