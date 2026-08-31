import {
  AlignmentType,
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
} from 'docx';
import { saveAs } from 'file-saver';
import classicTeal from '../../../../src/resumeTemplates/classic-teal.json';
import modernNavy from '../../../../src/resumeTemplates/modern-navy.json';
import slateCoral from '../../../../src/resumeTemplates/slate-coral.json';
import emeraldSerif from '../../../../src/resumeTemplates/emerald-serif.json';
import { parseBoldMarkup } from './boldText';
import type { GeneratedResume } from './api';
import type { Profile } from './supabase';

export type ExtResumeTemplate = {
  id: string;
  name: string;
  colors: { primary: string; accent: string; body: string; muted: string };
  fonts: { heading: string; body: string };
  sizes: {
    name: number;
    title: number;
    section: number;
    experienceHeading: number;
    experienceMeta: number;
    body: number;
    contact: number;
  };
};

const TEMPLATES = [
  classicTeal,
  modernNavy,
  slateCoral,
  emeraldSerif,
] as ExtResumeTemplate[];

export function listExtTemplates(): ExtResumeTemplate[] {
  return [...TEMPLATES];
}

export function getExtTemplate(id: string): ExtResumeTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

export function buildResumeFileName(
  profile: Profile,
  resume: GeneratedResume,
  extension: 'docx' | 'pdf'
): string {
  const format = profile.resume_filename_format || 'first_last';
  const base =
    format === 'first_last_job_company' && resume.jobTitle && resume.companyName
      ? `${profile.first_name}_${profile.last_name}_${resume.jobTitle}-${resume.companyName}`
      : `${profile.first_name}_${profile.last_name}`;
  return `${base}.${extension}`;
}

function runsFromMarkup(
  text: string,
  opts: { size: number; font: string; color: string; bold?: boolean }
): TextRun[] {
  const segments = parseBoldMarkup(text);
  if (!segments.length) {
    return [
      new TextRun({
        text: '',
        size: opts.size,
        font: opts.font,
        color: opts.color,
        bold: opts.bold,
      }),
    ];
  }
  return segments.map(
    (seg) =>
      new TextRun({
        text: seg.text,
        size: opts.size,
        font: opts.font,
        color: opts.color,
        bold: opts.bold || seg.bold,
      })
  );
}

export async function downloadResumeDocx(
  profile: Profile,
  resume: GeneratedResume,
  templateId?: string,
  includeLinkedIn = true
): Promise<string> {
  const template = (templateId && getExtTemplate(templateId)) || TEMPLATES[0];
  const primary = template.colors.primary;
  const body = template.colors.body;
  const muted = template.colors.muted;
  const headingFont = template.fonts.heading || 'Calibri';
  const bodyFont = template.fonts.body || 'Calibri';
  const pt = (n: number) => n * 2;
  const fileName = buildResumeFileName(profile, resume, 'docx');

  const children: Paragraph[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 60 },
      children: [
        new TextRun({
          text: `${profile.first_name} ${profile.last_name}`.toUpperCase(),
          bold: true,
          size: pt(template.sizes.name),
          font: headingFont,
          color: primary,
        }),
      ],
    })
  );

  const role = resume.jobTitle || profile.title || '';
  if (role) {
    children.push(
      new Paragraph({
        spacing: { after: 80 },
        children: [
          new TextRun({
            text: role,
            size: pt(template.sizes.title),
            font: bodyFont,
            color: body,
          }),
        ],
      })
    );
  }

  const contactBits = [
    profile.email,
    profile.phone,
    profile.location,
    includeLinkedIn ? profile.linkedin : '',
  ].filter(Boolean);
  if (contactBits.length) {
    children.push(
      new Paragraph({
        spacing: { after: 160 },
        border: {
          bottom: { style: BorderStyle.SINGLE, size: 6, color: primary, space: 4 },
        },
        children: [
          new TextRun({
            text: contactBits.join('  |  '),
            size: pt(template.sizes.contact),
            font: bodyFont,
            color: muted,
          }),
        ],
      })
    );
  }

  const section = (title: string) =>
    new Paragraph({
      spacing: { before: 160, after: 80 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 8, color: primary, space: 1 },
      },
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: pt(template.sizes.section),
          font: headingFont,
          color: primary,
        }),
      ],
    });

  if (resume.summary?.trim()) {
    children.push(section('Summary'));
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: runsFromMarkup(resume.summary, {
          size: pt(template.sizes.body),
          font: bodyFont,
          color: body,
        }),
      })
    );
  }

  if (resume.skills?.length) {
    children.push(section('Skills'));
    children.push(
      new Paragraph({
        spacing: { after: 100 },
        children: runsFromMarkup(resume.skills.join(', '), {
          size: pt(template.sizes.body),
          font: bodyFont,
          color: body,
        }),
      })
    );
  }

  if (resume.experience?.length) {
    children.push(section('Experience'));
    for (const exp of resume.experience) {
      children.push(
        new Paragraph({
          spacing: { before: 80, after: 20 },
          children: [
            new TextRun({
              text: `${exp.position || ''}`.trim(),
              bold: true,
              size: pt(template.sizes.experienceHeading),
              font: bodyFont,
              color: body,
            }),
            new TextRun({
              text: exp.company ? `  |  ${exp.company}` : '',
              size: pt(template.sizes.experienceHeading),
              font: bodyFont,
              color: body,
            }),
          ],
        })
      );
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: `${exp.start_date || ''} – ${exp.end_date || ''}`,
              size: pt(template.sizes.experienceMeta),
              font: bodyFont,
              color: muted,
              italics: true,
            }),
          ],
        })
      );
      for (const bullet of exp.descriptions || []) {
        if (!String(bullet || '').trim()) continue;
        children.push(
          new Paragraph({
            spacing: { after: 40 },
            indent: { left: 180 },
            children: [
              new TextRun({
                text: '• ',
                size: pt(template.sizes.body),
                font: bodyFont,
                color: body,
              }),
              ...runsFromMarkup(bullet, {
                size: pt(template.sizes.body),
                font: bodyFont,
                color: body,
              }),
            ],
          })
        );
      }
    }
  }

  if (profile.education?.length) {
    children.push(section('Education'));
    for (const edu of profile.education) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [
            new TextRun({
              text: `${edu.degree || ''} in ${edu.field || ''} — ${edu.school || ''}`,
              size: pt(template.sizes.body),
              font: bodyFont,
              color: body,
            }),
          ],
        })
      );
    }
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: { top: 720, right: 720, bottom: 720, left: 720 },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
  return fileName;
}
