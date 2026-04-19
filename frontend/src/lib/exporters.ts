export interface ExportItem {
  filename: string;
  text: string;
}

function safeBase(name: string): string {
  return name.replace(/\.[^.]+$/, '');
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
  items.forEach((it) => zip.file(`Apunte_${safeBase(it.filename)}.txt`, it.text));
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
