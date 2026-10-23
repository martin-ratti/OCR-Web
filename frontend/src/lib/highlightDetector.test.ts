import { describe, it, expect } from 'vitest';
import {
  annotatePageHighlights,
  bleachHighlightsForOcr,
  classifyBalancedPixel,
  estimatePaperWhite,
  extractHighlightedSpanText,
  hasAnyHighlightInImage,
  isBoxHighlighted,
  type RgbaImage,
} from './highlightDetector';

function createSolidPage(
  width: number,
  height: number,
  rgb: [number, number, number]
): RgbaImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = rgb[0];
    data[i * 4 + 1] = rgb[1];
    data[i * 4 + 2] = rgb[2];
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function paintRect(
  img: RgbaImage,
  x: number,
  y: number,
  w: number,
  h: number,
  rgb: [number, number, number]
): void {
  const xEnd = Math.min(img.width, x + w);
  const yEnd = Math.min(img.height, y + h);
  for (let py = Math.max(0, y); py < yEnd; py++) {
    for (let px = Math.max(0, x); px < xEnd; px++) {
      const idx = (py * img.width + px) * 4;
      img.data[idx] = rgb[0];
      img.data[idx + 1] = rgb[1];
      img.data[idx + 2] = rgb[2];
      img.data[idx + 3] = 255;
    }
  }
}

describe('highlightDetector', () => {
  it('estimates warm/beige paper white without confusing aged paper with yellow highlighter', () => {
    const warmPage = createSolidPage(200, 200, [236, 224, 198]);
    paintRect(warmPage, 20, 40, 140, 3, [35, 33, 30]);
    paintRect(warmPage, 20, 70, 140, 3, [35, 33, 30]);

    const paper = estimatePaperWhite(warmPage);
    expect(paper.r).toBeGreaterThan(220);
    expect(classifyBalancedPixel(236, 224, 198, paper)).toBe('paper');
    expect(isBoxHighlighted(warmPage, { x: 20, y: 34, width: 140, height: 18 }, paper)).toBe(false);
    expect(hasAnyHighlightInImage(warmPage)).toBe(false);
  });

  it('detects fluorescent yellow and pastel pink highlighter fills over printed black ink', () => {
    const page = createSolidPage(240, 200, [246, 245, 242]);

    paintRect(page, 20, 30, 160, 20, [252, 244, 95]);
    paintRect(page, 25, 38, 130, 4, [25, 25, 25]);

    paintRect(page, 20, 80, 160, 20, [248, 190, 212]);
    paintRect(page, 25, 88, 130, 4, [25, 25, 25]);

    paintRect(page, 25, 140, 130, 4, [25, 25, 25]);

    const paper = estimatePaperWhite(page);
    expect(isBoxHighlighted(page, { x: 20, y: 30, width: 160, height: 20 }, paper)).toBe(true);
    expect(isBoxHighlighted(page, { x: 20, y: 80, width: 160, height: 20 }, paper)).toBe(true);
    expect(isBoxHighlighted(page, { x: 20, y: 132, width: 160, height: 20 }, paper)).toBe(false);
    expect(hasAnyHighlightInImage(page)).toBe(true);
  });

  it('detects thick marker underline below text box while rejecting thin dark ballpoint pen underline', () => {
    const page = createSolidPage(240, 220, [245, 245, 245]);

    paintRect(page, 25, 38, 140, 4, [30, 30, 30]);
    paintRect(page, 20, 47, 150, 6, [120, 238, 195]);

    paintRect(page, 25, 128, 140, 4, [30, 30, 30]);
    paintRect(page, 20, 138, 150, 1, [20, 35, 95]);

    const paper = estimatePaperWhite(page);
    expect(isBoxHighlighted(page, { x: 20, y: 30, width: 150, height: 18 }, paper)).toBe(true);
    expect(isBoxHighlighted(page, { x: 20, y: 120, width: 150, height: 18 }, paper)).toBe(false);
  });

  it('does not mark an unhighlighted line right above a highlighted neighbor line as highlighted', () => {
    const page = createSolidPage(400, 300, [245, 245, 243]);
    // Renglón 1 en blanco (y=60..84)
    paintRect(page, 40, 70, 300, 4, [25, 25, 25]);
    // Renglón 2 resaltado en amarillo justo debajo (y=88..112), cuyo marcador asoma 3px arriba (y=85)
    paintRect(page, 38, 85, 305, 28, [250, 242, 85]);
    paintRect(page, 40, 98, 300, 4, [25, 25, 25]);

    const paper = estimatePaperWhite(page);
    expect(
      isBoxHighlighted(
        page,
        { x: 40, y: 60, width: 300, height: 24 },
        paper,
        { nextHighlightedTopY: 88 }
      )
    ).toBe(false);
    expect(isBoxHighlighted(page, { x: 40, y: 88, width: 300, height: 24 }, paper)).toBe(true);
  });

  it('slices partially highlighted lines to keep only the highlighted words', () => {
    const page = createSolidPage(500, 140, [246, 246, 244]);
    const fullLine =
      'Es un delito doloso, y por ello el autor debe saber que realiza el acto';
    // Solo el primer ~28% de la caja ("Es un delito doloso,") tiene resaltador rosa pastel
    paintRect(page, 30, 40, 118, 28, [248, 185, 208]);
    paintRect(page, 32, 52, 416, 4, [28, 28, 28]);

    const paper = estimatePaperWhite(page);
    const box = { x: 30, y: 40, width: 420, height: 28 };
    expect(isBoxHighlighted(page, box, paper)).toBe(true);
    const sliced = extractHighlightedSpanText(page, box, fullLine, paper);
    expect(sliced).toBe('Es un delito doloso,');
  });

  it('detects indented code articles flanked by margin highlighter braces and filters post-its/page numbers', () => {
    const page = createSolidPage(600, 800, [244, 244, 242]);

    // Post-it naranja pegado en el borde superior (y=0..65)
    paintRect(page, 420, 0, 140, 68, [245, 175, 75]);

    // Párrafo de cuerpo ancho resaltado (referencia de columna principal: x=60..540)
    paintRect(page, 60, 220, 480, 28, [165, 238, 110]);
    paintRect(page, 60, 254, 480, 28, [165, 238, 110]);
    paintRect(page, 60, 288, 480, 28, [165, 238, 110]);

    // Encabezado "El art. 209 C.P. establece:" resaltado
    paintRect(page, 90, 360, 220, 26, [165, 238, 110]);

    // Bloque de artículo con sangría (x=120..470, y=400..464) SIN resaltador encima de las letras,
    // pero encerrado por una llave vertical de resaltador en el margen derecho (x=482..496)
    paintRect(page, 120, 410, 350, 4, [28, 28, 28]);
    paintRect(page, 120, 444, 340, 4, [28, 28, 28]);
    paintRect(page, 484, 398, 12, 68, [165, 238, 110]);

    const items = [
      { text: 'INSTIGACION', confidence: 0.99, box: { x: 430, y: 12, width: 120, height: 34 } },
      {
        text: 'El bien jurídico protegido en estos delitos es el orden público.',
        confidence: 0.99,
        box: { x: 60, y: 220, width: 480, height: 28 },
      },
      {
        text: 'Se entiende por orden público la tranquilidad pública.',
        confidence: 0.99,
        box: { x: 60, y: 254, width: 480, height: 28 },
      },
      {
        text: 'Actualmente este título tiene cinco capítulos especiales.',
        confidence: 0.99,
        box: { x: 60, y: 288, width: 480, height: 28 },
      },
      {
        text: 'El art. 209 C.P. establece:',
        confidence: 0.98,
        box: { x: 90, y: 360, width: 220, height: 26 },
      },
      {
        text: 'El que públicamente instigare a cometer un delito',
        confidence: 0.99,
        box: { x: 120, y: 400, width: 350, height: 28 },
      },
      {
        text: 'determinado contra una persona o institución.',
        confidence: 0.99,
        box: { x: 120, y: 434, width: 340, height: 28 },
      },
      { text: '741', confidence: 0.99, box: { x: 290, y: 740, width: 36, height: 24 } },
    ];

    const annotated = annotatePageHighlights(page, items);
    // Post-it superior y número de página suelto filtrados como ruido
    expect(annotated[0].isNoise).toBe(true);
    expect(annotated[7].isNoise).toBe(true);
    // El artículo encerrado por llave lateral de resaltador queda marcado como resaltado
    expect(annotated[5].highlighted).toBe(true);
    expect(annotated[6].highlighted).toBe(true);
  });

  it('bleaches translucent yellow/green/pink highlighters to white while keeping black ink dark', () => {
    const page = createSolidPage(120, 80, [240, 240, 238]);
    paintRect(page, 10, 10, 40, 20, [155, 232, 95]); // resaltador verde
    paintRect(page, 60, 10, 40, 20, [246, 182, 206]); // resaltador rosa
    paintRect(page, 20, 18, 20, 4, [35, 40, 35]); // tinta oscura

    const paper = estimatePaperWhite(page);
    const bleached = bleachHighlightsForOcr(page, paper);

    const greenBgIdx = (12 * 120 + 12) * 4;
    const pinkBgIdx = (12 * 120 + 65) * 4;
    const inkIdx = (19 * 120 + 25) * 4;

    expect(bleached.data[greenBgIdx]).toBeGreaterThanOrEqual(245);
    expect(bleached.data[pinkBgIdx]).toBeGreaterThanOrEqual(245);
    expect(bleached.data[inkIdx]).toBeLessThan(65);
  });
});
