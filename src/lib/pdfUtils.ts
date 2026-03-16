import { PDFDocument } from "pdf-lib";

export function base64ToBlob(base64: string, contentType: string): Blob {
  const byteCharacters = atob(base64);
  const byteNumbers = new Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    byteNumbers[i] = byteCharacters.charCodeAt(i);
  }
  return new Blob([new Uint8Array(byteNumbers)], { type: contentType });
}

export async function mergePdfs(pdfBase64Array: string[]): Promise<Blob> {
  const mergedPdf = await PDFDocument.create();
  for (const base64 of pdfBase64Array) {
    try {
      const pdfBytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const pdf = await PDFDocument.load(pdfBytes);
      const pages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
      for (const page of pages) {
        mergedPdf.addPage(page);
      }
    } catch (e) {
      console.warn("Nu s-a putut adăuga un PDF la merge:", e);
    }
  }
  const mergedBytes = await mergedPdf.save();
  return new Blob([mergedBytes.buffer as ArrayBuffer], { type: "application/pdf" });
}

export function openPdfUrls(urls: string[]): string[] {
  const blocked: string[] = [];
  for (const url of urls) {
    const opened = window.open(url, "_blank");
    if (!opened) blocked.push(url);
  }
  return blocked;
}
