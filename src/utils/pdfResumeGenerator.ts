import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { getUseAiEnhancedJobTitleForProfile } from './profileMetadata';
import type { GenerateDocxOptions } from './docxGenerator';
import { formatDateRange, resolveResumeExperience } from './docxGenerator';
import {
  RESUME_COLORS,
  buildResumeSkillSections,
  flattenSkillSections,
  extractRoleTechStack,
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

  const lineHeight = (pt: number) => pt * 1.3;

  const needSpace = (h: number) => {
    if (y + h > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const setColor = (rgb: [number, number, number]) => {
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
  };

  const writeWrapped = (
    text: string,
    fontSize: number,
    style: 'normal' | 'bold' | 'italic' | 'bolditalic',
    x: number,
    maxWidth: number,
    color: [number, number, number] = body
  ) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    setColor(color);
    const lines = doc.splitTextToSize(text, maxWidth) as string[];
    const lh = lineHeight(fontSize);
    for (const line of lines) {
      needSpace(lh);
      doc.text(line, x, y);
      y += lh;
    }
  };

  const sectionHeader = (title: string) => {
    y += 10;
    needSpace(lineHeight(12) + 10);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    setColor(primary);
    doc.text(title.toUpperCase(), margin, y);
    y += 4;
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(1);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;
  };

  const skillSections = buildResumeSkillSections(generatedResume.skills ?? []);
  const skills = flattenSkillSections(skillSections);

  // —— Header ——
  const name = profile
    ? `${profile.first_name} ${profile.last_name}`.toUpperCase()
    : 'PROFESSIONAL RESUME';
  needSpace(28);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  setColor(primary);
  doc.text(name, margin, y);
  y += 20;

  if (profile?.title) {
    needSpace(16);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
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
      doc.setFontSize(9);
      let x = margin;
      for (let i = 0; i < contactParts.length; i++) {
        const part = contactParts[i];
        if (i > 0) {
          doc.setFont('helvetica', 'normal');
          setColor(body);
          doc.text('   ', x, y);
          x += doc.getTextWidth('   ');
        }
        doc.setFont('helvetica', 'bold');
        setColor(accent);
        const label = `${part.label}: `;
        doc.text(label, x, y);
        x += doc.getTextWidth(label);
        doc.setFont('helvetica', 'normal');
        setColor(body);
        doc.text(part.value, x, y);
        x += doc.getTextWidth(part.value);
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
    writeWrapped(generatedResume.summary, 10, 'normal', margin, maxW, body);
  }

  // —— Skills (static baseline + job-requirement extras) ——
  sectionHeader('Skills');
  for (const cat of skillSections) {
    needSpace(lineHeight(10));
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    setColor(body);
    const label = `${cat.label}: `;
    doc.text(label, margin, y);
    const labelW = doc.getTextWidth(label);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(cat.skills.join(', '), maxW - labelW) as string[];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (i > 0) {
        y += lineHeight(10);
        needSpace(lineHeight(10));
        doc.text(line, margin, y);
      } else {
        doc.text(line, margin + labelW, y);
      }
    }
    y += lineHeight(10);
  }

  // —— Education ——
  if (profile?.education?.length) {
    sectionHeader('Education');
    for (let index = 0; index < profile.education.length; index++) {
      const edu = profile.education[index];
      if (index > 0) y += 6;

      const degreeText = [edu.degree, edu.field].filter(Boolean).join(' in ');
      const edr = formatDateRange(edu.start_date, edu.end_date);

      needSpace(lineHeight(10) * 2);
      const startY = y;
      let leftY = startY;
      let rightY = startY;

      if (edr) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(primary);
        const dateLines = doc.splitTextToSize(edr, leftColW) as string[];
        for (const line of dateLines) {
          doc.text(line, margin, leftY);
          leftY += lineHeight(9);
        }
      }

      if (degreeText) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setColor(primary);
        const lines = doc.splitTextToSize(degreeText, rightColW) as string[];
        for (const line of lines) {
          doc.text(line, rightColX, rightY);
          rightY += lineHeight(10);
        }
      }
      if (edu.school) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        setColor(accent);
        doc.text(edu.school, rightColX, rightY);
        rightY += lineHeight(9);
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

      writeWrapped(exp.company ?? '', 11, 'bold', margin, maxW, primary);

      const dateRange = formatDateRange(exp.start_date ?? '', exp.end_date ?? '');
      const techStack = extractRoleTechStack(exp.descriptions ?? [], skills);
      const metaStartY = y;
      let leftY = metaStartY;
      let rightY = metaStartY;

      // Left: dates + location (independent column — must not push bullets down)
      if (dateRange) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        setColor(primary);
        const dateLines = doc.splitTextToSize(dateRange, leftColW) as string[];
        for (const line of dateLines) {
          doc.text(line, margin, leftY);
          leftY += lineHeight(9);
        }
      }
      if (exp.address) {
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
        setColor(muted);
        const addrLines = doc.splitTextToSize(exp.address, leftColW) as string[];
        for (const line of addrLines) {
          doc.text(line, margin, leftY);
          leftY += lineHeight(8);
        }
      }

      // Right: title + tech stack, then bullets immediately below
      if (exp.position) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        setColor(body);
        const titleLines = doc.splitTextToSize(exp.position, rightColW) as string[];
        for (const line of titleLines) {
          doc.text(line, rightColX, rightY);
          rightY += lineHeight(10);
        }
      }
      if (techStack.length) {
        doc.setFont('helvetica', 'italic');
        doc.setFontSize(8);
        setColor(accent);
        const techLines = doc.splitTextToSize(techStack.join(', '), rightColW) as string[];
        for (const line of techLines) {
          doc.text(line, rightColX, rightY);
          rightY += lineHeight(8);
        }
      }

      // Bullets follow the title/tech — never wait for the left column height
      y = rightY;

      for (const desc of exp.descriptions ?? []) {
        const bullet = desc.endsWith('.') ? desc : `${desc}.`;
        const full = `• ${bullet}`;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        setColor(body);
        const lines = doc.splitTextToSize(full, rightColW) as string[];
        const lh = lineHeight(10);
        for (const line of lines) {
          needSpace(lh);
          doc.text(line, rightColX, y);
          y += lh;
        }
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
