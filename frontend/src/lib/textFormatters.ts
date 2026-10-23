/**
 * Limpieza forense, filtro anti-galimatías y normalización de textos extraídos por OCR.
 * - Elimina bloques <think>...</think> o cercos markdown residuales.
 * - Descarta líneas corruptas ("basura de OCR" sin estructura léxica real).
 * - Normaliza palabras en MAYÚSCULAS fusionadas por OCR local (ej. "CONTRAEL", "INSTIGACIÓNA").
 * - Reconstruye palabras partidas por guiones silábicos al final de línea.
 * - Une saltos de línea simples dentro de un mismo párrafo protegiendo títulos, listas, artículos y notas al pie.
 */

import { NO_HIGHLIGHT_SENTINEL } from '@ocr-web/shared';

const HYPHEN_PATTERN = '[-\\u00AD\\u2010\\u2011\\u2013\\u2014]';
const HYPHEN_REGEX = new RegExp(`(\\p{L}+)${HYPHEN_PATTERN}\\s*\\r?\\n\\s*(\\p{L}+)`, 'gu');

const LIST_OR_BREAK_START =
  /^\s*(?:(?:[•*]|\d+[.)]|[a-zA-Z][.)])\s+|[—–-]\s+|[═=]{3,}|(?:El\s+)?Art(?:\.|ículo)\s+\d+|\[\d+\]|(?:TÍTULO|CAPÍTULO|SECCIÓN)\s+[IVXLCDM\d]+)/i;

const VALID_SHORT_SPANISH = new Set([
  'a', 'al', 'b', 'c', 'con', 'd', 'de', 'del', 'e', 'el', 'él', 'en', 'es',
  'ex', 'fe', 'fue', 'ha', 'han', 'hay', 'i', 'ii', 'iii', 'iv', 'ix', 'la',
  'las', 'le', 'les', 'ley', 'lo', 'los', 'más', 'me', 'mi', 'mí', 'muy', 'ni',
  'no', 'nos', 'o', 'os', 'p', 'págs', 'pág', 'paz', 'por', 'pro', 'que', 'qué',
  'rol', 'se', 'sé', 'ser', 'si', 'sí', 'sin', 'so', 'son', 'su', 'sus', 'tal',
  'tan', 'te', 'ti', 'tu', 'tú', 'tus', 'un', 'una', 'uno', 'u', 'v', 'va',
  'van', 'ver', 'vez', 'vi', 'vii', 'viii', 'vos', 'voz', 'x', 'xi', 'xii', 'xiii',
  'xiv', 'xv', 'y', 'ya', 'yo', 'art', 'arts', 'inc', 'cap', 'cp', 'cn', 'cc',
  'ej', 'ob', 'cit', 'op', 'bis', 'ter',
]);

const VOWEL_RE = /[aeiouáéíóúüAEIOUÁÉÍÓÚÜ]/;

/**
 * Corrige fusiones léxicas típicas de modelos CTC sobre encabezados en MAYÚSCULAS
 * en español jurídico/académico sin alterar palabras reales.
 */
export function normalizeSpanishCapsSpacing(input: string): string {
  if (!input) return '';
  return (
    input
      // Dos puntos pegados a una letra mayúscula (ej. "CAPÍTULO I:INSTIGACIÓN" -> "CAPÍTULO I: INSTIGACIÓN")
      .replace(/:(\p{Lu})/gu, ': $1')
      // Encabezados pegados a numeración romana (ej. "TÍTULOVIII", "CAPÍTULOI")
      .replace(
        /\b(T[ÍI]TULO|CAP[ÍI]TULO|SECCI[ÓO]N|ART[ÍI]CULO)(I{1,3}|IV|VI{0,3}|IX|XI{0,3}|XIV|XV)\b/gu,
        '$1 $2'
      )
      // Sustantivos agudos en -CIÓN/-SIÓN/-XIÓN con tilde conservada seguidos de preposición/artículo pegado
      // (lingüísticamente imposible como una sola palabra en español si conserva la tilde en Ó)
      .replace(
        /\b(\p{Lu}*(?:CI|SI|XI)ÓN)(A|AL|EL|LA|LAS|LO|LOS|DE|DEL|EN|POR|PARA|CON|SIN|UN|UNA)\b/gu,
        '$1 $2'
      )
      // Preposiciones/artículos fusionados frecuentes en títulos en versalitas
      .replace(/\bCONTRA(EL|LA|LAS|LOS)\b/g, 'CONTRA $1')
      .replace(/\bPARALASALUD\b/g, 'PARA LA SALUD')
      .replace(/\bPARA(EL|LA|LAS|LOS)\b/g, 'PARA $1')
      .replace(/\bDELITOSCONTRA\b/g, 'DELITOS CONTRA')
      .replace(/\b(EL|DEL)ORDEN\b/g, '$1 ORDEN')
      .replace(/\bLAMEDICINA\b/g, 'LA MEDICINA')
      .replace(/\bLASALUD\b/g, 'LA SALUD')
      // Duplicación espuria de 'I' entre consonantes mayúsculas (ej. "DETERMIINADO" -> "DETERMINADO")
      .replace(/([B-DF-HJ-NP-TV-ZÑ])II([B-DF-HJ-NP-TV-ZÑ])/g, '$1I$2')
  );
}

/**
 * Detecta si una línea es un título o encabezado en MAYÚSCULAS (ej. "TÍTULO VIII",
 * "DELITOS CONTRA EL ORDEN PÚBLICO", "1. EL BIEN JURÍDICO PROTEGIDO").
 */
export function isAllCapsHeadingLine(line: string): boolean {
  const letters = line.replace(/[^\p{L}]/gu, '');
  if (letters.length < 4 || line.length > 110) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, '');
  return upper.length / letters.length >= 0.85;
}

/**
 * Evalúa si una palabra individual parece un token real (palabra en español/latín,
 * número de artículo/página o referencia válida) vs fragmento corrupto de OCR.
 */
export function isPlausibleSpanishToken(rawToken: string): boolean {
  const trimmed = rawToken.trim();
  if (!trimmed) return false;

  // Números, años, artículos, incisos, referencias "[968]" o "^12"
  if (/^[[(^]?\d+([.,/-]\d+)*[°ºª)\].:;,-]*$/.test(trimmed)) return true;

  // Si tiene demasiada basura simbólica intercalada entre letras (ej. "lu!;ant", "f.a/ig", "ti.r:.:n")
  const innerPunct = trimmed.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, '');
  const midNoise = innerPunct.match(/[^ \p{L}\d'^/-]/gu);
  if (midNoise && midNoise.length >= 2) return false;

  const lettersOnly = trimmed.replace(/[^\p{L}]/gu, '');
  if (lettersOnly.length === 0) return false;

  const lc = lettersOnly.toLowerCase();
  if (VALID_SHORT_SPANISH.has(lc)) return true;

  // Siglas válidas cortas (ej. "C.P.", "CSJN", "ADN", "DNI")
  if (/^[A-ZÁÉÍÓÚÑ.]{2,7}$/.test(trimmed) && lettersOnly.length >= 2) return true;

  if (lettersOnly.length <= 2) return false;

  // Toda palabra real en español de >=3 letras tiene al menos una vocal y proporción razonable vocal/consonante
  if (!VOWEL_RE.test(lc)) return false;

  // Rechazar 5+ consonantes seguidas (ej. "strcc", "dcct")
  if (/[^aeiouáéíóúü]{5,}/i.test(lc)) return false;

  const vowels = (lc.match(/[aeiouáéíóúü]/g) ?? []).length;
  const vowelRatio = vowels / lc.length;
  return vowelRatio >= 0.2 && vowelRatio <= 0.85;
}

/**
 * Filtra líneas corruptas ("dice cualquier cosa, ni siquiera palabras") producidas
 * cuando una zona de la foto está tapada, borrosa o en sombra extrema.
 */
export function isPlausibleSpanishLine(line: string): boolean {
  const s = normalizeSpanishCapsSpacing(line.trim());
  if (!s) return false;
  if (/^[═=]{3,}/.test(s)) return true;

  const rawTokens = s.split(/\s+/).filter(Boolean);
  if (rawTokens.length === 0) return false;

  let plausible = 0;
  let singleCharFragments = 0;

  for (const t of rawTokens) {
    if (isPlausibleSpanishToken(t)) {
      plausible++;
    }
    const letters = t.replace(/[^\p{L}]/gu, '');
    if (letters.length === 1 && !/^[ayoeuAYOEU]$/.test(letters)) {
      singleCharFragments++;
    }
  }

  // Exceso de letras sueltas partidas ("c un s tru cc i ón" / "r r propio n le")
  if (rawTokens.length >= 5 && singleCharFragments / rawTokens.length > 0.34) {
    return false;
  }

  if (rawTokens.length === 1) {
    return plausible === 1 && s.replace(/[^\p{L}\d]/gu, '').length >= 2;
  }

  return plausible / rawTokens.length >= 0.62;
}

/**
 * Puntúa de 0 a 1 qué tan legible y coherente en español resulta un bloque OCR.
 * Usado tanto para elegir la mejor rotación (0°/90°/180°/270°) como para descartar basura.
 */
export function scoreTextCoherence(text: string): number {
  const trimmed = normalizeSpanishCapsSpacing(text.trim());
  if (!trimmed) return 0;

  const tokens = trimmed.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;

  let valid = 0;
  for (const t of tokens) {
    if (isPlausibleSpanishToken(t)) valid++;
  }
  return valid / tokens.length;
}

export function cleanOcrText(text: string): string {
  if (!text) return '';

  // 0. Limpiar posibles etiquetas de pensamiento o cercos markdown residuales
  let result = text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim()
    .replace(/^```(?:[a-zA-Z0-9_-]+)?\s*\r?\n([\s\S]*?)\r?\n?```$/g, '$1')
    .trim();

  // 1. Reconstruir palabras divididas por cualquier tipo de guión de fin de línea
  result = result.replace(HYPHEN_REGEX, '$1$2');

  // 2. Eliminar soft hyphens invisibles residuales y normalizar títulos en mayúsculas
  result = normalizeSpanishCapsSpacing(result.replace(/\u00AD/g, ''));

  // 3. Dividir por párrafos principales (doble salto o más)
  const paragraphBlocks = result.split(/\r?\n\s*\r?\n/);

  const cleanedBlocks = paragraphBlocks.map((block) => {
    const lines = block
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length <= 1) return lines.join('');

    let merged = lines[0];
    for (let i = 1; i < lines.length; i++) {
      const prevLine = lines[i - 1];
      const currentLine = lines[i];

      const prevIsHeading = isAllCapsHeadingLine(prevLine);
      const currIsHeading = isAllCapsHeadingLine(currentLine);

      // Si venimos de párrafo normal y aparece un título en MAYÚSCULAS nuevo, separar con doble salto
      if (!prevIsHeading && currIsHeading) {
        merged += '\n\n' + currentLine;
        continue;
      }

      // Si la línea anterior era un título en MAYÚSCULAS y la actual es texto de cuerpo o nuevo encabezado prefijado
      if (prevIsHeading && (!currIsHeading || LIST_OR_BREAK_START.test(currentLine))) {
        merged += '\n' + currentLine;
        continue;
      }

      if (prevLine.endsWith(':') || LIST_OR_BREAK_START.test(currentLine)) {
        merged += '\n' + currentLine;
      } else {
        merged += ' ' + currentLine;
      }
    }
    return merged;
  });

  return cleanedBlocks
    .join('\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, '$1')
    .trim();
}

export function isEmptyExtractionText(text: string | undefined): boolean {
  if (!text) return true;
  const trimmed = text.trim();
  return (
    trimmed.length === 0 ||
    trimmed === NO_HIGHLIGHT_SENTINEL ||
    trimmed === 'Sin texto legible en la imagen.'
  );
}
