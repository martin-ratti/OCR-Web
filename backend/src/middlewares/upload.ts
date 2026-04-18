import multer, { FileFilterCallback } from 'multer';
import type { Request } from 'express';

const ALLOWED_MIMES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/heic',
  'image/heif',
]);

function imageFilter(_req: Request, file: Express.Multer.File, cb: FileFilterCallback) {
  if (ALLOWED_MIMES.has(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported mimetype: ${file.mimetype}. Only JPEG, PNG, WebP, GIF, HEIC are allowed.`));
  }
}

export const uploadImage = multer({
  storage: multer.memoryStorage(),
  fileFilter: imageFilter,
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
});

export const ALLOWED_IMAGE_MIMES = ALLOWED_MIMES;
