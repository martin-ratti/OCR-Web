import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { ocrSelectors, useOcrStore } from '../../../store/useOcrStore';
import { exportDocx, exportSingleTxt } from '../../../lib/exporters';
import { KawaiiModal } from './KawaiiModal';
import { OriginalViewer } from './OriginalViewer';
import { ExtractedEditor, type ExtractedEditorHandle } from './ExtractedEditor';
import { QueueSidebar } from './QueueSidebar';
import { WorkspaceToolbar } from './WorkspaceToolbar';
import { Cpu, ScanLine, UploadCloud } from 'lucide-react';
import { Progress } from '@/components/ui/progress';

import pandaImg from '../../../assets/panda.png';
import monkeyImg from '../../../assets/monkey.png';
import { subscribeTesseractProgress, type TesseractProgress } from '../../../lib/tesseractAdapter';

const MIN_FONT = 12;
const MAX_FONT = 28;

function cleanParagraphs(input: string): string {
  return input.replace(/(?<!\n)\n(?!\n)/g, ' ');
}

export function OcrWorkspace() {
  const files = useOcrStore(ocrSelectors.files);
  const activeFileId = useOcrStore(ocrSelectors.activeFileId);
  const globalStatus = useOcrStore(ocrSelectors.globalStatus);
  const globalProgress = useOcrStore(ocrSelectors.globalProgress);
  const selectedEngine = useOcrStore(ocrSelectors.selectedEngine);
  const fontSize = useOcrStore(ocrSelectors.fontSize);

  const updateFileResult = useOcrStore((s) => s.updateFileResult);
  const setActiveFile = useOcrStore((s) => s.setActiveFile);
  const processAll = useOcrStore((s) => s.processAll);
  const processOne = useOcrStore((s) => s.processOne);
  const clearAll = useOcrStore((s) => s.clearAll);
  const restoreCleared = useOcrStore((s) => s.restoreCleared);
  const cancel = useOcrStore((s) => s.cancel);
  const removeFile = useOcrStore((s) => s.removeFile);
  const retryAllErrors = useOcrStore((s) => s.retryAllErrors);
  const reorderFile = useOcrStore((s) => s.reorderFile);
  const setSelectedEngine = useOcrStore((s) => s.setSelectedEngine);
  const setFontSize = useOcrStore((s) => s.setFontSize);
  const addFiles = useOcrStore((s) => s.addFiles);

  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [tessProgress, setTessProgress] = useState<TesseractProgress | null>(null);

  useEffect(() => subscribeTesseractProgress(setTessProgress), []);
  const editorRef = useRef<ExtractedEditorHandle>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeFile = useMemo(
    () => files.find((f) => f.id === activeFileId),
    [files, activeFileId],
  );
  const counts = useMemo(() => {
    let success = 0;
    let error = 0;
    let pending = 0;
    let processing = 0;
    for (const f of files) {
      if (f.status === 'success') success++;
      else if (f.status === 'error') error++;
      else if (f.status === 'idle') pending++;
      else if (f.status === 'processing') processing++;
    }
    return { success, error, pending, processing };
  }, [files]);

  const working = globalStatus === 'working';
  const canEditorAct = !!activeFile?.resultText;

  const handleCleanFormat = () => {
    if (!activeFile?.resultText) return;
    updateFileResult(activeFile.id, cleanParagraphs(activeFile.resultText));
    toast.success('Párrafos ordenados');
  };

  const handleCopy = async (): Promise<boolean> => {
    if (!activeFile?.resultText) return false;
    try {
      await navigator.clipboard.writeText(activeFile.resultText);
      toast.success('Texto copiado');
      return true;
    } catch {
      toast.error('No se pudo copiar al portapapeles');
      return false;
    }
  };

  const handleSave = async () => {
    if (!activeFile?.resultText) return;
    await exportSingleTxt({ filename: activeFile.file.name, text: activeFile.resultText });
  };
  const handleSaveRef = useRef(handleSave);
  useEffect(() => {
    handleSaveRef.current = handleSave;
  });

  const collectDoneItems = () =>
    files
      .filter((f) => f.status === 'success' && f.resultText)
      .map((f) => ({ filename: f.file.name, text: f.resultText! }));

  const handleExportDocx = async () => {
    const items = collectDoneItems();
    if (items.length === 0) {
      toast.warning('No hay textos extraídos todavía');
      return;
    }
    await exportDocx(items);
    toast.success(`Documento .docx con ${items.length} apunte(s)`);
  };

  const handleCopyAll = async () => {
    const items = collectDoneItems();
    if (items.length === 0) {
      toast.warning('No hay textos extraídos todavía');
      return;
    }
    const joined = items
      .map((it) => `=== ${it.filename} ===\n${it.text}`)
      .join('\n\n');
    try {
      await navigator.clipboard.writeText(joined);
      toast.success(`Copiado todo (${items.length} apuntes)`);
    } catch {
      toast.error('No se pudo copiar todo');
    }
  };

  const handleEditorChange = (text: string) => {
    if (!activeFile) return;
    updateFileResult(activeFile.id, text);
  };

  const handleAddMoreClick = () => fileInputRef.current?.click();

  const handleFilesPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files) return;
    const arr = Array.from(e.target.files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) {
      toast.warning('Sólo imágenes permitidas');
    } else {
      addFiles(arr);
      toast.success(`${arr.length} imagen(es) agregada(s)`);
    }
    e.target.value = '';
  };

  const handleClearWithUndo = () => {
    setShowConfirmClear(false);
    const beforeCount = files.length;
    clearAll();
    if (beforeCount === 0) return;
    toast.success(`Borraste ${beforeCount} archivo(s)`, {
      duration: 8000,
      action: {
        label: 'Deshacer',
        onClick: () => {
          const ok = restoreCleared();
          if (ok) toast.success('Restaurado');
          else toast.error('Ya no se puede deshacer');
        },
      },
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inEditable =
        target?.tagName === 'TEXTAREA' ||
        target?.tagName === 'INPUT' ||
        target?.isContentEditable;

      if (e.key === 'Escape') {
        if (working) {
          cancel();
          e.preventDefault();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        if (canEditorAct) {
          e.preventDefault();
          editorRef.current?.openSearch();
        }
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        if (canEditorAct) {
          e.preventDefault();
          handleSaveRef.current();
        }
        return;
      }

      if (inEditable) return;

      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const idx = files.findIndex((f) => f.id === activeFileId);
        if (idx < 0) return;
        const next = e.key === 'ArrowDown' ? Math.min(files.length - 1, idx + 1) : Math.max(0, idx - 1);
        if (next !== idx) {
          setActiveFile(files[next].id);
          e.preventDefault();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [working, canEditorAct, files, activeFileId, cancel, setActiveFile]);

  const onDragOver = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.items ?? []).some((i) => i.kind === 'file')) return;
    e.preventDefault();
    setIsDraggingOver(true);
  };
  const onDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setIsDraggingOver(false);
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const arr = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) {
      toast.warning('Sólo imágenes permitidas');
    } else {
      addFiles(arr);
      toast.success(`${arr.length} imagen(es) agregada(s)`);
    }
  };

  return (
    <div
      className="relative w-full min-h-[calc(100vh-6rem)] mx-auto"
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <div
        className="absolute z-0 pointer-events-none motion-safe:animate-[bounce_5s_infinite] hidden lg:block"
        style={{ left: 'clamp(-200px, -8vw, -40px)', top: '15%' }}
        aria-hidden
      >
        <img
          src={pandaImg}
          alt=""
          className="w-44 h-auto drop-shadow-xl rotate-[-15deg]"
        />
      </div>
      <div
        className="absolute z-0 pointer-events-none motion-safe:animate-[bounce_6s_infinite] hidden lg:block"
        style={{ right: 'clamp(-200px, -8vw, -40px)', top: '40%' }}
        aria-hidden
      >
        <img
          src={monkeyImg}
          alt=""
          className="w-44 h-auto drop-shadow-xl rotate-[15deg] scale-x-[-1]"
        />
      </div>

      {isDraggingOver && (
        <div
          className="absolute inset-0 z-30 flex items-center justify-center bg-pink-100/80 border-4 border-dashed border-pink-400 rounded-3xl pointer-events-none"
          aria-hidden
        >
          <div className="flex flex-col items-center gap-2 text-pink-600">
            <UploadCloud className="w-16 h-16 motion-safe:animate-bounce" />
            <span className="font-extrabold text-lg">¡Sueltalo acá, negra!</span>
          </div>
        </div>
      )}

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/*"
        onChange={handleFilesPicked}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      <div className="flex flex-col h-full w-full paper-card overflow-visible relative z-10 group">
        <WorkspaceToolbar
          selectedEngine={selectedEngine}
          onSelectEngine={setSelectedEngine}
          working={working}
          pendingPlusErrorCount={counts.pending + counts.error}
          successCount={counts.success}
          canEditorAct={canEditorAct}
          fontSize={fontSize}
          minFontSize={MIN_FONT}
          maxFontSize={MAX_FONT}
          onProcessAll={processAll}
          onCancel={cancel}
          onAddMore={handleAddMoreClick}
          onClear={() => setShowConfirmClear(true)}
          onCopyAll={handleCopyAll}
          onExportDocx={handleExportDocx}
          onCleanFormat={handleCleanFormat}
          onFontSizeChange={setFontSize}
        />

        {working && (
          <div
            className="bg-pink-50 border-b-2 border-pink-100 px-4 py-1.5"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between text-xs font-extrabold text-pink-600 mb-1.5">
              <span className="inline-flex items-center gap-1.5">
                <ScanLine className="w-3.5 h-3.5 motion-safe:animate-pulse" aria-hidden />
                Procesando {counts.processing || '—'} /{' '}
                {counts.pending + counts.error + counts.processing}
              </span>
              <span>{globalProgress}%</span>
            </div>
            <Progress
              value={globalProgress}
              aria-label="Progreso del lote"
              className="h-2 bg-pink-100 [&>div]:bg-pink-400"
            />
          </div>
        )}

        {selectedEngine === 'paddle' && tessProgress && tessProgress.status === 'loading' && (
          <div
            className="bg-indigo-50 border-b-2 border-indigo-100 px-4 py-1.5"
            role="status"
            aria-live="polite"
          >
            <div className="flex items-center justify-between text-xs font-extrabold text-indigo-600 mb-1.5">
              <span className="inline-flex items-center gap-1.5">
                <Cpu className="w-3.5 h-3.5 motion-safe:animate-pulse" aria-hidden />
                Cargando motor local (1ª vez, ~10 MB)...
              </span>
              <span>{Math.round(tessProgress.progress * 100)}%</span>
            </div>
            <Progress
              value={Math.round(tessProgress.progress * 100)}
              aria-label="Progreso de carga del motor local"
              className="h-2 bg-indigo-100 [&>div]:bg-indigo-400"
            />
          </div>
        )}

        <div className="flex flex-col md:flex-row flex-1 min-h-0 bg-transparent">
          <QueueSidebar
            files={files}
            activeFileId={activeFileId}
            working={working}
            successCount={counts.success}
            errorCount={counts.error}
            onSelect={setActiveFile}
            onRetry={processOne}
            onRemove={removeFile}
            onRetryAllErrors={retryAllErrors}
            collapsed={sidebarCollapsed}
            onToggleCollapsed={() => setSidebarCollapsed((v) => !v)}
            onReorder={reorderFile}
          />

          <div className="flex flex-1 min-w-0 flex-col md:flex-row">
            <OriginalViewer activeFile={activeFile} />
            <ExtractedEditor
              ref={editorRef}
              activeFile={activeFile}
              fontSize={fontSize}
              onChange={handleEditorChange}
              onCopy={handleCopy}
            />
          </div>
        </div>
      </div>

      <KawaiiModal
        isOpen={showConfirmClear}
        onClose={() => setShowConfirmClear(false)}
        onConfirm={handleClearWithUndo}
        title="¿Vaciamos todo?"
        description="Vamos a borrar todo. Tenés 8 segundos para deshacer luego."
        confirmText="Sip, borralo"
        cancelText="Nopi, dejalo"
        variant="danger"
      />
    </div>
  );
}
