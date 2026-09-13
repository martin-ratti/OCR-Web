/**
 * Limpieza forense y normalización de textos extraídos por OCR.
 * - Reconstruye palabras partidas por guiones silábicos al final de línea (admite guión estándar, soft hyphen, em/en dash).
 * - Elimina soft hyphens invisibles dentro del texto.
 * - Une saltos de línea simples dentro de un mismo párrafo, pero PROTEGE listas numeradas, viñetas y títulos.
 * - Preserva párrafos independientes (doble salto de línea).
 * - Colapsa espacios redundantes y ajusta la puntuación.
 */

// Guiones: hyphen-minus (\u002D), soft-hyphen (\u00AD), hyphen (\u2010), non-breaking (\u2011), en-dash (\u2013), em-dash (\u2014)
const HYPHEN_PATTERN = '[-\\u00AD\\u2010\\u2011\\u2013\\u2014]';
const HYPHEN_REGEX = new RegExp(`(\\p{L}+)${HYPHEN_PATTERN}\\s*\\r?\\n\\s*(\\p{L}+)`, 'gu');

// Detecta si una línea empieza con viñeta, numeración o encabezado que NO debe fusionarse con la línea anterior
const LIST_OR_BREAK_START = /^\s*(?:(?:[•*]|\d+[.)]|[a-zA-Z][.)])\s+|[—–-]\s+|={3,}|Art(?:\.|ículo)\s+\d+|\[\d+\])/;

export function cleanOcrText(text: string): string {
  if (!text) return '';

  // 1. Reconstruir palabras divididas por cualquier tipo de guión de fin de línea
  let result = text.replace(HYPHEN_REGEX, '$1$2');

  // 2. Eliminar soft hyphens invisibles residuales dentro de palabras
  result = result.replace(/\u00AD/g, '');

  // 3. Dividir por párrafos principales (doble salto o más)
  const paragraphBlocks = result.split(/\r?\n\s*\r?\n/);

  const cleanedBlocks = paragraphBlocks.map((block) => {
    const lines = block.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) return lines.join('');

    let merged = lines[0];
    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currentLine = lines[i];

      // Si la línea anterior termina con dos puntos o la actual empieza con viñeta/número/artículo, conservar el salto
      if (prevLine.endsWith(':') || LIST_OR_BREAK_START.test(currentLine)) {
        merged += '\n' + currentLine;
      } else {
        merged += ' ' + currentLine;
      }
    }
    return merged;
  });

  return (
    cleanedBlocks
      .join('\n\n')
      // 4. Colapsar espacios horizontales múltiples
      .replace(/[ \t]{2,}/g, ' ')
      // 5. Corregir espacios antes de signos de puntuación
      .replace(/ +([,.;:!?])/g, '$1')
      .trim()
  );
}
