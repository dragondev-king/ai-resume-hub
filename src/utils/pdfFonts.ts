import { jsPDF } from 'jspdf';

/**
 * PDF-embedded fonts (open-licensed DejaVu Sans).
 * Verdana / Lucida Sans cannot be redistributed with the deployed site;
 * DOCX still references those names (Word resolves them on the reader’s machine).
 */
export const PDF_FONT_HEADING = 'DejaVu Sans';
export const PDF_FONT_BODY = 'DejaVu Sans';

type FontFace = {
  file: string;
  family: string;
  style: 'normal' | 'bold';
};

/** Bundled via scripts/copy-pdf-fonts.js → public/fonts (from dejavu-fonts-ttf). */
const FONT_FACES: FontFace[] = [
  { file: 'DejaVuSans.ttf', family: PDF_FONT_BODY, style: 'normal' },
  { file: 'DejaVuSans-Bold.ttf', family: PDF_FONT_BODY, style: 'bold' },
];

let fontsReady: Promise<boolean> | null = null;
const vfsCache = new Map<string, string>();

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const end = Math.min(i + chunkSize, bytes.length);
    let chunk = '';
    for (let j = i; j < end; j++) {
      chunk += String.fromCharCode(bytes[j]);
    }
    binary += chunk;
  }
  return btoa(binary);
}

async function loadFontBase64(file: string): Promise<string | null> {
  if (vfsCache.has(file)) return vfsCache.get(file)!;
  try {
    const res = await fetch(`${process.env.PUBLIC_URL || ''}/fonts/${file}`);
    if (!res.ok) {
      console.warn(`Resume PDF font missing: /fonts/${file}`);
      return null;
    }
    const base64 = arrayBufferToBase64(await res.arrayBuffer());
    vfsCache.set(file, base64);
    return base64;
  } catch (err) {
    console.warn(`Failed to load resume PDF font ${file}`, err);
    return null;
  }
}

/** Prefetch DejaVu fonts for jsPDF (included in the build via public/fonts). */
export function prefetchResumePdfFonts(): Promise<boolean> {
  if (!fontsReady) {
    fontsReady = (async () => {
      const results = await Promise.all(FONT_FACES.map((f) => loadFontBase64(f.file)));
      return results.every(Boolean);
    })();
  }
  return fontsReady;
}

/**
 * Register custom fonts on a jsPDF instance.
 * Falls back to helvetica if fonts failed to load.
 */
export async function registerResumePdfFonts(doc: jsPDF): Promise<{
  heading: string;
  body: string;
}> {
  await prefetchResumePdfFonts();

  let ok = true;
  for (const face of FONT_FACES) {
    const base64 = vfsCache.get(face.file);
    if (!base64) {
      ok = false;
      continue;
    }
    doc.addFileToVFS(face.file, base64);
    doc.addFont(face.file, face.family, face.style);
  }

  const family = ok ? PDF_FONT_BODY : 'helvetica';
  return { heading: family, body: family };
}
