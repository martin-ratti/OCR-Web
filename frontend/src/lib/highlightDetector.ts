export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface PaperWhite {
  r: number;
  g: number;
  b: number;
}

export interface BoxPoint {
  x: number;
  y: number;
}

export interface PixelBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Cuatro vértices opcionales en sentido horario: [topLeft, topRight, bottomRight, bottomLeft]. */
  points?: [BoxPoint, BoxPoint, BoxPoint, BoxPoint];
}

export interface BoxHighlightOptions {
  /** Coordenada Y superior de una caja resaltada inmediatamente debajo, para no invadirla al medir subrayado. */
  nextHighlightedTopY?: number;
  /** Cajas resaltadas situadas debajo del renglón actual (su borde superior no debe confundirse con subrayado). */
  belowHighlightedBoxes?: PixelBox[];
  /** Si es true, omite el chequeo de subrayado inferior y evalúa únicamente el cuerpo de las letras. */
  coreOnly?: boolean;
}

export interface AnnotatedPageItem<T> {
  item: T;
  highlighted: boolean;
  highlightedText: string;
  isNoise: boolean;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v | 0;
}

/**
 * Altura real de letra de una caja (invariante a la inclinación del renglón cuando hay `points`).
 */
export function getTrueBoxHeight(box: PixelBox): number {
  const pts = box.points;
  if (pts && pts.length === 4) {
    const leftH = Math.hypot(pts[3].x - pts[0].x, pts[3].y - pts[0].y);
    const rightH = Math.hypot(pts[2].x - pts[1].x, pts[2].y - pts[1].y);
    const h = (leftH + rightH) * 0.5;
    if (h >= 4) return h;
  }
  return box.height;
}

/**
 * Devuelve el borde superior e inferior reales de una caja en la coordenada horizontal `x`,
 * siguiendo la inclinación exacta del cuadrilátero si `points` está disponible.
 */
export function getBoxVerticalBoundsAtX(
  box: PixelBox,
  x: number
): { top: number; bottom: number; height: number } {
  const pts = box.points;
  if (pts && pts.length === 4 && box.width >= 8) {
    const topSpan = Math.max(1, pts[1].x - pts[0].x);
    const botSpan = Math.max(1, pts[2].x - pts[3].x);
    const tTop = Math.min(1, Math.max(0, (x - pts[0].x) / topSpan));
    const tBot = Math.min(1, Math.max(0, (x - pts[3].x) / botSpan));
    const top = pts[0].y + (pts[1].y - pts[0].y) * tTop;
    const bottom = pts[3].y + (pts[2].y - pts[3].y) * tBot;
    if (bottom > top + 3) {
      return { top, bottom, height: bottom - top };
    }
  }
  return { top: box.y, bottom: box.y + box.height, height: box.height };
}

/**
 * Estima el color base del papel (punto blanco local) muestreando la página.
 */
export function estimatePaperWhite(img: RgbaImage): PaperWhite {
  const { width, height, data } = img;
  const total = width * height;
  if (total === 0) return { r: 245, g: 245, b: 245 };

  const targetSamples = 2400;
  const step = Math.max(1, Math.floor(total / targetSamples));

  const candidatesR: number[] = [];
  const candidatesG: number[] = [];
  const candidatesB: number[] = [];

  for (let p = 0; p < total; p += step) {
    const i = p * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const lum = (max + min) / 510;
    const chroma = max - min;

    if (lum >= 0.45 && chroma <= 55) {
      candidatesR.push(r);
      candidatesG.push(g);
      candidatesB.push(b);
    }
  }

  if (candidatesR.length < 20) {
    return { r: 242, g: 242, b: 242 };
  }

  const pick70 = (arr: number[]) => {
    const s = arr.slice().sort((a, b) => a - b);
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.7))];
  };

  return {
    r: Math.max(110, pick70(candidatesR)),
    g: Math.max(110, pick70(candidatesG)),
    b: Math.max(110, pick70(candidatesB)),
  };
}

/**
 * Utilidad pura para eliminar cromáticamente el tinte translúcido del resaltador
 * preservando la tinta negra impresa.
 */
export function bleachHighlightsForOcr(
  img: RgbaImage,
  paper: PaperWhite = estimatePaperWhite(img)
): RgbaImage {
  const { width, height, data } = img;
  const out = new Uint8Array(data.length);
  const invR = 245 / Math.max(90, paper.r);
  const invG = 245 / Math.max(90, paper.g);
  const invB = 245 / Math.max(90, paper.b);

  for (let i = 0; i < data.length; i += 4) {
    const nr = data[i] * invR;
    const ng = data[i + 1] * invG;
    const nb = data[i + 2] * invB;
    let v = nr > ng ? (nr > nb ? nr : nb) : ng > nb ? ng : nb;
    if (v > 255) v = 255;
    const gray = v >= 228 ? 252 : Math.max(0, Math.round(252 - (228 - v) * 1.22));
    out[i] = gray;
    out[i + 1] = gray;
    out[i + 2] = gray;
    out[i + 3] = 255;
  }

  return { width, height, data: out };
}

/**
 * Clasifica un píxel balanceado respecto al blanco del papel:
 * - 'ink': tinta negra/oscura o trazo opaco de birome
 * - 'highlight': marcador resaltador (flúor o pastel translúcido)
 * - 'paper': fondo de hoja, sombra neutra o ruido leve
 */
export function classifyBalancedPixel(
  r: number,
  g: number,
  b: number,
  paper: PaperWhite
): 'ink' | 'highlight' | 'paper' {
  const nr = clampByte((r / paper.r) * 245);
  const ng = clampByte((g / paper.g) * 245);
  const nb = clampByte((b / paper.b) * 245);

  const max = Math.max(nr, ng, nb);
  const min = Math.min(nr, ng, nb);
  const chroma = max - min;
  const lum = (max + min) / 5.1;

  if (lum < 35 || max < 95) return 'ink';
  if (lum > 97 || chroma < 23) return 'paper';

  const d = chroma / 255;
  const lNorm = lum / 100;
  const sat =
    (lNorm > 0.5
      ? d / Math.max(0.05, 2 - (max + min) / 255)
      : d / Math.max(0.05, (max + min) / 255)) * 100;

  if (lum < 44 && nb > nr + 25 && ng < nr + 15) {
    return 'ink';
  }

  if (chroma >= 28 && sat >= 14) return 'highlight';
  if (lum >= 58 && chroma >= 23 && sat >= 12) return 'highlight';

  return 'paper';
}

/**
 * Determina si una caja de texto detectada por OCR tiene marcador resaltador
 * siguiendo la inclinación real del renglón (`box.points`) para no absorber
 * derrames de renglones vecinos en fotos inclinadas.
 */
export function isBoxHighlighted(
  img: RgbaImage,
  box: PixelBox,
  paper: PaperWhite = estimatePaperWhite(img),
  options: BoxHighlightOptions = {}
): boolean {
  const { width: imgW, height: imgH, data } = img;
  const x0 = Math.max(0, Math.floor(box.x));
  const x1 = Math.min(imgW - 1, Math.ceil(box.x + box.width));
  const boxW = x1 - x0 + 1;
  const trueH = getTrueBoxHeight(box);
  if (boxW < 4 || trueH < 4) return false;

  const useCore = trueH >= 14;
  const coreSpan = useCore ? 0.34 : 1.0;
  let nonInkCount = 0;
  let highlightCount = 0;
  let activeCols = 0;
  const colHi = new Int16Array(boxW);
  const colNonInk = new Int16Array(boxW);
  const minColPixels = Math.max(2, Math.floor(trueH * coreSpan * 0.3));

  for (let x = x0; x <= x1; x++) {
    const bounds = getBoxVerticalBoundsAtX(box, x);
    const cy0 = Math.max(
      0,
      Math.floor(useCore ? bounds.top + bounds.height * 0.35 : bounds.top)
    );
    const cy1 = Math.min(
      imgH - 1,
      Math.ceil(useCore ? bounds.top + bounds.height * 0.58 : bounds.bottom)
    );
    let cHi = 0;
    let cNonInk = 0;
    for (let y = cy0; y <= cy1; y++) {
      const idx = (y * imgW + x) * 4;
      const kind = classifyBalancedPixel(data[idx], data[idx + 1], data[idx + 2], paper);
      if (kind !== 'ink') {
        cNonInk++;
        if (kind === 'highlight') cHi++;
      }
    }
    colHi[x - x0] = cHi;
    colNonInk[x - x0] = cNonInk;
    nonInkCount += cNonInk;
    highlightCount += cHi;
    if (cHi >= minColPixels) activeCols++;
  }

  const bodyRatio = nonInkCount > 0 ? highlightCount / nonInkCount : 0;
  if (bodyRatio >= 0.18 && activeCols >= Math.max(3, Math.floor(boxW * 0.14))) {
    return true;
  }

  // 1b. Resaltado parcial (ej. 1 a 4 palabras resaltadas al inicio o final de una línea larga)
  const winW = Math.min(boxW, Math.max(16, Math.round(trueH * 1.85)));
  const coreSampleH = Math.max(3, trueH * coreSpan);
  if (boxW >= winW && activeCols >= Math.max(4, Math.floor(winW * 0.38))) {
    let winHi = 0;
    let winNonInk = 0;
    const minWinNonInk = Math.max(10, Math.floor(winW * coreSampleH * 0.32));

    for (let i = 0; i < winW; i++) {
      winHi += colHi[i];
      winNonInk += colNonInk[i];
    }
    if (winNonInk >= minWinNonInk && winHi / winNonInk >= 0.42) {
      return true;
    }
    for (let i = winW; i < boxW; i++) {
      winHi += colHi[i] - colHi[i - winW];
      winNonInk += colNonInk[i] - colNonInk[i - winW];
      if (winNonInk >= minWinNonInk && winHi / winNonInk >= 0.42) {
        return true;
      }
    }
  }

  if (options.coreOnly) return false;

  // 2. Subrayado grueso de marcador debajo de la línea base, respetando inclinación y vecino inferior
  let underNonInk = 0;
  let underHi = 0;
  let activeUnderCols = 0;
  const minMarkerThickness = Math.max(3, Math.floor(trueH * 0.14));
  const belowBoxes = options.belowHighlightedBoxes;

  for (let x = x0; x <= x1; x++) {
    const bounds = getBoxVerticalBoundsAtX(box, x);

    if (belowBoxes && belowBoxes.length > 0) {
      let blockedByHighlightedNeighbor = false;
      for (const below of belowBoxes) {
        if (x < below.x - 8 || x > below.x + below.width + 8) continue;
        const bb = getBoxVerticalBoundsAtX(below, x);
        if (bb.top > bounds.top && bb.top - bounds.bottom <= Math.max(trueH, bb.height) * 0.95) {
          blockedByHighlightedNeighbor = true;
          break;
        }
      }
      if (blockedByHighlightedNeighbor) continue;
    }

    const u0 = Math.max(0, Math.floor(bounds.top + bounds.height * 0.76));
    let u1 = Math.min(imgH - 1, Math.ceil(bounds.top + bounds.height * 1.2));
    if (options.nextHighlightedTopY !== undefined) {
      const safeCap = Math.floor(options.nextHighlightedTopY - Math.max(4, bounds.height * 0.18));
      u1 = Math.min(u1, safeCap);
    }
    if (u1 - u0 + 1 < 3) continue;

    let cHi = 0;
    for (let y = u0; y <= u1; y++) {
      const idx = (y * imgW + x) * 4;
      const kind = classifyBalancedPixel(data[idx], data[idx + 1], data[idx + 2], paper);
      if (kind !== 'ink') {
        underNonInk++;
        if (kind === 'highlight') {
          underHi++;
          cHi++;
        }
      }
    }
    if (cHi >= minMarkerThickness) activeUnderCols++;
  }

  const underRatio = underNonInk > 0 ? underHi / underNonInk : 0;
  if (underRatio >= 0.22 && activeUnderCols >= Math.max(4, Math.floor(boxW * 0.22))) {
    return true;
  }

  return false;
}

function charVisualWeight(ch: string): number {
  if ('iíljtfr1.,:;\'"!¡()[]|'.includes(ch)) return 0.55;
  if ('mwMWOQGHDNUACRB%'.includes(ch)) return 1.28;
  if (ch >= 'A' && ch <= 'Z') return 1.12;
  return 1.0;
}

function wordVisualWeight(word: string): number {
  let w = 0;
  for (const ch of word) w += charVisualWeight(ch);
  return Math.max(0.5, w);
}

/**
 * Si una línea tiene marcador solo sobre una parte de sus palabras (p. ej. "Es un delito doloso,"
 * seguido de texto en blanco), recorta siguiendo la inclinación real de `box.points`.
 */
export function extractHighlightedSpanText(
  img: RgbaImage,
  box: PixelBox,
  rawText: string,
  paper: PaperWhite,
  sampleUnderline = false
): string {
  const trimmed = rawText.trim();
  if (!trimmed) return '';

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length <= 2) return trimmed;

  const { width: imgW, height: imgH, data } = img;
  if (box.width < 12) return trimmed;

  const spaceW = 0.55;
  const weights = words.map(wordVisualWeight);
  const totalWeight = weights.reduce((a, b) => a + b, 0) + spaceW * Math.max(0, words.length - 1);

  const ratios = new Float32Array(words.length);
  let cursor = 0;

  for (let k = 0; k < words.length; k++) {
    const wStart = cursor / totalWeight;
    const wEnd = (cursor + weights[k]) / totalWeight;
    cursor += weights[k] + spaceW;

    const wx0 = Math.max(0, Math.min(imgW - 1, Math.floor(box.x + wStart * box.width)));
    const wx1 = Math.max(wx0, Math.min(imgW - 1, Math.ceil(box.x + wEnd * box.width)));

    let hi = 0;
    let nonInk = 0;
    for (let x = wx0; x <= wx1; x++) {
      const bounds = getBoxVerticalBoundsAtX(box, x);
      const yStart = sampleUnderline
        ? Math.max(0, Math.floor(bounds.top + bounds.height * 0.75))
        : Math.max(0, Math.floor(bounds.top + bounds.height * 0.32));
      const yEnd = sampleUnderline
        ? Math.min(imgH - 1, Math.ceil(bounds.top + bounds.height * 1.18))
        : Math.min(imgH - 1, Math.ceil(bounds.top + bounds.height * 0.68));

      for (let y = yStart; y <= yEnd; y++) {
        const idx = (y * imgW + x) * 4;
        const kind = classifyBalancedPixel(data[idx], data[idx + 1], data[idx + 2], paper);
        if (kind !== 'ink') {
          nonInk++;
          if (kind === 'highlight') hi++;
        }
      }
    }
    ratios[k] = nonInk > 0 ? hi / nonInk : 0;
  }

  let activeWords = 0;
  for (let k = 0; k < words.length; k++) {
    if (ratios[k] >= 0.16) activeWords++;
  }

  const startHasHi =
    ratios[0] >= 0.16 || (words[0].length <= 2 && words.length > 1 && ratios[1] >= 0.18);
  const lastIdx = words.length - 1;
  const endHasHi =
    ratios[lastIdx] >= 0.16 ||
    (words[lastIdx].length <= 2 && words.length > 1 && ratios[lastIdx - 1] >= 0.18);

  if (startHasHi && endHasHi && activeWords / words.length >= 0.72) {
    return trimmed;
  }

  const keep = new Array<boolean>(words.length).fill(false);
  for (let k = 0; k < words.length; k++) {
    const prevStrong = k > 0 && ratios[k - 1] >= 0.32;
    const nextStrong = k + 1 < words.length && ratios[k + 1] >= 0.32;
    const thresh = prevStrong || nextStrong ? 0.16 : 0.25;
    if (ratios[k] >= thresh) keep[k] = true;
  }

  for (let k = 1; k < words.length - 1; k++) {
    if (keep[k]) continue;
    const leftKeep = keep[k - 1] || (k >= 2 && keep[k - 2]);
    const rightKeep = keep[k + 1] || (k + 2 < words.length && keep[k + 2]);
    if (leftKeep && rightKeep) {
      keep[k] = true;
    }
  }

  const selected: string[] = [];
  for (let k = 0; k < words.length; k++) {
    if (keep[k]) selected.push(words[k]);
  }

  return selected.join(' ').trim();
}

function measureLateralBrace(
  img: RgbaImage,
  xStart: number,
  xEnd: number,
  yStart: number,
  yEnd: number,
  maxStrokeWidth: number,
  paper: PaperWhite
): { braceRowRatio: number; paperRatio: number } {
  const { width: imgW, height: imgH, data } = img;
  const x0 = Math.max(0, Math.floor(xStart));
  const x1 = Math.min(imgW - 1, Math.ceil(xEnd));
  const y0 = Math.max(0, Math.floor(yStart));
  const y1 = Math.min(imgH - 1, Math.ceil(yEnd));

  if (x1 - x0 < 6 || y1 - y0 < 8) {
    return { braceRowRatio: 0, paperRatio: 0 };
  }

  let totalRows = 0;
  let braceRows = 0;
  let paperPixels = 0;
  let nonInkPixels = 0;

  for (let y = y0; y <= y1; y += 2) {
    totalRows++;
    const rowOff = y * imgW * 4;
    let rowHi = 0;
    for (let x = x0; x <= x1; x++) {
      const idx = rowOff + x * 4;
      const kind = classifyBalancedPixel(data[idx], data[idx + 1], data[idx + 2], paper);
      if (kind !== 'ink') {
        nonInkPixels++;
        if (kind === 'highlight') rowHi++;
        else paperPixels++;
      }
    }
    if (rowHi >= 3 && rowHi <= maxStrokeWidth) {
      braceRows++;
    }
  }

  return {
    braceRowRatio: totalRows > 0 ? braceRows / totalRows : 0,
    paperRatio: nonInkPixels > 0 ? paperPixels / nonInkPixels : 0,
  };
}

function hasPaperAroundBox(img: RgbaImage, box: PixelBox, paper: PaperWhite): boolean {
  const { width: imgW, height: imgH, data } = img;
  const x0 = Math.max(0, Math.floor(box.x));
  const x1 = Math.min(imgW - 1, Math.ceil(box.x + box.width));
  const trueH = getTrueBoxHeight(box);
  const topY0 = Math.max(0, Math.floor(box.y - trueH * 0.95));
  const topY1 = Math.max(0, Math.floor(box.y - 3));
  const botY0 = Math.min(imgH - 1, Math.ceil(box.y + box.height + 3));
  const botY1 = Math.min(imgH - 1, Math.ceil(box.y + box.height + trueH * 0.95));

  let paperPx = 0;
  let totalPx = 0;

  const sampleBand = (ya: number, yb: number) => {
    for (let y = ya; y <= yb; y += 2) {
      const rowOff = y * imgW * 4;
      for (let x = x0; x <= x1; x += 3) {
        const idx = rowOff + x * 4;
        const kind = classifyBalancedPixel(data[idx], data[idx + 1], data[idx + 2], paper);
        totalPx++;
        if (kind === 'paper') paperPx++;
      }
    }
  };

  if (topY1 > topY0) sampleBand(topY0, topY1);
  if (botY1 > botY0) sampleBand(botY0, botY1);

  if (totalPx < 8) return true;
  return paperPx / totalPx >= 0.16;
}

export function compareBoxesReadingOrder(a: PixelBox, b: PixelBox): number {
  const overlapX = Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x);
  const minW = Math.max(1, Math.min(a.width, b.width));

  // Dos cajas solo pertenecen al mismo renglón si NO se solapan horizontalmente
  if (overlapX <= minW * 0.25) {
    const midX = (Math.min(a.x + a.width, b.x + b.width) + Math.max(a.x, b.x)) * 0.5;
    const boundsA = getBoxVerticalBoundsAtX(a, midX);
    const boundsB = getBoxVerticalBoundsAtX(b, midX);
    const centerA = (boundsA.top + boundsA.bottom) * 0.5;
    const centerB = (boundsB.top + boundsB.bottom) * 0.5;
    if (Math.abs(centerA - centerB) <= Math.max(boundsA.height, boundsB.height) * 0.55) {
      return a.x - b.x;
    }
  }

  const sharedMidX =
    overlapX > 0
      ? (Math.max(a.x, b.x) + Math.min(a.x + a.width, b.x + b.width)) * 0.5
      : (a.x + a.width * 0.5 + b.x + b.width * 0.5) * 0.5;

  const ba = getBoxVerticalBoundsAtX(a, sharedMidX);
  const bb = getBoxVerticalBoundsAtX(b, sharedMidX);
  return (ba.top + ba.bottom) * 0.5 - (bb.top + bb.bottom) * 0.5;
}

/**
 * Analiza todas las cajas de una página orientada verticalmente:
 * 1. Filtra ruido externo (post-its, teclado, números de página sueltos, cabezales corridos).
 * 2. Evalúa resaltado siguiendo la inclinación real de cada línea.
 * 3. Recorta horizontalmente renglones parcialmente resaltados.
 * 4. Detecta bloques de artículos encerrados entre llaves/barras de resaltador en los márgenes ({ ... }).
 */
export function annotatePageHighlights<
  T extends { text: string; confidence: number; box: PixelBox },
>(
  img: RgbaImage,
  items: T[],
  paper: PaperWhite = estimatePaperWhite(img)
): Array<AnnotatedPageItem<T>> {
  if (items.length === 0) return [];

  const { width: imgW, height: imgH } = img;
  const wideItems = items.filter(
    (it) =>
      it.confidence >= 0.55 &&
      it.box.width >= imgW * 0.3 &&
      getTrueBoxHeight(it.box) <= it.box.width * 0.35
  );

  const trueHeights = (wideItems.length > 0 ? wideItems : items)
    .map((it) => getTrueBoxHeight(it.box))
    .sort((a, b) => a - b);
  const medianH = trueHeights[Math.floor(trueHeights.length * 0.5)] ?? 30;

  const firstWideY =
    wideItems.length >= 3 ? Math.min(...wideItems.map((it) => it.box.y)) : imgH * 0.08;
  const lastWideBottom =
    wideItems.length >= 3
      ? Math.max(...wideItems.map((it) => it.box.y + it.box.height))
      : imgH * 0.92;
  const xStarts = wideItems.map((it) => it.box.x).sort((a, b) => a - b);
  const xEnds = wideItems.map((it) => it.box.x + it.box.width).sort((a, b) => a - b);
  const bodyLeft =
    xStarts.length >= 3 ? xStarts[Math.floor(xStarts.length * 0.2)] : imgW * 0.1;
  const bodyRight =
    xEnds.length >= 3 ? xEnds[Math.floor(xEnds.length * 0.8)] : imgW * 0.9;
  const bodyWidth = Math.max(100, bodyRight - bodyLeft);

  // 1. Detectar ruido fuera de la página
  const isNoise = items.map((it, idx) => {
    const txt = it.text.trim();
    const { x, y, width: w, height: h } = it.box;

    if (y <= imgH * 0.01 || x <= imgW * 0.01 || x + w >= imgW * 0.99) return true;

    if (
      wideItems.length >= 3 &&
      y + h < firstWideY - medianH * 1.25 &&
      y < imgH * 0.22 &&
      w < imgW * 0.4
    ) {
      return true;
    }

    if (
      w < imgW * 0.36 &&
      (y < imgH * 0.22 || x < bodyLeft - medianH * 1.5 || x + w > bodyRight + medianH * 1.5) &&
      !hasPaperAroundBox(img, it.box, paper)
    ) {
      return true;
    }

    if (/^\d{1,4}[°ºª.]?$/.test(txt)) {
      if (y < firstWideY + medianH * 0.25 || y > lastWideBottom - medianH * 0.25) {
        return true;
      }
      const hasSameLineCompanion = items.some((other, j) => {
        if (j === idx) return false;
        if (/^\d{1,4}[°ºª.]?$/.test(other.text.trim())) return false;
        const midX = (x + other.box.x) * 0.5;
        const ba = getBoxVerticalBoundsAtX(it.box, midX);
        const bb = getBoxVerticalBoundsAtX(other.box, midX);
        return Math.abs(ba.top - bb.top) <= Math.max(ba.height, bb.height) * 0.65;
      });
      if (!hasSameLineCompanion || w < medianH * 1.45) return true;
    }

    if (
      wideItems.length >= 4 &&
      Math.abs(y - firstWideY) <= medianH * 0.6 &&
      w < bodyWidth * 0.68 &&
      /^(GONZALO\s+JAVIER\s+MOLINA|CONZALO\s*JAVIER\s+MOLINA|DELITOS\s+CONTRA\s+LA\s+SEGURIDAD|DELITOS\s+CONTRA\s+EL\s+ORDEN)/i.test(
        txt
      )
    ) {
      const nextY = Math.min(
        ...items
          .filter((_, j) => j !== idx && items[j].box.y > y + medianH * 0.5)
          .map((o) => o.box.y)
      );
      if (nextY - (y + getTrueBoxHeight(it.box)) >= medianH * 0.55) {
        return true;
      }
    }

    return false;
  });

  // 2. Evaluar cuerpo central primero siguiendo inclinación real
  const coreHi = items.map((it, idx) =>
    isNoise[idx] ? false : isBoxHighlighted(img, it.box, paper, { coreOnly: true })
  );

  const lineHi = items.map((it, idx) => {
    if (isNoise[idx]) return false;
    if (coreHi[idx]) return true;

    let nextHighlightedTopY: number | undefined;
    const belowHighlightedBoxes: PixelBox[] = [];
    for (let j = 0; j < items.length; j++) {
      if (j === idx || isNoise[j] || !coreHi[j]) continue;
      const other = items[j].box;
      const overlapX =
        Math.min(it.box.x + it.box.width, other.x + other.width) - Math.max(it.box.x, other.x);
      if (overlapX >= -8) {
        const sharedX =
          (Math.max(it.box.x, other.x) +
            Math.min(it.box.x + it.box.width, other.x + other.width)) *
          0.5;
        const currB = getBoxVerticalBoundsAtX(it.box, sharedX);
        const otherB = getBoxVerticalBoundsAtX(other, sharedX);
        if (otherB.top > currB.top) {
          belowHighlightedBoxes.push(other);
          if (
            overlapX >= Math.min(it.box.width, other.width) * 0.2 &&
            (nextHighlightedTopY === undefined || otherB.top < nextHighlightedTopY)
          ) {
            nextHighlightedTopY = otherB.top;
          }
        }
      }
    }

    return isBoxHighlighted(img, it.box, paper, {
      nextHighlightedTopY,
      belowHighlightedBoxes,
    });
  });

  // 3. Detectar llaves/corchetes verticales de resaltador en márgenes laterales ({ ... })
  const braceHi = new Array<boolean>(items.length).fill(false);
  const validIndices = items
    .map((_, i) => i)
    .filter((i) => !isNoise[i])
    .sort((a, b) => compareBoxesReadingOrder(items[a].box, items[b].box));

  let p = 0;
  while (p < validIndices.length) {
    const firstIdx = validIndices[p];
    const firstBox = items[firstIdx].box;
    const prevIdx = p > 0 ? validIndices[p - 1] : -1;
    const precededByColon = prevIdx >= 0 && /:\s*$/.test(items[prevIdx].text.trim());
    const isIndented =
      firstBox.x > bodyLeft + medianH * 0.45 || firstBox.width < bodyWidth * 0.86;

    if (!isIndented && !precededByColon) {
      p++;
      continue;
    }

    const group: number[] = [firstIdx];
    let maxGroupW = firstBox.width;
    let q = p + 1;
    while (q < validIndices.length && group.length < 8) {
      const prevItem = items[group[group.length - 1]];
      const prevB = prevItem.box;
      const currB = items[validIndices[q]].box;

      // Si el renglón previo cerró párrafo siendo claramente más corto, termina el bloque con sangría
      if (
        group.length >= 2 &&
        prevB.width < maxGroupW * 0.72 &&
        /[.;?!»"')\]]\s*$/.test(prevItem.text.trim())
      ) {
        break;
      }

      const sharedX =
        (Math.max(prevB.x, currB.x) + Math.min(prevB.x + prevB.width, currB.x + currB.width)) *
        0.5;
      const pb = getBoxVerticalBoundsAtX(prevB, sharedX);
      const cb = getBoxVerticalBoundsAtX(currB, sharedX);
      const vGap = cb.top - pb.bottom;
      const sameIndent = Math.abs(currB.x - firstBox.x) <= medianH * 0.9;

      if (vGap <= medianH * 0.85 && sameIndent && currB.width < bodyWidth * 0.9) {
        group.push(validIndices[q]);
        maxGroupW = Math.max(maxGroupW, currB.width);
        q++;
      } else {
        break;
      }
    }

    const blockLeft = Math.min(...group.map((gi) => items[gi].box.x));
    const blockRight = Math.max(...group.map((gi) => items[gi].box.x + items[gi].box.width));
    const leftBoundsTop = Math.min(
      ...group.map((gi) => getBoxVerticalBoundsAtX(items[gi].box, blockLeft).top)
    );
    const leftBoundsBot = Math.max(
      ...group.map((gi) => getBoxVerticalBoundsAtX(items[gi].box, blockLeft).bottom)
    );
    const rightBoundsTop = Math.min(
      ...group.map((gi) => getBoxVerticalBoundsAtX(items[gi].box, blockRight).top)
    );
    const rightBoundsBot = Math.max(
      ...group.map((gi) => getBoxVerticalBoundsAtX(items[gi].box, blockRight).bottom)
    );

    const marginSpan = Math.min(110, Math.max(35, medianH * 3.2));
    const maxStrokeW = Math.max(16, Math.floor(medianH * 0.68));

    if (group.length < 2 && !precededByColon) {
      p++;
      continue;
    }

    const leftBrace = measureLateralBrace(
      img,
      blockLeft - marginSpan,
      blockLeft - 4,
      leftBoundsTop,
      leftBoundsBot,
      maxStrokeW,
      paper
    );
    const rightBrace = measureLateralBrace(
      img,
      blockRight + 4,
      blockRight + marginSpan,
      rightBoundsTop,
      rightBoundsBot,
      maxStrokeW,
      paper
    );

    const hasStrongSingleBrace =
      (leftBrace.paperRatio >= 0.22 && leftBrace.braceRowRatio >= 0.46) ||
      (rightBrace.paperRatio >= 0.22 && rightBrace.braceRowRatio >= 0.46);
    const hasPairedBraces =
      leftBrace.paperRatio >= 0.2 &&
      rightBrace.paperRatio >= 0.2 &&
      leftBrace.braceRowRatio >= 0.28 &&
      rightBrace.braceRowRatio >= 0.28;

    if (hasStrongSingleBrace || hasPairedBraces) {
      for (const gi of group) {
        braceHi[gi] = true;
      }
    }

    p = q;
  }

  return items.map((item, idx) => {
    if (isNoise[idx]) {
      return { item, highlighted: false, highlightedText: '', isNoise: true };
    }
    if (braceHi[idx]) {
      return {
        item,
        highlighted: true,
        highlightedText: item.text.trim(),
        isNoise: false,
      };
    }
    if (!lineHi[idx]) {
      return { item, highlighted: false, highlightedText: '', isNoise: false };
    }

    const usedUnderline = !coreHi[idx];
    const spanText = extractHighlightedSpanText(
      img,
      item.box,
      item.text,
      paper,
      usedUnderline
    );
    if (!spanText) {
      return { item, highlighted: false, highlightedText: '', isNoise: false };
    }
    return {
      item,
      highlighted: true,
      highlightedText: spanText,
      isNoise: false,
    };
  });
}

export function hasAnyHighlightInImage(img: RgbaImage): boolean {
  const { width, height, data } = img;
  if (width < 8 || height < 8) return true;

  const paper = estimatePaperWhite(img);
  const cellW = 16;
  const cellH = 8;
  let activeCells = 0;

  for (let cy = 0; cy + cellH <= height; cy += cellH) {
    for (let cx = 0; cx + cellW <= width; cx += cellW) {
      let hi = 0;
      let nonInk = 0;
      for (let y = cy; y < cy + cellH; y += 2) {
        const rowOff = y * width * 4;
        for (let x = cx; x < cx + cellW; x += 2) {
          const idx = rowOff + x * 4;
          const kind = classifyBalancedPixel(data[idx], data[idx + 1], data[idx + 2], paper);
          if (kind !== 'ink') {
            nonInk++;
            if (kind === 'highlight') hi++;
          }
        }
      }
      if (nonInk >= 8 && hi / nonInk >= 0.22) {
        activeCells++;
        if (activeCells >= 2) return true;
      }
    }
  }

  return false;
}

export async function checkBlobHasHighlight(blob: Blob): Promise<boolean> {
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    return true;
  }
  try {
    const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
    const maxDim = 360;
    const scale = Math.min(1, maxDim / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(16, Math.round(bitmap.width * scale));
    const h = Math.max(16, Math.round(bitmap.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
      bitmap.close();
      return true;
    }
    ctx.drawImage(bitmap, 0, 0, w, h);
    bitmap.close();

    const imageData = ctx.getImageData(0, 0, w, h);
    return hasAnyHighlightInImage(imageData);
  } catch {
    return true;
  }
}
