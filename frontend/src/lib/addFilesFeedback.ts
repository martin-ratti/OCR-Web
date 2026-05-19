import { toast } from 'sonner';
import type { AddFilesResult } from '../store/useOcrStore';

const MAX_NAMES_IN_TOAST = 3;

function summarize(names: string[]): string {
  if (names.length <= MAX_NAMES_IN_TOAST) return names.join(', ');
  const head = names.slice(0, MAX_NAMES_IN_TOAST).join(', ');
  return `${head} y ${names.length - MAX_NAMES_IN_TOAST} más`;
}

export function reportAddFilesResult(result: AddFilesResult, mimeRejected = 0) {
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
    toast.warning(`${mimeRejected} archivo(s) ignorado(s) — sólo imágenes.`);
  }

  if (acceptedCount > 0) {
    toast.success(`${acceptedCount} imagen(es) agregada(s)`);
  }
}
