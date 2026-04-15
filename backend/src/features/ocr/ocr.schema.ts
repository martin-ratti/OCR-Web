import { z } from "zod";

export const ExtractOcrSchema = z.object({
  // No hay body JSON propiamente dicho porque es Form-Data. 
  // Esta validación por Zod a nivel Schema nos serviría si enviáramos metadatos adicionales como "color_preferido"
  // Por ahora, el schema principal valida las respuestas.
});

// Tipo de respuesta estándar de nuestro servicio (EstacionAR Architecture)
export const FormatExtractResponse = z.object({
  status: z.union([z.literal("success"), z.literal("error")]),
  text: z.string(),
  warnings: z.array(z.string()).optional()
});

export type IExtractResponse = z.infer<typeof FormatExtractResponse>;
