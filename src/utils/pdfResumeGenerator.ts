import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { getUseAiEnhancedJobTitleForProfile } from './profileMetadata';
import type { GenerateDocxOptions } from './docxGenerator';
import { formatDateRange, resolveResumeExperience } from './docxGenerator';
import {
  RESUME_COLORS,
  RESUME_PDF_SIZES,
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
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
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

  const measureText = (text: string, fontSize: number, bold: boolean) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(fontSize);
    const base = doc.getTextWidth(text);
    // Approximate extra width from character spacing
    const extras = Math.max(0, text.length - 1) * charSpace;
    return base + extras;
  };

  const writeWrapped = (
    text: string,
    fontSize: number,
    style: 'normal' | 'bold' | 'italic' | 'bolditalic',
    x: number,
    maxWidth: number,
    color: [number, number, number] = body
  ) => {
    // Account for letter-spacing so wrap width stays accurate
    const effectiveMax = Math.max(40, maxWidth - charSpace * 8);
    doc.setFont('helvetica', style);
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
    color: [number, number, number] = body
  ) => {
    const lh = lineHeight(fontSize);
    const tokens: { text: string; bold: boolean }[] = [];

    for (const seg of segments) {
      const parts = seg.text.split(/(\s+)/);
      for (const part of parts) {
        if (!part) continue;
        tokens.push({ text: part, bold: seg.bold });
      }
    }

    let xCursor = x;
    needSpace(lh);
    setColor(color);

    for (const token of tokens) {
      const isSpace = /^\s+$/.test(token.text);
      const width = measureText(token.text, fontSize, token.bold);

      if (!isSpace && xCursor > x && xCursor + width > x + maxWidth) {
        y += lh;
        needSpace(lh);
        xCursor = x;
      }

      doc.setFont('helvetica', token.bold ? 'bold' : 'normal');
      doc.setFontSize(fontSize);
      setColor(color);
      doc.text(token.text, xCursor, y, { charSpace });
      xCursor += width;
    }

    y += lh;
  };

  const sectionHeader = (title: string) => {
    y += 10;
    needSpace(lineHeight(RESUME_PDF_SIZES.section) + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(RESUME_PDF_SIZES.section);
    setColor(primary);
    doc.text(title.toUpperCase(), margin, y);
    y += 4;
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;
  };

  const bodySize = RESUME_PDF_SIZES.body;
  const bodyLh = lineHeight(bodySize);

  const skillSections = buildResumeSkillSections(generatedResume.skills ?? []);

  // —— Header ——
  const name = profile
    ? `${profile.first_name} ${profile.last_name}`.toUpperCase()
    : 'PROFESSIONAL RESUME';
  needSpace(28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(RESUME_PDF_SIZES.name);
  setColor(primary);
  doc.text(name, margin, y);
  y += 20;

  if (profile?.title) {
    needSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(RESUME_PDF_SIZES.title);
    setColor(accent);
    doc.text(profile.title, margin, y);
    // Space between role and contact details
    y += 28;
  }

  if (profile) {
    const contactParts: { label: string; value: string }[] = [];
    if (profile.phone) contactParts.push({ label: 'Phone', value: profile.phone });
    if (profile.email) contactParts.push({ label: 'Email', value: profile.email });
    if (profile.location) contactParts.push({ label: 'Location', value: profile.location });
    if (includeLinkedIn && profile.linkedin) contactParts.push({ label: 'LinkedIn', value: profile.linkedin });
    if (profile.portfolio) contactParts.push({ label: 'Portfolio', value: profile.portfolio });

    if (contactParts.length) {
      needSpace(14);
      doc.setFontSize(bodySize);
      let x = margin;
      for (let i = 0; i < contactParts.length; i++) {
        const part = contactParts[i];
        if (i > 0) {
          const gap = '   ';
          doc.setFont('helvetica', 'normal');
          setColor(body);
          doc.text(gap, x, y, { charSpace });
          x += measureText(gap, bodySize, false);
        }
        doc.setFont('helvetica', 'bold');
        setColor(accent);
        const label = `${part.label}: `;
        doc.text(label, x, y, { charSpace });
        x += measureText(label, bodySize, true);
        doc.setFont('helvetica', 'normal');
        setColor(body);
        doc.text(part.value, x, y, { charSpace });
        x += measureText(part.value, bodySize, false);
      }
      y += 10;
      doc.setDrawColor(primary[0], primary[1], primary[2]);
      doc.setLineWidth(1.2);
      doc.line(margin, y, pageWidth - margin, y);
      // Large gap before Summary / first content section
      y += 36;
    }
  }

  // —— Summary ——
  if (generatedResume.summary) {
    sectionHeader('Summary');
    writeMixedWrapped(parseBoldMarkup(generatedResume.summary), bodySize, margin, maxW, body);
  }

  // —— Skills (static baseline + job-requirement extras) ——
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
      body
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
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(bodySize);
        setColor(primary);
        const dateLines = doc.splitTextToSize(edr, leftColW) as string[];
        for (const line of dateLines) {
          doc.text(line, margin, leftY, { charSpace });
          leftY += bodyLh;
        }
      }

      if (degreeText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(bodySize);
        setColor(primary);
        const lines = doc.splitTextToSize(degreeText, rightColW) as string[];
        for (const line of lines) {
          doc.text(line, rightColX, rightY, { charSpace });
          rightY += bodyLh;
        }
      }
      if (edu.school) {
        doc.setFont('helvetica', 'normal');
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

      // Keep company + title + first bullet together when possible
      needSpace(52);

      writeWrapped(exp.company ?? '', RESUME_PDF_SIZES.experienceHeading, 'bold', margin, maxW, primary);

      const dateRange = formatDateRange(exp.start_date ?? '', exp.end_date ?? '');
      const metaStartY = y;
      let leftY = metaStartY;
      let rightY = metaStartY;
      const metaLh = lineHeight(RESUME_PDF_SIZES.experienceMeta);
      const headingLh = lineHeight(RESUME_PDF_SIZES.experienceHeading);

      // Left: dates + location (independent column — must not push bullets down)
      if (dateRange) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(RESUME_PDF_SIZES.experienceMeta);
        setColor(primary);
        const dateLines = doc.splitTextToSize(dateRange, leftColW) as string[];
        for (const line of dateLines) {
          doc.text(line, margin, leftY, { charSpace });
          leftY += metaLh;
        }
      }
      if (exp.address) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(bodySize);
        setColor(muted);
        const addrLines = doc.splitTextToSize(exp.address, leftColW) as string[];
        for (const line of addrLines) {
          doc.text(line, margin, leftY, { charSpace });
          leftY += bodyLh;
        }
      }

      // Right: title, then bullets immediately below
      if (exp.position) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(RESUME_PDF_SIZES.experienceHeading);
        setColor(body);
        const titleLines = doc.splitTextToSize(exp.position, rightColW) as string[];
        for (const line of titleLines) {
          doc.text(line, rightColX, rightY, { charSpace });
          rightY += headingLh;
        }
      }

      // Bullets follow the title — never wait for the left column height
      y = rightY;

      for (const desc of exp.descriptions ?? []) {
        const text = ensureTrailingPeriod(desc);
        const segments = parseBoldMarkup(`• ${text}`);
        writeMixedWrapped(segments, bodySize, rightColX, rightColW, body);
      }

      // Advance past left column only when still on the same page as this job started
      if (y >= metaStartY) {
        y = Math.max(y, leftY);
      }
    }
  }

  const blob = doc.output('blob');
  saveAs(blob, fileName);
}
