import { describe, it, expect } from 'vitest';
import { cleanOcrText } from './textFormatters';

describe('cleanOcrText', () => {
  it('reconstructs hyphenated words across line breaks', () => {
    const input = 'El ar-\ntículo 183 del Có-\ndigo Penal.';
    expect(cleanOcrText(input)).toBe('El artículo 183 del Código Penal.');
  });

  it('merges single linebreaks inside paragraph into space', () => {
    const input = 'Esta es una línea\nque continúa aquí mismo.';
    expect(cleanOcrText(input)).toBe('Esta es una línea que continúa aquí mismo.');
  });

  it('preserves double linebreaks between separate paragraphs', () => {
    const input = 'Primer párrafo con texto.\n\nSegundo párrafo independiente.';
    expect(cleanOcrText(input)).toBe('Primer párrafo con texto.\n\nSegundo párrafo independiente.');
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
