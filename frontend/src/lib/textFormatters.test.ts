import { describe, it, expect } from 'vitest';
import { cleanOcrText } from './textFormatters';

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
    expect(cleanOcrText(input)).toBe('Requisitos:\n1. Ser mayor de edad\n2. DNI vigente\n• Certificado médico');
  });

  it('protects footnote lines and header lines', () => {
    const input = 'Texto del cuerpo.\n\n═══ Notas al pie ═══\n[1] Autor citado, p. 45.\n[2] Otra referencia.';
    expect(cleanOcrText(input)).toBe('Texto del cuerpo.\n\n═══ Notas al pie ═══\n[1] Autor citado, p. 45.\n[2] Otra referencia.');
  });

  it('cleans redundant whitespace and punctuation spacing', () => {
    const input = 'Texto   con    muchos   espacios  ,  y comas .';
    expect(cleanOcrText(input)).toBe('Texto con muchos espacios, y comas.');
  });

  it('handles empty or blank string gracefully', () => {
    expect(cleanOcrText('')).toBe('');
    expect(cleanOcrText('   ')).toBe('');
  });
});
