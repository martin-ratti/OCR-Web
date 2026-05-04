import { z } from 'zod';

export const OcrEngineSchema = z.enum(['gemini', 'paddle']).default('gemini');
export type OcrEngine = z.infer<typeof OcrEngineSchema>;

export const ExtractRequestSchema = z.object({
  engine: OcrEngineSchema.optional(),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const ExtractResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  text: z.string(),
  warnings: z.array(z.string()).optional(),
});
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;
