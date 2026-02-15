import { z } from 'zod';

export const UomSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().min(1).max(100),
  symbol: z.string().max(20).optional().nullable(),
  type: z.enum(['QUANTITY','WEIGHT','VOLUME','LENGTH','AREA','TIME']).default('QUANTITY'),
}).strict();

export type Uom = z.infer<typeof UomSchema>;
