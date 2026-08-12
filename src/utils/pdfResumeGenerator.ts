import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { getUseAiEnhancedJobTitleForProfile } from './profileMetadata';
import type { GenerateDocxOptions } from './docxGenerator';
import { formatDateRange, resolveResumeExperience } from './docxGenerator';
import { registerResumePdfFonts } from './pdfFonts';
import {
  buildResumeSkillSections,
  ensureTrailingPeriod,
  parseBoldMarkup,
  type BoldTextSegment,
} from './resumeLayout';
import { resolveResumeTheme } from '../resumeTemplates';

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
  const theme = resolveResumeTheme(options?.templateId);
  const t = theme.template;
  const useAiEnhancedJobTitle = resolveUseAiEnhancedJobTitle(options, profile);
  const includeLinkedIn = options?.includeLinkedIn !== false;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const { heading: fontHeading, body: fontBody } = await registerResumePdfFonts(doc);

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = theme.spacing.marginPt;
  const maxW = pageWidth - 2 * margin;
  const leftColW = 110;
  const rightColX = margin + leftColW + 12;
  const rightColW = maxW - leftColW - 12;
  let y = margin;

  const primary = hexToRgb(theme.colors.primary);
  const accent = hexToRgb(theme.colors.accent);
  const body = hexToRgb(theme.colors.body);
  const muted = hexToRgb(theme.colors.muted);
  const sizes = theme.pdfSizes;

  const lineHeight = (pt: number) => pt * theme.spacing.pdfLineHeight;
  const charSpace = theme.spacing.pdfCharSpace;

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

  const writeStyledFlow = (
    tokens: StyledToken[],
    fontSize: number,
    x: number,
    maxWidth: number,
    family: string = fontBody,
    align: 'left' | 'center' = 'left'
  ) => {
    const lh = lineHeight(fontSize);
    // For center align, measure full line groups simply by left-flow then re-draw — keep left for body.
    let xCursor = align === 'center' ? x : x;
    const startX = x;
    needSpace(lh);

    // Center: build lines then draw centered
    if (align === 'center') {
      type Line = StyledToken[];
      const lines: Line[] = [[]];
      let lineWidth = 0;
      for (const token of tokens) {
        const isSpace = /^\s+$/.test(token.text);
        const width = measureText(token.text, fontSize, family, token.bold);
        if (!isSpace && lineWidth > 0 && lineWidth + width > maxWidth) {
          lines.push([]);
          lineWidth = 0;
        }
        lines[lines.length - 1].push(token);
        if (!(isSpace && lineWidth === 0)) lineWidth += width;
      }
      for (const lineTokens of lines) {
        let w = 0;
        for (const tok of lineTokens) w += measureText(tok.text, fontSize, family, tok.bold);
        let cx = startX + Math.max(0, (maxWidth - w) / 2);
        needSpace(lh);
        for (const tok of lineTokens) {
          setFont(family, tok.bold);
          doc.setFontSize(fontSize);
          setColor(tok.color);
          doc.text(tok.text, cx, y, { charSpace });
          cx += measureText(tok.text, fontSize, family, tok.bold);
        }
        y += lh;
      }
      return;
    }

    for (const token of tokens) {
      const isSpace = /^\s+$/.test(token.text);
      const width = measureText(token.text, fontSize, family, token.bold);

      if (!isSpace && xCursor > startX && xCursor + width > startX + maxWidth) {
        y += lh;
        needSpace(lh);
        xCursor = startX;
      }

      if (!isSpace && width > maxWidth) {
        let chunk = '';
        for (const ch of token.text) {
          const next = chunk + ch;
          const avail = maxWidth - (xCursor - startX);
          if (chunk && measureText(next, fontSize, family, token.bold) > avail) {
            setFont(family, token.bold);
            doc.setFontSize(fontSize);
            setColor(token.color);
            doc.text(chunk, xCursor, y, { charSpace });
            y += lh;
            needSpace(lh);
            xCursor = startX;
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
    family: string = fontBody,
    align: 'left' | 'center' = 'left'
  ) => {
    writeStyledFlow([{ text, bold, color }], fontSize, x, maxWidth, family, align);
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
    const label = t.sectionStyle.allCaps ? title.toUpperCase() : title;
    y += 8;
    needSpace(lineHeight(sizes.section) + 8);
    setFont(fontHeading, true);
    doc.setFontSize(sizes.section);
    setColor(primary);
    doc.text(label, margin, y);
    y += 3;
    if (t.sectionStyle.underline) {
      doc.setDrawColor(accent[0], accent[1], accent[2]);
      doc.setLineWidth(1);
      doc.line(margin, y, pageWidth - margin, y);
    }
    y += 8;
  };

  const bodySize = sizes.body;
  const bodyLh = lineHeight(bodySize);
  const skillSections = buildResumeSkillSections(generatedResume.skills ?? []);
  const headerAlign = t.header.nameAlign;

  // —— Header ——
  const rawName = profile ? `${profile.first_name} ${profile.last_name}` : 'Professional Resume';
  const name = t.header.nameTransform === 'uppercase' ? rawName.toUpperCase() : rawName;
  needSpace(28);
  writeWrapped(name, sizes.name, true, margin, maxW, primary, fontHeading, headerAlign);

  if (t.header.showRole && profile?.title) {
    writeWrapped(profile.title, sizes.title, true, margin, maxW, accent, fontBody, headerAlign);
    y += 4;
  }

  if (profile) {
    const contactParts: { label: string; value: string }[] = [];
    if (profile.phone) contactParts.push({ label: 'Phone', value: profile.phone });
    if (profile.email) contactParts.push({ label: 'Email', value: profile.email });
    if (profile.location) contactParts.push({ label: 'Location', value: profile.location });
    if (includeLinkedIn && profile.linkedin) contactParts.push({ label: 'LinkedIn', value: profile.linkedin });
    if (profile.portfolio) contactParts.push({ label: 'Portfolio', value: profile.portfolio });

    if (contactParts.length) {
      if (t.contact.layout === 'inline') {
        const tokens: StyledToken[] = [];
        contactParts.forEach((part, i) => {
          if (i > 0) tokens.push({ text: '  |  ', bold: false, color: body });
          tokens.push({ text: `${part.label}: `, bold: true, color: accent });
          tokens.push({ text: part.value, bold: false, color: body });
        });
        writeStyledFlow(tokens, sizes.contact, margin, maxW, fontBody, headerAlign);
      } else {
        for (const part of contactParts) {
          writeStyledFlow(
            [
              { text: `${part.label}: `, bold: true, color: accent },
              { text: part.value, bold: false, color: body },
            ],
            sizes.contact,
            margin,
            maxW,
            fontBody,
            headerAlign
          );
        }
      }

      if (t.header.underlineAfterContact) {
        y += 2;
        doc.setDrawColor(primary[0], primary[1], primary[2]);
        doc.setLineWidth(1.2);
        doc.line(margin, y, pageWidth - margin, y);
        y += 14;
      } else {
        y += 10;
      }
    }
  }

  const renderSummary = () => {
    if (!generatedResume.summary) return;
    sectionHeader('Summary');
    writeMixedWrapped(parseBoldMarkup(generatedResume.summary), bodySize, margin, maxW, body, fontBody);
  };

  const renderSkills = () => {
    sectionHeader('Skills');
    if (!t.skills.categorized) {
      const flat = Array.from(
        new Set([...(generatedResume.skills ?? []), ...skillSections.flatMap((s) => s.skills)])
      );
      if (flat.length) {
        writeMixedWrapped([{ text: flat.join(', '), bold: false }], bodySize, margin, maxW, body, fontBody);
      }
      return;
    }
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
  };

  const renderEducation = () => {
    if (!profile?.education?.length) return;
    sectionHeader('Education');
    const twoColumn = t.experience.layout === 'twoColumn';

    for (let index = 0; index < profile.education.length; index++) {
      const edu = profile.education[index];
      if (index > 0) y += 6;
      const degreeText = [edu.degree, edu.field].filter(Boolean).join(' in ');
      const edr = formatDateRange(edu.start_date, edu.end_date);

      if (twoColumn) {
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
      } else {
        if (degreeText) writeWrapped(degreeText, bodySize, true, margin, maxW, primary, fontBody);
        const schoolLine = [edu.school, edr].filter(Boolean).join('  ·  ');
        if (schoolLine) writeWrapped(schoolLine, bodySize, false, margin, maxW, muted, fontBody);
      }
    }
  };

  const renderExperience = () => {
    const experienceEntries = resolveResumeExperience(
      profile?.experience ?? [],
      generatedResume.experience ?? [],
      useAiEnhancedJobTitle
    );
    if (!experienceEntries.length) return;

    sectionHeader('Experience');
    const twoColumn = t.experience.layout === 'twoColumn';
    const showAddress = t.experience.showAddress;

    for (let index = 0; index < experienceEntries.length; index++) {
      const exp = experienceEntries[index];
      if (index > 0) y += 8;

      needSpace(52);
      writeWrapped(exp.company ?? '', sizes.experienceHeading, true, margin, maxW, primary, fontBody);

      const dateRange = formatDateRange(exp.start_date ?? '', exp.end_date ?? '');

      if (twoColumn) {
        const metaStartY = y;
        let leftY = metaStartY;
        let rightY = metaStartY;
        const metaLh = lineHeight(sizes.experienceMeta);
        const headingLh = lineHeight(sizes.experienceHeading);

        if (dateRange) {
          setFont(fontBody, true);
          doc.setFontSize(sizes.experienceMeta);
          setColor(primary);
          for (const line of doc.splitTextToSize(dateRange, leftColW) as string[]) {
            doc.text(line, margin, leftY, { charSpace });
            leftY += metaLh;
          }
        }
        if (showAddress && exp.address) {
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
          doc.setFontSize(sizes.experienceHeading);
          setColor(body);
          for (const line of doc.splitTextToSize(exp.position, rightColW) as string[]) {
            doc.text(line, rightColX, rightY, { charSpace });
            rightY += headingLh;
          }
        }

        y = rightY;
        for (const desc of exp.descriptions ?? []) {
          writeMixedWrapped(
            parseBoldMarkup(`• ${ensureTrailingPeriod(desc)}`),
            bodySize,
            rightColX,
            rightColW,
            body,
            fontBody
          );
        }
        if (y >= metaStartY) y = Math.max(y, leftY);
      } else {
        if (exp.position) {
          writeWrapped(exp.position, sizes.experienceHeading, true, margin, maxW, body, fontBody);
        }
        const metaBits = [dateRange, showAddress ? exp.address : ''].filter(Boolean);
        if (metaBits.length) {
          writeWrapped(metaBits.join('  ·  '), sizes.experienceMeta, false, margin, maxW, muted, fontBody);
        }
        for (const desc of exp.descriptions ?? []) {
          writeMixedWrapped(
            parseBoldMarkup(`• ${ensureTrailingPeriod(desc)}`),
            bodySize,
            margin,
            maxW,
            body,
            fontBody
          );
        }
      }
    }
  };

  const sectionRenderers: Record<string, () => void> = {
    summary: renderSummary,
    skills: renderSkills,
    education: renderEducation,
    experience: renderExperience,
  };

  for (const sectionId of t.sectionOrder) {
    sectionRenderers[sectionId]?.();
  }

  const blob = doc.output('blob');
  saveAs(blob, fileName);
}
