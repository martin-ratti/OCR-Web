import { toast } from 'sonner';
import type { AddFilesResult } from '../store/useOcrStore';

const MAX_NAMES_IN_TOAST = 3;

export const SUPPORTED_IMAGE_MIMES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

export const SUPPORTED_IMAGE_EXTENSIONS_RE = /\.(jpe?g|png|webp|heic|heif)$/i;
export const UNSUPPORTED_IMAGE_EXTENSIONS_RE = /\.(svg|bmp|gif|tiff?|ico|avif|psd|raw)$/i;
export const FILE_INPUT_ACCEPT =
  'image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif';

export function isSupportedImageFile(file: Pick<File, 'name' | 'type'>): boolean {
  const mime = (file.type || '').trim().toLowerCase();
  const name = (file.name || '').trim();

  if (UNSUPPORTED_IMAGE_EXTENSIONS_RE.test(name)) {
    return false;
  }
  if (mime && SUPPORTED_IMAGE_MIMES.has(mime)) {
    return true;
  }
  if ((!mime || mime === 'application/octet-stream') && SUPPORTED_IMAGE_EXTENSIONS_RE.test(name)) {
    return true;
  }
  return false;
}

export function partitionSupportedImages(files: FileList | File[]): {
  images: File[];
  rejected: number;
  rejectedNames: string[];
} {
  const arr = Array.from(files);
  const images: File[] = [];
  const rejectedNames: string[] = [];

  for (const f of arr) {
    if (isSupportedImageFile(f)) {
      images.push(f);
    } else {
      rejectedNames.push(f.name);
    }
  }

  return {
    images,
    rejected: rejectedNames.length,
    rejectedNames,
  };
}

function summarize(names: string[]): string {
  if (names.length <= MAX_NAMES_IN_TOAST) return names.join(', ');
  const head = names.slice(0, MAX_NAMES_IN_TOAST).join(', ');
  return `${head} y ${names.length - MAX_NAMES_IN_TOAST} más`;
}

export function reportAddFilesResult(
  result: AddFilesResult,
  mimeRejected = 0,
  rejectedNames: string[] = []
) {
  const { acceptedCount, duplicates, oversized, capExceeded } = result;

  if (oversized.length > 0) {
    toast.error(
      `${oversized.length} archivo(s) muy pesado(s) (máx 5 MB): ${summarize(oversized)}`,
      { duration: 6000 },
    );
  }

  if (duplicates.length > 0) {
    toast.warning(
      `${duplicates.length} duplicado(s) ignorado(s): ${summarize(duplicates)}`,
      { duration: 5000 },
    );
  }

  if (capExceeded > 0) {
    toast.warning(`Límite 200 archivos. ${capExceeded} no entraron.`);
  }

  if (mimeRejected > 0) {
    const detail = rejectedNames.length > 0 ? `: ${summarize(rejectedNames)}` : '';
    toast.warning(
      `${mimeRejected} archivo(s) rechazado(s)${detail}. Solo se admiten JPG, PNG, WebP o HEIC.`
    );
  }

  if (acceptedCount > 0) {
    toast.success(`${acceptedCount} imagen(es) agregada(s)`);
  }
}
