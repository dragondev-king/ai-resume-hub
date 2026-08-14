import {
  AlignmentType,
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
  buildResumeSkillSections,
  ensureTrailingPeriod,
  parseBoldMarkup,
} from './resumeLayout';
import { resolveResumeTheme, type ResumeTheme } from '../resumeTemplates';

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
  /** Force a template id; otherwise a random template is chosen. */
  templateId?: string;
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

export function companiesMatch(a?: string, b?: string): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
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

export function resolveResumeExperience(
  originalExperience: ExperienceEntry[],
  aiExperience: ExperienceEntry[],
  useAiEnhancedJobTitle: boolean
): ExperienceEntry[] {
  if (useAiEnhancedJobTitle && aiExperience.length > 0) {
    return aiExperience.map((ai, index) => ({
      ...ai,
      descriptions: normalizeExperienceDescriptions(ai, originalExperience[index]),
    }));
  }

  return originalExperience.map((exp, index) => {
    const aiMatch = findMatchingAiExperience(exp, aiExperience) || aiExperience[index];
    return {
      company: exp.company,
      position: exp.position,
      start_date: exp.start_date,
      end_date: exp.end_date,
      address: exp.address,
      descriptions: normalizeExperienceDescriptions(aiMatch, exp),
    };
  });
}

function normalizeExperienceDescriptions(
  aiExp?: ExperienceEntry | null,
  originalExp?: ExperienceEntry | null
): string[] {
  const fromAi = Array.isArray(aiExp?.descriptions)
    ? aiExp!.descriptions.filter((d) => typeof d === 'string' && d.trim())
    : [];
  if (fromAi.length) return fromAi;

  const originalDescs = Array.isArray(originalExp?.descriptions)
    ? originalExp!.descriptions.filter((d) => typeof d === 'string' && d.trim())
    : [];
  if (originalDescs.length) return originalDescs;

  if (typeof (originalExp as any)?.description === 'string' && (originalExp as any).description.trim()) {
    return [(originalExp as any).description.trim()];
  }

  return [];
}

const noBorder = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function makeBodyRun(theme: ResumeTheme) {
  return (opts: {
    text: string;
    bold?: boolean;
    italics?: boolean;
    size?: number;
    color?: string;
    font?: string;
  }) =>
    new TextRun({
      text: opts.text,
      bold: opts.bold,
      italics: opts.italics,
      size: opts.size ?? theme.docxSizes.body,
      font: opts.font ?? theme.fonts.body,
      color: opts.color ?? theme.colors.body,
      characterSpacing: theme.spacing.charSpacingDocx,
    });
}

function bodyParagraphSpacing(theme: ResumeTheme, after = 120) {
  return {
    after,
    line: theme.spacing.lineDocx,
    lineRule: 'auto' as const,
  };
}

export const generateDocx = async (
  generatedResume: GeneratedResume,
  fileName: string,
  profile?: Profile,
  options?: GenerateDocxOptions
): Promise<void> => {
  const theme = resolveResumeTheme(options?.templateId);
  const useAiEnhancedJobTitle = getUseAiEnhancedJobTitle(options, profile);
  const includeLinkedIn = options?.includeLinkedIn !== false;
  const skillSections = buildResumeSkillSections(generatedResume.skills ?? []);
  const bodyRun = makeBodyRun(theme);
  const t = theme.template;

  const children: (Paragraph | Table)[] = [
    ...createHeader(theme, bodyRun, profile, includeLinkedIn),
  ];

  const sectionBuilders: Record<string, () => (Paragraph | Table)[]> = {
    summary: () => {
      if (!generatedResume.summary) return [];
      return [
        createSectionHeader(theme, 'SUMMARY'),
        new Paragraph({
          children: parseBoldMarkup(generatedResume.summary).map((seg) =>
            bodyRun({ text: seg.text, bold: seg.bold, size: theme.docxSizes.body })
          ),
          spacing: bodyParagraphSpacing(theme, 200),
          alignment: AlignmentType.LEFT,
        }),
      ];
    },
    skills: () => {
      const skills = generatedResume.skills ?? [];
      if (!skills.length && !skillSections.length) return [];
      return [
        createSectionHeader(theme, 'SKILLS'),
        ...createSkillsSection(theme, bodyRun, skillSections, t.skills.categorized, skills),
      ];
    },
    education: () => {
      if (!profile?.education?.length) return [];
      return [
        createSectionHeader(theme, 'EDUCATION'),
        ...createEducationSection(theme, bodyRun, profile.education),
      ];
    },
    experience: () => {
      if (!profile?.experience?.length) return [];
      return [
        createSectionHeader(theme, 'EXPERIENCE'),
        ...createProfessionalExperienceSection(
          theme,
          bodyRun,
          profile.experience,
          generatedResume.experience,
          useAiEnhancedJobTitle
        ),
      ];
    },
  };

  for (const sectionId of t.sectionOrder) {
    children.push(...(sectionBuilders[sectionId]?.() ?? []));
  }

  const marginTwips = theme.spacing.marginPt * 20;
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: marginTwips,
              right: marginTwips,
              bottom: marginTwips,
              left: marginTwips,
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

type BodyRunFn = ReturnType<typeof makeBodyRun>;

const createHeader = (
  theme: ResumeTheme,
  bodyRun: BodyRunFn,
  profile?: Profile,
  includeLinkedIn = true
): Paragraph[] => {
  const t = theme.template;
  const rawName = profile ? `${profile.first_name} ${profile.last_name}` : 'Professional Resume';
  const name = t.header.nameTransform === 'uppercase' ? rawName.toUpperCase() : rawName;
  const align = t.header.nameAlign === 'center' ? AlignmentType.CENTER : AlignmentType.LEFT;
  const title = t.header.showRole ? profile?.title : undefined;

  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: name,
          size: theme.docxSizes.name,
          bold: true,
          font: theme.fonts.heading,
          color: theme.colors.primary,
          characterSpacing: theme.spacing.charSpacingDocx,
        }),
      ],
      alignment: align,
      spacing: { after: title ? 60 : 200 },
    }),
  ];

  if (title) {
    paragraphs.push(
      new Paragraph({
        children: [
          bodyRun({
            text: title,
            size: theme.docxSizes.title,
            bold: true,
            color: theme.colors.accent,
          }),
        ],
        alignment: align,
        spacing: { after: 200 },
      })
    );
  }

  if (!profile) return paragraphs;

  const contactParts: { label: string; value: string }[] = [];
  if (profile.phone) contactParts.push({ label: 'Phone', value: profile.phone });
  if (profile.email) contactParts.push({ label: 'Email', value: profile.email });
  if (profile.location) contactParts.push({ label: 'Location', value: profile.location });
  if (includeLinkedIn && profile.linkedin) contactParts.push({ label: 'LinkedIn', value: profile.linkedin });
  if (profile.portfolio) contactParts.push({ label: 'Portfolio', value: profile.portfolio });

  if (!contactParts.length) return paragraphs;

  const contactBorder = t.header.underlineAfterContact
    ? {
        bottom: {
          style: BorderStyle.SINGLE,
          size: 12,
          color: theme.colors.primary,
          space: 4,
        },
      }
    : undefined;

  if (t.contact.layout === 'inline') {
    const runs: TextRun[] = [];
    contactParts.forEach((part, i) => {
      if (i > 0) runs.push(bodyRun({ text: '   |   ', size: theme.docxSizes.contact }));
      runs.push(
        bodyRun({
          text: `${part.label}: `,
          size: theme.docxSizes.contact,
          bold: true,
          color: theme.colors.accent,
        }),
        bodyRun({ text: part.value, size: theme.docxSizes.contact })
      );
    });
    paragraphs.push(
      new Paragraph({
        children: runs,
        alignment: align,
        spacing: bodyParagraphSpacing(theme, 160),
        border: contactBorder,
      })
    );
  } else {
    contactParts.forEach((part, i) => {
      const isLast = i === contactParts.length - 1;
      paragraphs.push(
        new Paragraph({
          children: [
            bodyRun({
              text: `${part.label}: `,
              size: theme.docxSizes.contact,
              bold: true,
              color: theme.colors.accent,
            }),
            bodyRun({ text: part.value, size: theme.docxSizes.contact }),
          ],
          alignment: align,
          spacing: bodyParagraphSpacing(theme, isLast ? 120 : 40),
          border: isLast ? contactBorder : undefined,
        })
      );
    });
  }

  paragraphs.push(new Paragraph({ children: [], spacing: { after: 120 } }));
  return paragraphs;
};

const createSectionHeader = (theme: ResumeTheme, title: string): Paragraph => {
  const label = theme.template.sectionStyle.allCaps ? title.toUpperCase() : title;
  return new Paragraph({
    children: [
      new TextRun({
        text: label,
        size: theme.docxSizes.section,
        bold: true,
        font: theme.fonts.heading,
        color: theme.colors.primary,
        characterSpacing: theme.spacing.charSpacingDocx,
      }),
    ],
    spacing: { before: 240, after: 120 },
    border: theme.template.sectionStyle.underline
      ? {
          bottom: {
            style: BorderStyle.SINGLE,
            size: 8,
            color: theme.colors.accent,
            space: 4,
          },
        }
      : undefined,
  });
};

const createSkillsSection = (
  theme: ResumeTheme,
  bodyRun: BodyRunFn,
  sections: { label: string; skills: string[] }[],
  categorized: boolean,
  flatSkills: string[]
): Paragraph[] => {
  if (!categorized) {
    const skills = flatSkills.length
      ? Array.from(new Set(flatSkills))
      : sections.flatMap((s) => s.skills);
    if (!skills.length) return [];
    return [
      new Paragraph({
        children: [bodyRun({ text: skills.join(', ') })],
        spacing: bodyParagraphSpacing(theme, 80),
      }),
    ];
  }

  return sections.map(
    (cat) =>
      new Paragraph({
        children: [
          bodyRun({ text: `${cat.label}: `, bold: true }),
          bodyRun({ text: cat.skills.join(', ') }),
        ],
        spacing: bodyParagraphSpacing(theme, 80),
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
            children: leftParas.length ? leftParas : [new Paragraph({ children: [] })],
          }),
          new TableCell({
            width: { size: rightWidth, type: WidthType.DXA },
            borders: noBorder,
            verticalAlign: VerticalAlign.TOP,
            children: rightParas.length ? rightParas : [new Paragraph({ children: [] })],
          }),
        ],
      }),
    ],
  });
};

const createProfessionalExperienceSection = (
  theme: ResumeTheme,
  bodyRun: BodyRunFn,
  originalExperience: any[],
  aiExperience: any[],
  useAiEnhancedJobTitle: boolean
): (Paragraph | Table)[] => {
  const blocks: (Paragraph | Table)[] = [];
  const entries = resolveResumeExperience(originalExperience, aiExperience, useAiEnhancedJobTitle);
  const twoColumn = theme.template.experience.layout === 'twoColumn';
  const showAddress = theme.template.experience.showAddress;

  entries.forEach((exp, index) => {
    const jobTitle = exp.position ?? '';
    const descriptions = exp.descriptions ?? [];
    const dateRange = formatDateRange(exp.start_date ?? '', exp.end_date ?? '');

    if (index > 0) {
      blocks.push(new Paragraph({ children: [], spacing: { before: 160 } }));
    }

    blocks.push(
      new Paragraph({
        children: [
          bodyRun({
            text: exp.company ?? '',
            size: theme.docxSizes.experienceHeading,
            bold: true,
            color: theme.colors.primary,
          }),
        ],
        spacing: bodyParagraphSpacing(theme, 40),
      })
    );

    if (twoColumn) {
      const leftParas: Paragraph[] = [];
      if (dateRange) {
        leftParas.push(
          new Paragraph({
            children: [
              bodyRun({
                text: dateRange,
                size: theme.docxSizes.experienceMeta,
                bold: true,
                color: theme.colors.primary,
              }),
            ],
            spacing: bodyParagraphSpacing(theme, 20),
          })
        );
      }
      if (showAddress && exp.address) {
        leftParas.push(
          new Paragraph({
            children: [bodyRun({ text: exp.address, color: theme.colors.muted })],
            spacing: bodyParagraphSpacing(theme, 0),
          })
        );
      }

      const rightParas: Paragraph[] = [
        new Paragraph({
          children: [
            bodyRun({
              text: jobTitle,
              size: theme.docxSizes.experienceHeading,
              bold: true,
            }),
          ],
          spacing: bodyParagraphSpacing(theme, 80),
        }),
      ];

      for (const description of descriptions) {
        const text = ensureTrailingPeriod(description);
        rightParas.push(
          new Paragraph({
            children: [
              bodyRun({ text: '• ', size: theme.docxSizes.experienceBullet }),
              ...parseBoldMarkup(text).map((seg) =>
                bodyRun({
                  text: seg.text,
                  size: theme.docxSizes.experienceBullet,
                  bold: seg.bold,
                })
              ),
            ],
            spacing: bodyParagraphSpacing(theme, 60),
          })
        );
      }

      blocks.push(createTwoColumnRow(leftParas, rightParas));
    } else {
      if (jobTitle) {
        blocks.push(
          new Paragraph({
            children: [
              bodyRun({
                text: jobTitle,
                size: theme.docxSizes.experienceHeading,
                bold: true,
              }),
            ],
            spacing: bodyParagraphSpacing(theme, 40),
          })
        );
      }
      const metaBits = [dateRange, showAddress ? exp.address : ''].filter(Boolean);
      if (metaBits.length) {
        blocks.push(
          new Paragraph({
            children: [
              bodyRun({
                text: metaBits.join('  ·  '),
                size: theme.docxSizes.experienceMeta,
                italics: true,
                color: theme.colors.muted,
              }),
            ],
            spacing: bodyParagraphSpacing(theme, 60),
          })
        );
      }
      for (const description of descriptions) {
        const text = ensureTrailingPeriod(description);
        blocks.push(
          new Paragraph({
            children: [
              bodyRun({ text: '• ', size: theme.docxSizes.experienceBullet }),
              ...parseBoldMarkup(text).map((seg) =>
                bodyRun({
                  text: seg.text,
                  size: theme.docxSizes.experienceBullet,
                  bold: seg.bold,
                })
              ),
            ],
            spacing: bodyParagraphSpacing(theme, 60),
          })
        );
      }
    }
  });

  return blocks;
};

const createEducationSection = (
  theme: ResumeTheme,
  bodyRun: BodyRunFn,
  education: any[]
): (Paragraph | Table)[] => {
  const blocks: (Paragraph | Table)[] = [];
  const twoColumn = theme.template.experience.layout === 'twoColumn';

  education.forEach((edu, index) => {
    if (index > 0) {
      blocks.push(new Paragraph({ children: [], spacing: { before: 120 } }));
    }

    const degreeText = [edu.degree, edu.field].filter(Boolean).join(' in ');
    const dateRange = formatDateRange(edu.start_date, edu.end_date);

    if (twoColumn) {
      const leftParas: Paragraph[] = [];
      if (dateRange) {
        leftParas.push(
          new Paragraph({
            children: [
              bodyRun({
                text: dateRange,
                bold: true,
                color: theme.colors.primary,
              }),
            ],
            spacing: bodyParagraphSpacing(theme, 20),
          })
        );
      }
      const rightParas: Paragraph[] = [];
      if (degreeText) {
        rightParas.push(
          new Paragraph({
            children: [
              bodyRun({
                text: degreeText,
                bold: true,
                color: theme.colors.primary,
              }),
            ],
            spacing: bodyParagraphSpacing(theme, 20),
          })
        );
      }
      if (edu.school) {
        rightParas.push(
          new Paragraph({
            children: [bodyRun({ text: edu.school, color: theme.colors.accent })],
            spacing: bodyParagraphSpacing(theme, 0),
          })
        );
      }
      blocks.push(createTwoColumnRow(leftParas, rightParas));
    } else {
      if (degreeText) {
        blocks.push(
          new Paragraph({
            children: [
              bodyRun({
                text: degreeText,
                bold: true,
                color: theme.colors.primary,
              }),
            ],
            spacing: bodyParagraphSpacing(theme, 20),
          })
        );
      }
      const schoolLine = [edu.school, dateRange].filter(Boolean).join('  ·  ');
      if (schoolLine) {
        blocks.push(
          new Paragraph({
            children: [bodyRun({ text: schoolLine, color: theme.colors.muted })],
            spacing: bodyParagraphSpacing(theme, 40),
          })
        );
      }
    }
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
