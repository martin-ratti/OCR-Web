import { describe, it, expect } from 'vitest';
import {
  cleanOcrText,
  isPlausibleSpanishLine,
  isPlausibleSpanishToken,
  normalizeSpanishCapsSpacing,
  scoreTextCoherence,
} from './textFormatters';
import { detectSidewaysTextPage } from './imageDownscale';

describe('cleanOcrText', () => {
  it('reconstructs hyphenated words across line breaks with standard hyphen', () => {
    const input = 'El ar-\ntículo 183 del Có-\ndigo Penal.';
    expect(cleanOcrText(input)).toBe('El artículo 183 del Código Penal.');
  });

  it('reconstructs hyphenated words with en-dash and em-dash', () => {
    const input = 'cons–\ntitucional y demo—\ncrático';
    expect(cleanOcrText(input)).toBe('constitucional y democrático');
  });

  it('removes invisible soft hyphens across line breaks and inline', () => {
    const input = 'dis\u00ADposi\u00AD\nción legal';
    expect(cleanOcrText(input)).toBe('disposición legal');
  });

  it('strips leaked <think> reasoning blocks and markdown fences', () => {
    const input =
      '<think>\nAnalizando zonas resaltadas...\n</think>\n```text\nLa acción penal es pública.\n```';
    expect(cleanOcrText(input)).toBe('La acción penal es pública.');
  });

  it('merges single linebreaks inside paragraph into space', () => {
    const input = 'Esta es una línea\nque continúa aquí mismo.';
    expect(cleanOcrText(input)).toBe('Esta es una línea que continúa aquí mismo.');
  });

  it('preserves double linebreaks between separate paragraphs', () => {
    const input = 'Primer párrafo con texto.\n\nSegundo párrafo independiente.';
    expect(cleanOcrText(input)).toBe('Primer párrafo con texto.\n\nSegundo párrafo independiente.');
  });

  it('protects numbered lists and bullet points from being merged', () => {
    const input = 'Requisitos:\n1. Ser mayor de edad\n2. DNI vigente\n• Certificado médico';
    expect(cleanOcrText(input)).toBe(
      'Requisitos:\n1. Ser mayor de edad\n2. DNI vigente\n• Certificado médico'
    );
  });

  it('protects footnote lines and header lines', () => {
    const input =
      'Texto del cuerpo.\n\n═══ Notas al pie ═══\n[1] Autor citado, p. 45.\n[2] Otra referencia.';
    expect(cleanOcrText(input)).toBe(
      'Texto del cuerpo.\n\n═══ Notas al pie ═══\n[1] Autor citado, p. 45.\n[2] Otra referencia.'
    );
  });

  it('cleans redundant whitespace and punctuation spacing', () => {
    const input = 'Texto   con    muchos   espacios  ,  y comas .';
    expect(cleanOcrText(input)).toBe('Texto con muchos espacios, y comas.');
  });

  it('handles empty or blank string gracefully', () => {
    expect(cleanOcrText('')).toBe('');
    expect(cleanOcrText('   ')).toBe('');
  });

  it('normalizes fused Spanish ALL-CAPS headings without altering valid words', () => {
    expect(
      normalizeSpanishCapsSpacing(
        'TÍTULOVIII DELITOS CONTRAEL ORDEN PÚBLICO CAPÍTULOI:INSTIGACIÓNA COMETER DELITOS PARALASALUD DETERMIINADO'
      )
    ).toBe(
      'TÍTULO VIII DELITOS CONTRA EL ORDEN PÚBLICO CAPÍTULO I: INSTIGACIÓN A COMETER DELITOS PARA LA SALUD DETERMINADO'
    );
    expect(normalizeSpanishCapsSpacing('CONTRATO DE LOCACIÓN TÍTULO XIII')).toBe(
      'CONTRATO DE LOCACIÓN TÍTULO XIII'
    );
  });

  it('separates ALL-CAPS section headings from surrounding body paragraphs', () => {
    const input =
      '1. EL BIEN JURÍDICO PROTEGIDO\nEl bien jurídico protegido es el orden público.\nCAPÍTULO I: INSTIGACIÓN A COMETER DELITOS';
    expect(cleanOcrText(input)).toBe(
      '1. EL BIEN JURÍDICO PROTEGIDO\nEl bien jurídico protegido es el orden público.\n\nCAPÍTULO I: INSTIGACIÓN A COMETER DELITOS'
    );
  });
});

describe('anti-gibberish lexical filters', () => {
  it('rejects real corrupted OCR garbage lines reported by users', () => {
    expect(isPlausibleSpanishLine('gae est,l.n den.ni lu!;ant ti.r:.:n f.a/ig')).toBe(false);
    expect(isPlausibleSpanishLine('c un s tru cc i ón d e l p e n s a m i e n t o')).toBe(false);
    expect(isPlausibleSpanishToken('lu!;ant')).toBe(false);
    expect(isPlausibleSpanishToken('strcc')).toBe(false);
  });

  it('accepts genuine Spanish legal/academic sentences, acronyms and article citations', () => {
    const legalLine =
      'Art. 183 C.P. — Será reprimido con prisión de quince días a un año el que destruyere una cosa mueble.';
    expect(isPlausibleSpanishLine(legalLine)).toBe(true);
    expect(scoreTextCoherence(legalLine)).toBeGreaterThan(0.9);
  });
});

describe('detectSidewaysTextPage', () => {
  it('detects landscape pages with vertical text lines while ignoring horizontal text pages', () => {
    const w = 240;
    const h = 180;
    const sideways = new Uint8ClampedArray(w * h * 4).fill(245);
    // Dibujar columnas verticales de tinta cada 14px (simulando renglones rotados 90°)
    for (let x = 30; x < 210; x += 14) {
      for (let y = 25; y < 155; y++) {
        for (let dx = 0; dx < 4; dx++) {
          const idx = (y * w + (x + dx)) * 4;
          sideways[idx] = 30;
          sideways[idx + 1] = 30;
          sideways[idx + 2] = 30;
        }
      }
    }
    expect(detectSidewaysTextPage({ width: w, height: h, data: sideways })).toBe(true);

    const horizontal = new Uint8ClampedArray(w * h * 4).fill(245);
    for (let y = 25; y < 155; y += 14) {
      for (let x = 30; x < 210; x++) {
        for (let dy = 0; dy < 4; dy++) {
          const idx = ((y + dy) * w + x) * 4;
          horizontal[idx] = 30;
          horizontal[idx + 1] = 30;
          horizontal[idx + 2] = 30;
        }
      }
    }
    expect(detectSidewaysTextPage({ width: w, height: h, data: horizontal })).toBe(false);
  });
});
