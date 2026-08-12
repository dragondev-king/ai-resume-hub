import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { getUseAiEnhancedJobTitleForProfile } from './profileMetadata';
import type { GenerateDocxOptions } from './docxGenerator';
import { formatDateRange, resolveResumeExperience } from './docxGenerator';
import { registerResumePdfFonts } from './pdfFonts';
import {
  RESUME_COLORS,
  RESUME_PDF_SIZES,
  RESUME_PAGE_MARGIN_PT,
  RESUME_SPACING,
  buildResumeSkillSections,
  ensureTrailingPeriod,
  parseBoldMarkup,
  type BoldTextSegment,
} from './resumeLayout';

interface GeneratedResume {
  summary: string;
  experience: any[];
  skills: string[];
}

type Profile = ProfileWithDetailsRPC;

type StyledToken = { text: string; bold: boolean; color: [number, number, number] };

function resolveUseAiEnhancedJobTitle(options?: GenerateDocxOptions, profile?: Profile): boolean {
  if (options?.useAiEnhancedJobTitle !== undefined) return options.useAiEnhancedJobTitle;
  if (profile) return getUseAiEnhancedJobTitleForProfile(profile);
  return false;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export async function generateResumePdf(
  generatedResume: GeneratedResume,
  fileName: string,
  profile?: Profile,
  options?: GenerateDocxOptions
): Promise<void> {
  const useAiEnhancedJobTitle = resolveUseAiEnhancedJobTitle(options, profile);
  const includeLinkedIn = options?.includeLinkedIn !== false;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const { heading: fontHeading, body: fontBody } = await registerResumePdfFonts(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = RESUME_PAGE_MARGIN_PT;
  const maxW = pageWidth - 2 * margin;
  const leftColW = 110;
  const rightColX = margin + leftColW + 12;
  const rightColW = maxW - leftColW - 12;
  let y = margin;

  const primary = hexToRgb(RESUME_COLORS.primary);
  const accent = hexToRgb(RESUME_COLORS.accent);
  const body = hexToRgb(RESUME_COLORS.body);
  const muted = hexToRgb(RESUME_COLORS.muted);

  const lineHeight = (pt: number) => pt * RESUME_SPACING.pdfLineHeight;
  const charSpace = RESUME_SPACING.pdfCharSpace;

  const needSpace = (h: number) => {
    if (y + h > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const setColor = (rgb: [number, number, number]) => {
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  };

  const setFont = (family: string, bold: boolean) => {
    doc.setFont(family, bold ? 'bold' : 'normal');
  };

  const measureText = (text: string, fontSize: number, family: string, bold: boolean) => {
    setFont(family, bold);
    doc.setFontSize(fontSize);
    return doc.getTextWidth(text) + Math.max(0, text.length - 1) * charSpace;
  };

  /** Flow styled tokens across lines within maxWidth (contact + mixed body). */
  const writeStyledFlow = (
    tokens: StyledToken[],
    fontSize: number,
    x: number,
    maxWidth: number,
    family: string = fontBody
  ) => {
    const lh = lineHeight(fontSize);
    let xCursor = x;
    needSpace(lh);

    for (const token of tokens) {
      const isSpace = /^\s+$/.test(token.text);
      const width = measureText(token.text, fontSize, family, token.bold);

      if (!isSpace && xCursor > x && xCursor + width > x + maxWidth) {
        y += lh;
        needSpace(lh);
        xCursor = x;
      }

      if (!isSpace && width > maxWidth) {
        let chunk = '';
        for (const ch of token.text) {
          const next = chunk + ch;
          const avail = maxWidth - (xCursor - x);
          if (chunk && measureText(next, fontSize, family, token.bold) > avail) {
            setFont(family, token.bold);
            doc.setFontSize(fontSize);
            setColor(token.color);
            doc.text(chunk, xCursor, y, { charSpace });
            y += lh;
            needSpace(lh);
            xCursor = x;
            chunk = ch;
          } else {
            chunk = next;
          }
        }
        if (chunk) {
          setFont(family, token.bold);
          doc.setFontSize(fontSize);
          setColor(token.color);
          doc.text(chunk, xCursor, y, { charSpace });
          xCursor += measureText(chunk, fontSize, family, token.bold);
        }
        continue;
      }

      setFont(family, token.bold);
      doc.setFontSize(fontSize);
      setColor(token.color);
      doc.text(token.text, xCursor, y, { charSpace });
      xCursor += width;
    }

    y += lh;
  };

  const writeWrapped = (
    text: string,
    fontSize: number,
    bold: boolean,
    x: number,
    maxWidth: number,
    color: [number, number, number] = body,
    family: string = fontBody
  ) => {
    const effectiveMax = Math.max(40, maxWidth - charSpace * 4);
    setFont(family, bold);
    doc.setFontSize(fontSize);
    setColor(color);
    const lines = doc.splitTextToSize(text, effectiveMax) as string[];
    const lh = lineHeight(fontSize);
    for (const line of lines) {
      needSpace(lh);
      doc.text(line, x, y, { charSpace });
      y += lh;
    }
  };

  const writeMixedWrapped = (
    segments: BoldTextSegment[],
    fontSize: number,
    x: number,
    maxWidth: number,
    color: [number, number, number] = body,
    family: string = fontBody
  ) => {
    const tokens: StyledToken[] = [];
    for (const seg of segments) {
      for (const part of seg.text.split(/(\s+)/)) {
        if (!part) continue;
        tokens.push({ text: part, bold: seg.bold, color });
      }
    }
    writeStyledFlow(tokens, fontSize, x, maxWidth, family);
  };

  const sectionHeader = (title: string) => {
    y += 8;
    needSpace(lineHeight(RESUME_PDF_SIZES.section) + 8);
    setFont(fontHeading, true);
    doc.setFontSize(RESUME_PDF_SIZES.section);
    setColor(primary);
    doc.text(title.toUpperCase(), margin, y);
    y += 3;
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;
  };

  const bodySize = RESUME_PDF_SIZES.body;
  const bodyLh = lineHeight(bodySize);
  const skillSections = buildResumeSkillSections(generatedResume.skills ?? []);

  // —— Header ——
  const name = profile
    ? `${profile.first_name} ${profile.last_name}`.toUpperCase()
    : 'PROFESSIONAL RESUME';
  needSpace(28);
  setFont(fontHeading, true);
  doc.setFontSize(RESUME_PDF_SIZES.name);
  setColor(primary);
  doc.text(name, margin, y, { charSpace: charSpace * 0.5 });
  y += lineHeight(RESUME_PDF_SIZES.name);

  if (profile?.title) {
    needSpace(16);
    // Role under name uses body font (matches DOCX)
    setFont(fontBody, true);
    doc.setFontSize(RESUME_PDF_SIZES.title);
    setColor(accent);
    doc.text(profile.title, margin, y, { charSpace: charSpace * 0.5 });
    y += lineHeight(RESUME_PDF_SIZES.title) + 8;
  }

  if (profile) {
    const contactParts: { label: string; value: string }[] = [];
    if (profile.phone) contactParts.push({ label: 'Phone', value: profile.phone });
    if (profile.email) contactParts.push({ label: 'Email', value: profile.email });
    if (profile.location) contactParts.push({ label: 'Location', value: profile.location });
    if (includeLinkedIn && profile.linkedin) contactParts.push({ label: 'LinkedIn', value: profile.linkedin });
    if (profile.portfolio) contactParts.push({ label: 'Portfolio', value: profile.portfolio });

    if (contactParts.length) {
      for (const part of contactParts) {
        writeStyledFlow(
          [
            { text: `${part.label}: `, bold: true, color: accent },
            { text: part.value, bold: false, color: body },
          ],
          bodySize,
          margin,
          maxW,
          fontBody
        );
      }

      y += 2;
      doc.setDrawColor(primary[0], primary[1], primary[2]);
      doc.setLineWidth(1.2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 14;
    }
  }

  // —— Summary ——
  if (generatedResume.summary) {
    sectionHeader('Summary');
    writeMixedWrapped(parseBoldMarkup(generatedResume.summary), bodySize, margin, maxW, body, fontBody);
  }

  // —— Skills ——
  sectionHeader('Skills');
  for (const cat of skillSections) {
    writeMixedWrapped(
      [
        { text: `${cat.label}: `, bold: true },
        { text: cat.skills.join(', '), bold: false },
      ],
      bodySize,
      margin,
      maxW,
      body,
      fontBody
    );
  }

  // —— Education ——
  if (profile?.education?.length) {
    sectionHeader('Education');
    for (let index = 0; index < profile.education.length; index++) {
      const edu = profile.education[index];
      if (index > 0) y += 6;

      const degreeText = [edu.degree, edu.field].filter(Boolean).join(' in ');
      const edr = formatDateRange(edu.start_date, edu.end_date);

      needSpace(bodyLh * 2);
      const startY = y;
      let leftY = startY;
      let rightY = startY;

      if (edr) {
        setFont(fontBody, true);
        doc.setFontSize(bodySize);
        setColor(primary);
        for (const line of doc.splitTextToSize(edr, leftColW) as string[]) {
          doc.text(line, margin, leftY, { charSpace });
          leftY += bodyLh;
        }
      }

      if (degreeText) {
        setFont(fontBody, true);
        doc.setFontSize(bodySize);
        setColor(primary);
        for (const line of doc.splitTextToSize(degreeText, rightColW) as string[]) {
          doc.text(line, rightColX, rightY, { charSpace });
          rightY += bodyLh;
        }
      }
      if (edu.school) {
        setFont(fontBody, false);
        doc.setFontSize(bodySize);
        setColor(accent);
        doc.text(edu.school, rightColX, rightY, { charSpace });
        rightY += bodyLh;
      }

      y = Math.max(leftY, rightY);
    }
  }

  // —— Experience ——
  const experienceEntries = resolveResumeExperience(
    profile?.experience ?? [],
    generatedResume.experience ?? [],
    useAiEnhancedJobTitle
  );

  if (experienceEntries.length) {
    sectionHeader('Experience');
    for (let index = 0; index < experienceEntries.length; index++) {
      const exp = experienceEntries[index];
      if (index > 0) y += 8;

      needSpace(52);
      writeWrapped(
        exp.company ?? '',
        RESUME_PDF_SIZES.experienceHeading,
        true,
        margin,
        maxW,
        primary,
        fontBody
      );

      const dateRange = formatDateRange(exp.start_date ?? '', exp.end_date ?? '');
      const metaStartY = y;
      let leftY = metaStartY;
      let rightY = metaStartY;
      const metaLh = lineHeight(RESUME_PDF_SIZES.experienceMeta);
      const headingLh = lineHeight(RESUME_PDF_SIZES.experienceHeading);

      if (dateRange) {
        setFont(fontBody, true);
        doc.setFontSize(RESUME_PDF_SIZES.experienceMeta);
        setColor(primary);
        for (const line of doc.splitTextToSize(dateRange, leftColW) as string[]) {
          doc.text(line, margin, leftY, { charSpace });
          leftY += metaLh;
        }
      }
      if (exp.address) {
        setFont(fontBody, false);
        doc.setFontSize(bodySize);
        setColor(muted);
        for (const line of doc.splitTextToSize(exp.address, leftColW) as string[]) {
          doc.text(line, margin, leftY, { charSpace });
          leftY += bodyLh;
        }
      }

      if (exp.position) {
        setFont(fontBody, true);
        doc.setFontSize(RESUME_PDF_SIZES.experienceHeading);
        setColor(body);
        for (const line of doc.splitTextToSize(exp.position, rightColW) as string[]) {
          doc.text(line, rightColX, rightY, { charSpace });
          rightY += headingLh;
        }
      }

      y = rightY;

      for (const desc of exp.descriptions ?? []) {
        const text = ensureTrailingPeriod(desc);
        writeMixedWrapped(parseBoldMarkup(`• ${text}`), bodySize, rightColX, rightColW, body, fontBody);
      }

      if (y >= metaStartY) {
        y = Math.max(y, leftY);
      }
    }
  }

  const blob = doc.output('blob');
  saveAs(blob, fileName);
}
