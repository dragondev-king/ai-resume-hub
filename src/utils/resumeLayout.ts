/** Shared resume visual design tokens and skill helpers (DOCX + PDF). */

export const RESUME_COLORS = {
  primary: '124E44', // teal — name & section headers
  accent: '3CB370', // green — title & contact labels
  body: '3D3D3D',
  muted: '666666',
} as const;

export const RESUME_FONTS = {
  primary: 'Calibri',
  fallback: 'Arial',
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

type SkillCategory = {
  label: string;
  pattern: RegExp;
};

const SKILL_CATEGORIES: SkillCategory[] = [
  {
    label: 'Programming Languages',
    pattern:
      /^(javascript|typescript|python|java|c\+\+|c#|csharp|ruby|go|golang|swift|kotlin|php|rust|scala|r|dart|objective-?c|bash|shell|powershell|sql)$/i,
  },
  {
    label: 'Frameworks & Libraries',
    pattern:
      /(react|next\.?js|angular|vue|svelte|node\.?js|express|django|flask|fastapi|spring|rails|ruby on rails|laravel|nestjs|nuxt|gatsby|jquery|tailwind|bootstrap|hotwire|turbo|stimulus|ant design|\.net|asp\.net)/i,
  },
  {
    label: 'Databases',
    pattern:
      /(postgresql|postgres|mysql|mongodb|sqlite|redis|cassandra|elasticsearch|oracle|dynamodb|mariadb|cosmos|firestore|neo4j|sql server|mssql)/i,
  },
  {
    label: 'Cloud & DevOps',
    pattern:
      /(aws|azure|gcp|google cloud|docker|kubernetes|k8s|terraform|jenkins|gitlab ci|github actions|ci\/?cd|cloud|devops|ansible|helm|lambda|ec2|s3|vercel|netlify)/i,
  },
  {
    label: 'APIs & Integration',
    pattern:
      /(rest(ful)?(\s*apis?)?|graphql|soap|grpc|oauth|json|xml|websocket|api design|api integration|openapi|swagger)/i,
  },
  {
    label: 'Tools & Platforms',
    pattern:
      /(git|jira|confluence|slack|figma|vscode|visual studio|eclipse|postman|notion|linear|datadog|sentry|new relic)/i,
  },
  {
    label: 'Soft Skills',
    pattern:
      /(leadership|communication|teamwork|problem solving|project management|collaboration|mentoring|presentation|negotiation|customer service|time management|organization|creativity|adaptability|critical thinking|decision making|cross-functional)/i,
  },
];

export type CategorizedSkills = { label: string; skills: string[] }[];

/**
 * Group skills into recruiter-friendly categories (reference-resume style).
 * Unmatched skills land in "Other Technologies".
 */
export function categorizeSkills(skills: string[]): CategorizedSkills {
  const unique = Array.from(new Set(skills.map((s) => s.trim()).filter(Boolean)));
  const used = new Set<string>();
  const result: CategorizedSkills = [];

  for (const { label, pattern } of SKILL_CATEGORIES) {
    const matched = unique.filter((s) => !used.has(s.toLowerCase()) && pattern.test(s));
    if (matched.length) {
      matched.forEach((s) => used.add(s.toLowerCase()));
      result.push({ label, skills: matched });
    }
  }

  const other = unique.filter((s) => !used.has(s.toLowerCase()));
  if (other.length) {
    result.push({ label: 'Other Technologies', skills: other });
  }

  return result;
}

/**
 * Pull tech keywords for a role from its bullet text, preferring skills already on the resume.
 */
export function extractRoleTechStack(descriptions: string[], allSkills: string[]): string[] {
  if (!descriptions?.length || !allSkills?.length) return [];
  const blob = descriptions.join(' ').toLowerCase();
  return allSkills.filter((skill) => {
    const needle = skill.trim().toLowerCase();
    if (needle.length < 2) return false;
    return blob.includes(needle);
  }).slice(0, 14);
}
