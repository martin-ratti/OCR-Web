export interface ExportItem {
  filename: string;
  text: string;
}

function safeBase(name: string): string {
  return name.replace(/\.[^.]+$/, '');
}

export function buildUniqueZipFilenames(items: ExportItem[]): Array<{ entryName: string; text: string }> {
  const counts = new Map<string, number>();
  return items.map((it) => {
    const base = safeBase(it.filename);
    const key = base.toLowerCase();
    const seen = (counts.get(key) ?? 0) + 1;
    counts.set(key, seen);
    const suffix = seen > 1 ? `_${seen}` : '';
    return {
      entryName: `Apunte_${base}${suffix}.txt`,
      text: it.text,
    };
  });
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function exportZipTxt(items: ExportItem[]): Promise<void> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const entries = buildUniqueZipFilenames(items);
  entries.forEach(({ entryName, text }) => zip.file(entryName, text));
  const blob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(blob, `Apuntes_${items.length}_archivos.zip`);
}

export async function exportSingleTxt(item: ExportItem): Promise<void> {
  const blob = new Blob([item.text], { type: 'text/plain;charset=utf-8' });
  triggerDownload(blob, `Apunte_${safeBase(item.filename)}.txt`);
}

export async function exportDocx(items: ExportItem[]): Promise<void> {
  const docx = await import('docx');
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = docx;

  const children = items.flatMap((item, idx) => {
    const heading = new Paragraph({
      text: safeBase(item.filename),
      heading: HeadingLevel.HEADING_2,
      spacing: { before: idx === 0 ? 0 : 240, after: 120 },
    });
    const paragraphs = item.text.split(/\n{2,}/).map(
      (block) =>
        new Paragraph({
          children: block.split('\n').flatMap((line, i) => {
            const runs = [new TextRun({ text: line })];
            if (i < block.split('\n').length - 1) runs.push(new TextRun({ text: '', break: 1 }));
            return runs;
          }),
          spacing: { after: 120, line: 360 },
        }),
    );
    return [heading, ...paragraphs];
  });

  const doc = new Document({
    creator: 'OCR Web',
    title: 'Apuntes',
    sections: [{ properties: {}, children }],
  });

  const blob = await Packer.toBlob(doc);
  triggerDownload(blob, `Apuntes_${items.length}_archivos.docx`);
}
