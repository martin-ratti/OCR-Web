/**
 * Limpieza forense y normalización de textos extraídos por OCR.
 * - Une palabras partidas con guion al final de línea (silabeo de imprenta).
 * - Une saltos de línea suaves dentro del mismo párrafo.
 * - Preserva párrafos independientes (doble salto de línea).
 * - Colapsa espacios múltiples y limpia espaciado previo a signos de puntuación.
 */
export function cleanOcrText(text: string): string {
  if (!text) return '';

  return (
    text
      // 1. Reconstruir palabras divididas por guión de fin de renglón (ej. "cons-\ntitución" -> "constitución")
      .replace(/(\p{L}+)-\s*\r?\n\s*(\p{L}+)/gu, '$1$2')
      // 2. Unir saltos simples dentro de un mismo párrafo (respetando párrafos separados por doble salto)
      .replace(/(?<!\n)\r?\n(?!\r?\n)/g, ' ')
      // 3. Colapsar espacios horizontales múltiples a uno solo
      .replace(/[ \t]{2,}/g, ' ')
      // 4. Corregir espacios sueltos antes de signos de puntuación comunes
      .replace(/ +([,.;:!?])/g, '$1')
      // 5. Limpiar espacios al inicio y final de cada línea
      .split('\n')
      .map((line) => line.trim())
      .join('\n')
      .trim()
  );
}
