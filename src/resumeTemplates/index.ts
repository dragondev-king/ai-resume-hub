import type { ResumeTemplate, ResumeTheme } from './types';
import classicTeal from './classic-teal.json';
import modernNavy from './modern-navy.json';
import slateCoral from './slate-coral.json';
import emeraldSerif from './emerald-serif.json';

const TEMPLATES: ResumeTemplate[] = [
  classicTeal as ResumeTemplate,
  modernNavy as ResumeTemplate,
  slateCoral as ResumeTemplate,
  emeraldSerif as ResumeTemplate,
];

export type { ResumeTemplate, ResumeTheme, ResumeSectionId } from './types';

export function listResumeTemplates(): ResumeTemplate[] {
  return [...TEMPLATES];
}

export function getResumeTemplate(id: string): ResumeTemplate | undefined {
  return TEMPLATES.find((t) => t.id === id);
}

/** Pick a template at random (used on each export unless an id is forced). */
export function pickRandomResumeTemplate(): ResumeTemplate {
  const index = Math.floor(Math.random() * TEMPLATES.length);
  return TEMPLATES[index];
}

export function resolveResumeTheme(template?: ResumeTemplate | string): ResumeTheme {
  let resolved: ResumeTemplate | undefined;
  if (typeof template === 'string') {
    resolved = getResumeTemplate(template);
  } else if (template) {
    resolved = template;
  }
  if (!resolved) {
    resolved = pickRandomResumeTemplate();
  }

  const s = resolved.sizes;
  return {
    template: resolved,
    colors: resolved.colors,
    fonts: resolved.fonts,
    docxSizes: {
      name: s.name * 2,
      title: s.title * 2,
      section: s.section * 2,
      experienceHeading: s.experienceHeading * 2,
      experienceMeta: s.experienceMeta * 2,
      body: s.body * 2,
      contact: s.contact * 2,
      experienceBullet: s.body * 2,
    },
    pdfSizes: { ...s },
    spacing: resolved.spacing,
  };
}
