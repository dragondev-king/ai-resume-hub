import { jsPDF } from 'jspdf';
import { saveAs } from 'file-saver';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { getUseAiEnhancedJobTitleForProfile } from './profileMetadata';
import type { GenerateDocxOptions } from './docxGenerator';
import { companiesMatch, formatDateRange, normalizeDateForMatch } from './docxGenerator';

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

export async function generateResumePdf(
  generatedResume: GeneratedResume,
  fileName: string,
  profile?: Profile,
  options?: GenerateDocxOptions
): Promise<void> {
  const useAiEnhancedJobTitle = resolveUseAiEnhancedJobTitle(options, profile);
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 72;
  const maxW = pageWidth - 2 * margin;
  let y = margin;

  const lineHeight = (pt: number) => pt * 1.25;

  const needSpace = (h: number) => {
    if (y + h > pageHeight - margin) {
      doc.addPage();
      y = margin;
    }
  };

  const writeWrapped = (text: string, fontSize: number, style: 'normal' | 'bold' | 'italic' | 'bolditalic', x: number, maxWidth: number) => {
    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxWidth);
    const lh = lineHeight(fontSize);
    for (const line of lines) {
      needSpace(lh);
      doc.text(line, x, y);
      y += lh;
    }
  };

  const writeCentered = (text: string, fontSize: number, style: 'normal' | 'bold') => {
    doc.setFont('helvetica', style);
    doc.setFontSize(fontSize);
    const lines = doc.splitTextToSize(text, maxW);
    const lh = lineHeight(fontSize);
    for (const line of lines) {
      needSpace(lh);
      doc.text(line, pageWidth / 2, y, { align: 'center' });
      y += lh;
    }
  };

  const sectionHeader = (title: string) => {
    y += 6;
    needSpace(lineHeight(12) + 8);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(title.toUpperCase(), margin, y);
    y += lineHeight(12) * 0.6;
    doc.setLineWidth(0.5);
    doc.line(margin, y, pageWidth - margin, y);
    y += 12;
  };

  const name = profile ? `${profile.first_name} ${profile.last_name}` : 'Professional Resume';
  writeCentered(name, 20, 'bold');
  y += 4;

  if (profile) {
    sectionHeader('Contact');
    const items: { label: string; value: string }[] = [];
    if (profile.email) items.push({ label: 'Email', value: profile.email });
    if (profile.phone) items.push({ label: 'Phone', value: profile.phone });
    if (profile.location) items.push({ label: 'Location', value: profile.location });
    if (profile.linkedin) items.push({ label: 'LinkedIn', value: profile.linkedin });
    if (profile.portfolio) items.push({ label: 'Portfolio', value: profile.portfolio });
    for (const { label, value } of items) {
      writeWrapped(`${label}: ${value}`, 11, 'normal', margin, maxW);
    }
  }

  if (generatedResume.summary) {
    sectionHeader('Summary');
    writeWrapped(generatedResume.summary, 11, 'normal', margin, maxW);
  }

  if (profile?.experience?.length) {
    sectionHeader('Professional Experience');
    profile.experience.forEach((exp, index) => {
      const expStart = normalizeDateForMatch(exp.start_date);
      const companyMatchFn = (ai: any) => companiesMatch(ai.company, exp.company);
      const aiEnhanced =
        generatedResume.experience.find(
          (ai) => companyMatchFn(ai) && (!expStart || normalizeDateForMatch(ai.start_date) === expStart)
        ) ?? generatedResume.experience.find((ai) => companyMatchFn(ai));

      const descriptions = aiEnhanced?.descriptions || (exp.description ? [exp.description] : []);

      if (index > 0) {
        y += 10;
      }

      writeWrapped(exp.company, 12, 'bold', margin, maxW);
      const jobTitle = useAiEnhancedJobTitle && aiEnhanced?.position ? aiEnhanced.position : exp.position;
      writeWrapped(jobTitle, 11, 'bold', margin, maxW);

      const dateAddress: string[] = [];
      const dr = formatDateRange(exp.start_date, exp.end_date);
      if (dr) dateAddress.push(dr);
      if (exp.address) dateAddress.push(exp.address);
      if (dateAddress.length) {
        writeWrapped(dateAddress.join(' | '), 10, 'italic', margin, maxW);
      }

      for (const desc of descriptions) {
        const bullet = desc.endsWith('.') ? desc : `${desc}.`;
        writeWrapped(`• ${bullet}`, 11, 'normal', margin + 18, maxW - 18);
      }
      y += 6;
    });
  }

  if (profile?.education?.length) {
    sectionHeader('Education');
    profile.education.forEach((edu, index) => {
      if (index > 0) y += 8;
      const degreeText = [edu.degree, edu.field].filter(Boolean).join(' in ');
      writeWrapped(degreeText, 11, 'bold', margin, maxW);
      const schoolInfo: string[] = [];
      if (edu.school) schoolInfo.push(edu.school);
      const edr = formatDateRange(edu.start_date, edu.end_date);
      if (edr) schoolInfo.push(`(${edr})`);
      if (schoolInfo.length) {
        writeWrapped(schoolInfo.join(' '), 10, 'normal', margin, maxW);
      }
    });
  }

  if (generatedResume.skills?.length) {
    sectionHeader('Skills');
    const skills = Array.from(new Set([...generatedResume.skills]));
    const technicalSkills = skills.filter((skill) =>
      /(javascript|python|java|c\+\+|react|angular|vue|node|sql|aws|docker|kubernetes|git|agile|scrum|api|html|css|typescript|php|ruby|go|rust|swift|kotlin|flutter|react native|machine learning|ai|data|analytics|cloud|devops|testing|ci\/cd)/i.test(
        skill
      )
    );
    const softSkills = skills.filter((skill) =>
      /(leadership|communication|teamwork|problem solving|project management|collaboration|mentoring|presentation|negotiation|customer service|time management|organization|creativity|adaptability|critical thinking|decision making)/i.test(
        skill
      )
    );
    const otherSkills = skills.filter((s) => !technicalSkills.includes(s) && !softSkills.includes(s));

    if (technicalSkills.length) {
      writeWrapped(`Technical: ${technicalSkills.join(', ')}`, 11, 'normal', margin, maxW);
    }
    if (softSkills.length) {
      writeWrapped(`Soft Skills: ${softSkills.join(', ')}`, 11, 'normal', margin, maxW);
    }
    if (otherSkills.length) {
      writeWrapped(`Other: ${otherSkills.join(', ')}`, 11, 'normal', margin, maxW);
    }
  }

  const blob = doc.output('blob');
  saveAs(blob, fileName);
}
