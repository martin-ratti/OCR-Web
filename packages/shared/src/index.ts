import { z } from 'zod';

export const NO_HIGHLIGHT_SENTINEL = 'No se detectó texto resaltado en esta imagen.';

export const OcrEngineSchema = z.enum(['gemini', 'paddle', 'groq']).default('gemini');
export type OcrEngine = z.infer<typeof OcrEngineSchema>;

export const OcrModeSchema = z.enum(['highlight', 'full']).default('highlight');
export type OcrMode = z.infer<typeof OcrModeSchema>;

export const OcrBoxSchema = z.object({
  text: z.string(),
  score: z.number().min(0).max(1),
  highlighted: z.boolean().optional(),
  xmin: z.number().min(0).max(1),
  ymin: z.number().min(0).max(1),
  xmax: z.number().min(0).max(1),
  ymax: z.number().min(0).max(1),
});
export type OcrBox = z.infer<typeof OcrBoxSchema>;

export const ExtractRequestSchema = z.object({
  engine: OcrEngineSchema.optional(),
  mode: OcrModeSchema.optional(),
});
export type ExtractRequest = z.infer<typeof ExtractRequestSchema>;

export const ExtractResponseSchema = z.object({
  status: z.enum(['success', 'error']),
  text: z.string(),
  warnings: z.array(z.string()).optional(),
  modelUsed: z.string().optional(),
});
export type ExtractResponse = z.infer<typeof ExtractResponseSchema>;
