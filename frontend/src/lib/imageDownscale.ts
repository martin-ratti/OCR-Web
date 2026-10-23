const CLOUD_MAX_DIMENSION = 1536;
const LOCAL_MAX_DIMENSION = 1760;
const QUALITY = 0.84;
const SMALL_BYTES_PASSTHROUGH = 280 * 1024;

export interface DownscaleOptions {
  target?: 'cloud' | 'local';
  rotationDeg?: 0 | 90 | 180 | 270;
  /**
   * Si es true y la imagen es apaisada sin rotación manual, detecta mediante energía
   * de proyección fila/columna si los renglones impresos corren verticalmente (foto
   * sacada de costado con EXIF borrado por WhatsApp) y la endereza 270° CW.
   */
  autoUprightSideways?: boolean;
}

/**
 * Detecta en ~1 ms si una página apaisada contiene renglones de texto verticales
 * comparando la variación media entre columnas adyacentes vs filas adyacentes.
 */
export function detectSidewaysTextPage(img: {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}): boolean {
  const { width: w, height: h, data } = img;
  if (w <= h * 1.15 || w < 64 || h < 64) return false;

  const x0 = Math.floor(w * 0.16);
  const x1 = Math.floor(w * 0.84);
  const y0 = Math.floor(h * 0.16);
  const y1 = Math.floor(h * 0.84);
  const xSamples = Math.max(1, Math.ceil((x1 - x0) / 4));
  const ySamples = Math.max(1, Math.ceil((y1 - y0) / 4));

  let rowDiffSum = 0;
  let rowDiffCount = 0;
  let prevRowAvg = 0;

  for (let y = y0; y < y1; y += 2) {
    let sum = 0;
    for (let x = x0; x < x1; x += 4) {
      const i = (y * w + x) * 4;
      sum += (data[i] + data[i + 1] + data[i + 2]) * 0.3333;
    }
    const avg = sum / xSamples;
    if (y > y0) {
      rowDiffSum += Math.abs(avg - prevRowAvg);
      rowDiffCount++;
    }
    prevRowAvg = avg;
  }

  let colDiffSum = 0;
  let colDiffCount = 0;
  let prevColAvg = 0;

  for (let x = x0; x < x1; x += 2) {
    let sum = 0;
    for (let y = y0; y < y1; y += 4) {
      const i = (y * w + x) * 4;
      sum += (data[i] + data[i + 1] + data[i + 2]) * 0.3333;
    }
    const avg = sum / ySamples;
    if (x > x0) {
      colDiffSum += Math.abs(avg - prevColAvg);
      colDiffCount++;
    }
    prevColAvg = avg;
  }

  if (rowDiffCount === 0 || colDiffCount === 0) return false;
  const rowEnergy = rowDiffSum / rowDiffCount;
  const colEnergy = colDiffSum / colDiffCount;
  if (colEnergy < 0.6) return false;
  if (rowEnergy < 0.25) return colEnergy >= 1.5;

  return colEnergy / rowEnergy >= 1.32;
}

/**
 * Redimensiona y normaliza la orientación EXIF (y rotación explícita o lateral) antes de enviarla:
 * - Usa `{ imageOrientation: 'from-image' }` para respetar metadatos EXIF.
 * - Limita siempre las dimensiones máximas (`1536px` para IA cloud), ahorrando tokens de visión.
 * - Prefiere `image/webp` con fallback a JPEG.
 */
export async function downscaleImage(
  file: File,
  options: DownscaleOptions = {}
): Promise<File> {
  if (!/^image\/(jpeg|png|webp|heic|heif|gif)$/i.test(file.type)) return file;
  if (typeof createImageBitmap === 'undefined' || typeof document === 'undefined') {
    return file;
  }

  const maxDim = options.target === 'local' ? LOCAL_MAX_DIMENSION : CLOUD_MAX_DIMENSION;
  let rot: 0 | 90 | 180 | 270 = options.rotationDeg ?? 0;

  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const { width, height } = bitmap;
    const longest = Math.max(width, height);

    if (rot === 0 && options.autoUprightSideways && width > height * 1.15) {
      const probeScale = Math.min(1, 380 / longest);
      const pw = Math.max(32, Math.round(width * probeScale));
      const ph = Math.max(32, Math.round(height * probeScale));
      const probeCanvas = document.createElement('canvas');
      probeCanvas.width = pw;
      probeCanvas.height = ph;
      const pctx = probeCanvas.getContext('2d', { willReadFrequently: true });
      if (pctx) {
        pctx.drawImage(bitmap, 0, 0, pw, ph);
        const pData = pctx.getImageData(0, 0, pw, ph);
        if (detectSidewaysTextPage(pData)) {
          rot = 270;
        }
      }
    }

    if (
      rot === 0 &&
      longest <= maxDim &&
      file.size <= SMALL_BYTES_PASSTHROUGH &&
      file.type !== 'image/png'
    ) {
      bitmap.close();
      return file;
    }

    const scale = longest > maxDim ? maxDim / longest : 1;
    const scaledW = Math.max(1, Math.round(width * scale));
    const scaledH = Math.max(1, Math.round(height * scale));
    const swapAxes = rot === 90 || rot === 270;
    const canvasW = swapAxes ? scaledH : scaledW;
    const canvasH = swapAxes ? scaledW : scaledH;

    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return file;
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';

    if (rot !== 0) {
      ctx.save();
      ctx.translate(canvasW / 2, canvasH / 2);
      ctx.rotate((rot * Math.PI) / 180);
      ctx.drawImage(bitmap, -scaledW / 2, -scaledH / 2, scaledW, scaledH);
      ctx.restore();
    } else {
      ctx.drawImage(bitmap, 0, 0, scaledW, scaledH);
    }
    bitmap.close();

    let outMime = 'image/webp';
    let ext = '.webp';
    let blob: Blob | null = await new Promise((res) =>
      canvas.toBlob(res, outMime, QUALITY)
    );

    if (!blob || blob.type !== 'image/webp') {
      outMime = 'image/jpeg';
      ext = '.jpg';
      blob = await new Promise((res) => canvas.toBlob(res, outMime, QUALITY));
    }

    if (!blob) return file;
    if (rot === 0 && scale === 1 && blob.size >= file.size) return file;

    const newName = file.name.replace(/\.[^.]+$/, '') + ext;
    return new File([blob], newName, { type: outMime, lastModified: Date.now() });
  } catch {
    return file;
  }
}
