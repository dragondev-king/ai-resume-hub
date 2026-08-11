import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  BorderStyle,
  Table,
  TableRow,
  TableCell,
  WidthType,
  VerticalAlign,
} from 'docx';
import { saveAs } from 'file-saver';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { formatDate } from './helpers';
import { getUseAiEnhancedJobTitleForProfile } from './profileMetadata';
import {
  RESUME_COLORS,
  RESUME_FONTS,
  RESUME_SIZES,
  buildResumeSkillSections,
  flattenSkillSections,
  extractRoleTechStack,
} from './resumeLayout';

const FONT_HEADING = RESUME_FONTS.heading;
const FONT_BODY = RESUME_FONTS.body;

interface GeneratedResume {
  summary: string;
  experience: any[];
  skills: string[];
}

type Profile = ProfileWithDetailsRPC;

export interface GenerateDocxOptions {
  /** When set, overrides profile metadata and local fallback. */
  useAiEnhancedJobTitle?: boolean;
  /** When false, omit LinkedIn from the contact section. Defaults to true. */
  includeLinkedIn?: boolean;
}

function getUseAiEnhancedJobTitle(options?: GenerateDocxOptions, profile?: Profile): boolean {
  if (options?.useAiEnhancedJobTitle !== undefined) return options.useAiEnhancedJobTitle;
  if (profile) return getUseAiEnhancedJobTitleForProfile(profile);
  return false;
}

/** Normalize date string for matching (trim, lowercase). */
export function normalizeDateForMatch(d?: string): string {
  return (d ?? '').toString().trim().toLowerCase();
}

/**
 * Match company names bidirectionally so we find profile entries even when AI shortens or rephrases
 * (e.g. profile "Cerner Corporation" vs AI "Cerner", or profile "AIG" vs AI "American International Group").
 */
export function companiesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === y) return true;
  return false;
}

type ExperienceEntry = {
  company?: string;
  position?: string;
  start_date?: string;
  end_date?: string;
  address?: string;
  descriptions?: string[];
};

function findMatchingAiExperience(
  originalExp: { company?: string; start_date?: string },
  aiExperience: ExperienceEntry[]
): ExperienceEntry | undefined {
  return aiExperience.find(
    (ai) =>
      companiesMatch(ai.company, originalExp.company) &&
      normalizeDateForMatch(ai.start_date) === normalizeDateForMatch(originalExp.start_date?.slice(0, 7))
  );
}

/**
 * Resolve experience entries for resume display and DOCX export.
 * When useAiEnhancedJobTitle is true, uses AI experience (company, title, dates, bullets).
 * When false, uses profile experience for metadata and AI-matched bullet descriptions only.
 */
export function resolveResumeExperience(
  originalExperience: ExperienceEntry[],
  aiExperience: ExperienceEntry[],
  useAiEnhancedJobTitle: boolean
): ExperienceEntry[] {
  if (useAiEnhancedJobTitle && aiExperience.length > 0) {
    return aiExperience;
  }

  return originalExperience.map((exp) => {
    const aiMatch = findMatchingAiExperience(exp, aiExperience);
    return {
      company: exp.company,
      position: exp.position,
      start_date: exp.start_date,
      end_date: exp.end_date,
      address: exp.address,
      descriptions: aiMatch?.descriptions ?? [],
    };
  });
}

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

export const generateDocx = async (
  generatedResume: GeneratedResume,
  fileName: string,
  profile?: Profile,
  options?: GenerateDocxOptions
): Promise<void> => {
  const useAiEnhancedJobTitle = getUseAiEnhancedJobTitle(options, profile);
  const includeLinkedIn = options?.includeLinkedIn !== false;
  const skillSections = buildResumeSkillSections(generatedResume.skills ?? []);
  const skills = flattenSkillSections(skillSections);

  const children: (Paragraph | Table)[] = [
    ...createHeader(profile, includeLinkedIn),
  ];

  if (generatedResume.summary) {
    children.push(createSectionHeader('SUMMARY'));
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: generatedResume.summary,
            size: RESUME_SIZES.body,
            font: FONT_BODY,
            color: RESUME_COLORS.body,
          }),
        ],
        spacing: { after: 200 },
      })
    );
  }

  children.push(createSectionHeader('SKILLS'));
  children.push(...createSkillsSection(skillSections));

  if (profile?.education && profile.education.length > 0) {
    children.push(createSectionHeader('EDUCATION'));
    children.push(...createEducationSection(profile.education));
  }

  if (profile?.experience && profile.experience.length > 0) {
    children.push(createSectionHeader('EXPERIENCE'));
    children.push(
      ...createProfessionalExperienceSection(
        profile.experience,
        generatedResume.experience,
        useAiEnhancedJobTitle,
        skills
      )
    );
  }

  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 540,
              right: 720,
              bottom: 540,
              left: 720,
            },
          },
        },
        children,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
};

const createHeader = (profile?: Profile, includeLinkedIn = true): Paragraph[] => {
  const name = profile ? `${profile.first_name} ${profile.last_name}`.toUpperCase() : 'PROFESSIONAL RESUME';
  const title = profile?.title;
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: name,
          size: RESUME_SIZES.name,
          bold: true,
          font: FONT_HEADING,
          color: RESUME_COLORS.primary,
        }),
      ],
      spacing: { after: title ? 60 : 200 },
    }),
  ];

  if (title) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            size: RESUME_SIZES.title,
            bold: true,
            font: FONT_BODY,
            color: RESUME_COLORS.accent,
          }),
        ],
        // Space between role and contact details
        spacing: { after: 280 },
      })
    );
  }

  if (profile) {
    const contactParts: { label: string; value: string }[] = [];
    if (profile.phone) contactParts.push({ label: 'Phone', value: profile.phone });
    if (profile.email) contactParts.push({ label: 'Email', value: profile.email });
    if (profile.location) contactParts.push({ label: 'Location', value: profile.location });
    if (includeLinkedIn && profile.linkedin) contactParts.push({ label: 'LinkedIn', value: profile.linkedin });
    if (profile.portfolio) contactParts.push({ label: 'Portfolio', value: profile.portfolio });

    if (contactParts.length) {
      const runs: TextRun[] = [];
      contactParts.forEach((part, i) => {
        if (i > 0) {
          runs.push(
            new TextRun({
              text: '      ',
              size: RESUME_SIZES.contact,
              font: FONT_BODY,
              color: RESUME_COLORS.body,
            })
          );
        }
        runs.push(
          new TextRun({
            text: `${part.label}: `,
            size: RESUME_SIZES.contact,
            font: FONT_BODY,
            bold: true,
            color: RESUME_COLORS.accent,
          }),
          new TextRun({
            text: part.value,
            size: RESUME_SIZES.contact,
            font: FONT_BODY,
            color: RESUME_COLORS.body,
          })
        );
      });

      paragraphs.push(
        new Paragraph({
          children: runs,
          // Large gap before Summary / first content section
          spacing: { after: 480 },
          border: {
            bottom: {
              style: BorderStyle.SINGLE,
              size: 12,
              color: RESUME_COLORS.primary,
              space: 12,
            },
          },
        }),
        new Paragraph({
          children: [],
          spacing: { after: 200 },
        })
      );
    }
  }

  return paragraphs;
};

const createSectionHeader = (title: string): Paragraph => {
  return new Paragraph({
    children: [
      new TextRun({
        text: title,
        size: RESUME_SIZES.section,
        bold: true,
        font: FONT_HEADING,
        color: RESUME_COLORS.primary,
        allCaps: true,
      }),
    ],
    spacing: { before: 240, after: 120 },
    border: {
      bottom: {
        style: BorderStyle.SINGLE,
        size: 8,
        color: RESUME_COLORS.accent,
        space: 4,
      },
    },
  });
};

const createSkillsSection = (sections: { label: string; skills: string[] }[]): Paragraph[] => {
  return sections.map(
    (cat) =>
      new Paragraph({
        children: [
          new TextRun({
            text: `${cat.label}: `,
            size: RESUME_SIZES.body,
            font: FONT_BODY,
            bold: true,
            color: RESUME_COLORS.body,
          }),
          new TextRun({
            text: cat.skills.join(', '),
            size: RESUME_SIZES.body,
            font: FONT_BODY,
            color: RESUME_COLORS.body,
          }),
        ],
        spacing: { after: 80 },
      })
  );
};

const createTwoColumnRow = (leftParas: Paragraph[], rightParas: Paragraph[]): Table => {
  const leftWidth = 2200;
  const rightWidth = 7400;
  return new Table({
    width: { size: 9600, type: WidthType.DXA },
    columnWidths: [leftWidth, rightWidth],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: leftWidth, type: WidthType.DXA },
            borders: noBorder,
            verticalAlign: VerticalAlign.TOP,
            children: leftParas.length
              ? leftParas
              : [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: rightWidth, type: WidthType.DXA },
            borders: noBorder,
            verticalAlign: VerticalAlign.TOP,
            children: rightParas.length
              ? rightParas
              : [new Paragraph({ children: [] })],
          }),
        ],
      }),
    ],
  });
};

const createProfessionalExperienceSection = (
  originalExperience: any[],
  aiExperience: any[],
  useAiEnhancedJobTitle: boolean,
  allSkills: string[]
): (Paragraph | Table)[] => {
  const blocks: (Paragraph | Table)[] = [];
  const entries = resolveResumeExperience(originalExperience, aiExperience, useAiEnhancedJobTitle);

  entries.forEach((exp, index) => {
    const jobTitle = exp.position ?? '';
    const descriptions = exp.descriptions ?? [];
    const dateRange = formatDateRange(exp.start_date ?? '', exp.end_date ?? '');
    const techStack = extractRoleTechStack(descriptions, allSkills);

    if (index > 0) {
      blocks.push(new Paragraph({ children: [], spacing: { before: 160 } }));
    }

    // Company name — full width, bold teal
    blocks.push(
      new Paragraph({
        children: [
          new TextRun({
            text: exp.company ?? '',
            size: 22,
            bold: true,
            font: FONT_BODY,
            color: RESUME_COLORS.primary,
          }),
        ],
        spacing: { after: 40 },
      })
    );

    const leftParas: Paragraph[] = [];
    if (dateRange) {
      leftParas.push(
        new Paragraph({
          children: [
            new TextRun({
              text: dateRange,
              size: RESUME_SIZES.bodySmall,
              bold: true,
              font: FONT_BODY,
              color: RESUME_COLORS.primary,
            }),
          ],
          spacing: { after: 20 },
        })
      );
    }
    if (exp.address) {
      leftParas.push(
        new Paragraph({
          children: [
            new TextRun({
              text: exp.address,
              size: RESUME_SIZES.bodySmall,
              font: FONT_BODY,
              color: RESUME_COLORS.muted,
            }),
          ],
        })
      );
    }

    const rightParas: Paragraph[] = [
      new Paragraph({
        children: [
          new TextRun({
            text: jobTitle,
            size: 22,
            bold: true,
            font: FONT_BODY,
            color: RESUME_COLORS.body,
          }),
        ],
        spacing: { after: techStack.length ? 40 : 80 },
      }),
    ];

    if (techStack.length) {
      rightParas.push(
        new Paragraph({
          children: [
            new TextRun({
              text: techStack.join(', '),
              size: RESUME_SIZES.techStack,
              italics: true,
              font: FONT_BODY,
              color: RESUME_COLORS.accent,
            }),
          ],
          spacing: { after: 80 },
        })
      );
    }

    for (const description of descriptions) {
      const text = description.endsWith('.') ? description : `${description}.`;
      rightParas.push(
        new Paragraph({
          children: [
            new TextRun({
              text: '• ',
              size: RESUME_SIZES.body,
              font: FONT_BODY,
              color: RESUME_COLORS.body,
            }),
            new TextRun({
              text,
              size: RESUME_SIZES.body,
              font: FONT_BODY,
              color: RESUME_COLORS.body,
            }),
          ],
          spacing: { after: 60 },
        })
      );
    }

    blocks.push(createTwoColumnRow(leftParas, rightParas));
  });

  return blocks;
};

const createEducationSection = (education: any[]): (Paragraph | Table)[] => {
  const blocks: (Paragraph | Table)[] = [];

  education.forEach((edu, index) => {
    if (index > 0) {
      blocks.push(new Paragraph({ children: [], spacing: { before: 120 } }));
    }

    const degreeText = [edu.degree, edu.field].filter(Boolean).join(' in ');
    const dateRange = formatDateRange(edu.start_date, edu.end_date);

    const leftParas: Paragraph[] = [];
    if (dateRange) {
      leftParas.push(
        new Paragraph({
          children: [
            new TextRun({
              text: dateRange,
              size: RESUME_SIZES.bodySmall,
              bold: true,
              font: FONT_BODY,
              color: RESUME_COLORS.primary,
            }),
          ],
          spacing: { after: 20 },
        })
      );
    }

    const rightParas: Paragraph[] = [];
    if (degreeText) {
      rightParas.push(
        new Paragraph({
          children: [
            new TextRun({
              text: degreeText,
              size: RESUME_SIZES.body,
              bold: true,
              font: FONT_BODY,
              color: RESUME_COLORS.primary,
            }),
          ],
          spacing: { after: 20 },
        })
      );
    }
    if (edu.school) {
      rightParas.push(
        new Paragraph({
          children: [
            new TextRun({
              text: edu.school,
              size: RESUME_SIZES.bodySmall,
              font: FONT_BODY,
              color: RESUME_COLORS.accent,
            }),
          ],
        })
      );
    }

    blocks.push(createTwoColumnRow(leftParas, rightParas));
  });

  return blocks;
};

export const formatDateRange = (startDate: string, endDate: string): string => {
  const start = formatDate(startDate);
  const end = formatDate(endDate);

  if (!start && !end) return '';
  if (!start) return `Until ${end}`;
  if (!end) return `${start} - Present`;

  return `${start} – ${end}`;
};
