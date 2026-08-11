/** Shared resume visual design tokens and skill helpers (DOCX + PDF). */

export const RESUME_COLORS = {
  primary: '124E44', // teal — name & section headers
  accent: '3CB370', // green — title & contact labels
  body: '3D3D3D',
  muted: '666666',
} as const;

export const RESUME_FONTS = {
  /** Full name + section headers */
  heading: 'Verdana',
  /** Body content (summary, skills, experience, contact, etc.) */
  body: 'Lucida Sans',
} as const;

/** Half-points for DOCX TextRun size (e.g. 48 = 24pt). */
export const RESUME_SIZES = {
  name: 48,
  title: 26,
  contact: 18,
  section: 24,
  body: 20,
  bodySmall: 18,
  techStack: 17,
} as const;

export type CategorizedSkills = { label: string; skills: string[] }[];

type SkillSectionDef = {
  label: string;
  /** Always included on every resume. */
  base: string[];
  /** Match job-requirement / AI skills into this section. */
  pattern: RegExp;
};

/**
 * Static skill baseline for all resumes.
 * Job-specific skills are merged into these sections when they match.
 */
const STATIC_SKILL_SECTIONS: SkillSectionDef[] = [
  {
    label: 'Programming Languages',
    base: ['JavaScript', 'TypeScript', 'Python', 'HTML', 'Go', 'Ruby'],
    pattern:
      /^(javascript|typescript|python|html|go|golang|ruby|java|c\+\+|c#|csharp|swift|kotlin|php|rust|scala|css|sql)$/i,
  },
  {
    label: 'Frameworks & Libraries',
    base: [
      'React',
      'Next.js',
      'Vue.js',
      'Angular.js',
      'Nuxt',
      'Django',
      'Flask',
      'FastAPI',
      'Ruby on Rails',
      'Node.js',
      'Express.js',
    ],
    pattern:
      /(react|next\.?js|vue(\.js)?|angular(\.js)?|nuxt|django|flask|fastapi|rails|ruby on rails|node\.?js|express(\.js)?|svelte|nestjs|spring|laravel|tailwind|bootstrap)/i,
  },
  {
    label: 'Databases',
    base: ['PostgreSQL', 'MongoDB', 'MySQL', 'SQLite', 'Supabase', 'Firebase'],
    pattern:
      /(postgresql|postgres|mongodb|mysql|sqlite|supabase|firebase|firestore|redis|dynamodb|mariadb|oracle|sql server|mssql)/i,
  },
  {
    label: 'Cloud & DevOps',
    base: ['AWS', 'GCP', 'Azure', 'Jenkins', 'CI/CD', 'CircleCI', 'Docker'],
    pattern:
      /(aws|gcp|google cloud|azure|jenkins|ci\/?cd|circleci|docker|kubernetes|k8s|terraform|github actions|gitlab ci|ansible|helm)/i,
  },
];

function normalizeSkillKey(skill: string): string {
  return skill.trim().toLowerCase().replace(/\s+/g, ' ');
}

function mergeUnique(base: string[], extras: string[]): string[] {
  const seen = new Set(base.map(normalizeSkillKey));
  const result = [...base];
  for (const skill of extras) {
    const trimmed = skill.trim();
    if (!trimmed) continue;
    const key = normalizeSkillKey(trimmed);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(trimmed);
  }
  return result;
}

/**
 * Build skill sections: static baseline for every resume, plus extras from
 * job-requirement / AI skills that fit each category.
 */
export function buildResumeSkillSections(jobSkills: string[] = []): CategorizedSkills {
  const extras = jobSkills.map((s) => s.trim()).filter(Boolean);
  const used = new Set<string>();

  return STATIC_SKILL_SECTIONS.map(({ label, base, pattern }) => {
    const matchedExtras = extras.filter((skill) => {
      const key = normalizeSkillKey(skill);
      if (used.has(key)) return false;
      if (!pattern.test(skill)) return false;
      used.add(key);
      return true;
    });
    return { label, skills: mergeUnique(base, matchedExtras) };
  });
}

/** Flat list of all skills shown on the resume (for tech-stack highlighting, etc.). */
export function flattenSkillSections(sections: CategorizedSkills): string[] {
  return sections.flatMap((s) => s.skills);
}

/** @deprecated Prefer buildResumeSkillSections — kept for any callers expecting the old name. */
export function categorizeSkills(skills: string[]): CategorizedSkills {
  return buildResumeSkillSections(skills);
}

/**
 * Pull tech keywords for a role from its bullet text, preferring skills already on the resume.
 */
export function extractRoleTechStack(descriptions: string[], allSkills: string[]): string[] {
  if (!descriptions?.length || !allSkills?.length) return [];
  const blob = descriptions.join(' ').toLowerCase();
  return allSkills
    .filter((skill) => {
      const needle = skill.trim().toLowerCase();
      if (needle.length < 2) return false;
      return blob.includes(needle);
    })
    .slice(0, 14);
}
