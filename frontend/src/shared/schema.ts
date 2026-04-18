import { z } from 'zod';

export const ExtractResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  text: z.string(),
  warnings: z.array(z.string()).optional(),
});

export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;
