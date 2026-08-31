import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { parseBoldMarkup, stripBoldMarkup } from './boldText';
import type { GeneratedResume } from './api';
import type { Profile } from './supabase';
import {
  buildResumeFileName,
  getExtTemplate,
  listExtTemplates,
} from './downloadDocx';

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export async function downloadResumePdf(
  profile: Profile,
  resume: GeneratedResume,
  templateId?: string,
  includeLinkedIn = true
): Promise<string> {
  const template =
    (templateId && getExtTemplate(templateId)) || listExtTemplates()[0];
  const fileName = buildResumeFileName(profile, resume, 'pdf');
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 36;
  const maxW = pageWidth - 2 * margin;
  let y = margin;

  const primary = hexToRgb(template.colors.primary);
  const bodyRgb = hexToRgb(template.colors.body);
  const muted = hexToRgb(template.colors.muted);

  const needSpace = (h: number) => {
    if (y + h > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeLine = (
    text: string,
    size: number,
    rgb: [number, number, number],
    bold = false
  ) => {
    needSpace(size * 1.4);
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(size);
    doc.setTextColor(rgb[0], rgb[1], rgb[2]);
    const lines = doc.splitTextToSize(text, maxW) as string[];
    for (const line of lines) {
      needSpace(size * 1.35);
      doc.text(line, margin, y);
      y += size * 1.35;
    }
  };

  const writeMarkup = (text: string, size: number, rgb: [number, number, number]) => {
    const segments = parseBoldMarkup(text);
    if (!segments.length) return;

    // Simple approach: wrap as one flow with approximate bold via separate lines if needed.
    // Prefer inline: build lines manually.
    doc.setFontSize(size);
    let x = margin;
    const lineH = size * 1.35;
    needSpace(lineH);

    const advance = (chunk: string, bold: boolean) => {
      doc.setFont('helvetica', bold ? 'bold' : 'normal');
      doc.setTextColor(rgb[0], rgb[1], rgb[2]);
      const words = chunk.split(/(\s+)/);
      for (const word of words) {
        if (!word) continue;
        const w = doc.getTextWidth(word);
        if (x + w > margin + maxW && word.trim()) {
          y += lineH;
          needSpace(lineH);
          x = margin;
        }
        doc.text(word, x, y);
        x += w;
      }
    };

    for (const seg of segments) {
      advance(seg.text, seg.bold);
    }
    y += lineH;
  };

  writeLine(
    `${profile.first_name} ${profile.last_name}`.toUpperCase(),
    template.sizes.name,
    primary,
    true
  );

  const role = resume.jobTitle || profile.title || '';
  if (role) writeLine(role, template.sizes.title, bodyRgb);

  const contactBits = [
    profile.email,
    profile.phone,
    profile.location,
    includeLinkedIn ? profile.linkedin : '',
  ].filter(Boolean);
  if (contactBits.length) {
    writeLine(contactBits.join('  |  '), template.sizes.contact, muted);
    doc.setDrawColor(primary[0], primary[1], primary[2]);
    doc.setLineWidth(0.8);
    doc.line(margin, y, margin + maxW, y);
    y += 12;
  }

  const sectionTitle = (title: string) => {
    y += 8;
    writeLine(title.toUpperCase(), template.sizes.section, primary, true);
    doc.setDrawColor(primary[0], primary[1], primary[2]);
    doc.setLineWidth(1);
    doc.line(margin, y - 2, margin + maxW, y - 2);
    y += 6;
  };

  if (resume.summary?.trim()) {
    sectionTitle('Summary');
    writeMarkup(resume.summary, template.sizes.body, bodyRgb);
  }

  if (resume.skills?.length) {
    sectionTitle('Skills');
    writeMarkup(resume.skills.join(', '), template.sizes.body, bodyRgb);
  }

  if (resume.experience?.length) {
    sectionTitle('Experience');
    for (const exp of resume.experience) {
      writeLine(
        `${exp.position || ''}${exp.company ? `  |  ${exp.company}` : ''}`,
        template.sizes.experienceHeading,
        bodyRgb,
        true
      );
      writeLine(
        `${exp.start_date || ''} – ${exp.end_date || ''}`,
        template.sizes.experienceMeta,
        muted
      );
      for (const bullet of exp.descriptions || []) {
        if (!stripBoldMarkup(bullet).trim()) continue;
        writeMarkup(`• ${bullet}`, template.sizes.body, bodyRgb);
      }
    }
  }

  if (profile.education?.length) {
    sectionTitle('Education');
    for (const edu of profile.education) {
      writeLine(
        `${edu.degree || ''} in ${edu.field || ''} — ${edu.school || ''}`,
        template.sizes.body,
        bodyRgb
      );
    }
  }

  const blob = doc.output('blob');
  saveAs(blob, fileName);
  return fileName;
}
