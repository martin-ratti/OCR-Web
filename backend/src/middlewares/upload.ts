import multer, { FileFilterCallback } from 'multer';
import type { Request } from 'express';
import { HttpError } from './errorHandler';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

const ALLOWED_EXTENSIONS_RE = /\.(jpe?g|png|webp|gif|heic|heif)$/i;

const VALID_HEIF_BRANDS = new Set([
  'heic',
  'heix',
  'hevc',
  'hevx',
  'heim',
  'heis',
  'hevm',
  'hevs',
  'mif1',
  'msf1',
]);

function imageFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  const mime = (file.mimetype || '').toLowerCase();
  const isEmptyOrOctet = !mime || mime === 'application/octet-stream';
  if (ALLOWED_MIMES.has(mime) || (isEmptyOrOctet && ALLOWED_EXTENSIONS_RE.test(file.originalname || ''))) {
    cb(null, true);
  } else {
    cb(
      new HttpError(
        415,
        `Tipo de archivo no soportado (${file.mimetype || 'desconocido'}). Solo se permiten imágenes JPEG, PNG, WebP, GIF o HEIC.`
      )
    );
  }
}

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

function hasValidHeifFtypBrand(buf: Buffer): boolean {
  if (buf.length < 12) return false;
  if (buf[4] !== 0x66 || buf[5] !== 0x74 || buf[6] !== 0x79 || buf[7] !== 0x70) {
    return false;
  }
  const majorBrand = buf.subarray(8, 12).toString('ascii').toLowerCase();
  if (VALID_HEIF_BRANDS.has(majorBrand)) return true;

  const declaredBoxSize = buf.readUInt32BE(0);
  const boxEnd =
    declaredBoxSize >= 16 && declaredBoxSize <= buf.length
      ? Math.min(declaredBoxSize, 64)
      : Math.min(buf.length, 64);

  for (let offset = 16; offset + 4 <= boxEnd; offset += 4) {
    const compatBrand = buf.subarray(offset, offset + 4).toString('ascii').toLowerCase();
    if (VALID_HEIF_BRANDS.has(compatBrand)) return true;
  }
  return false;
}

export function hasValidImageMagicBytes(buf: Buffer): boolean {
  if (!buf || buf.length < 12) return false;
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    return true;
  }
  // GIF: GIF87a / GIF89a
  if (
    buf[0] === 0x47 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x38 &&
    (buf[4] === 0x37 || buf[4] === 0x39) &&
    buf[5] === 0x61
  ) {
    return true;
  }
  // WEBP: RIFF....WEBP
  if (
    buf[0] === 0x52 &&
    buf[1] === 0x49 &&
    buf[2] === 0x46 &&
    buf[3] === 0x46 &&
    buf[8] === 0x57 &&
    buf[9] === 0x45 &&
    buf[10] === 0x42 &&
    buf[11] === 0x50
  ) {
    return true;
  }
  // HEIC / HEIF (ISO BMFF with ftyp at byte offset 4 and valid HEIF brand)
  if (hasValidHeifFtypBrand(buf)) {
    return true;
  }

  return false;
}

export const ALLOWED_IMAGE_MIMES = ALLOWED_MIMES;
