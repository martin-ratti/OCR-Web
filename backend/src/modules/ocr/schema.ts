import { z } from 'zod';

export const OcrResponseSchema = z.object({
    success: z.boolean(),
    text: z.string(),
    error: z.string().optional()
});