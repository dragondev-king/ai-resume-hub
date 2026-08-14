/**
 * Shared prompt rules for extracting a clear professional job title from a JD.
 * Prefer teaching the model over post-processing heuristics.
 */
export const JOB_TITLE_EXTRACTION_INSTRUCTIONS = `
JOB TITLE EXTRACTION (STRICT):
- Return ONLY a clear professional role title people would put on a resume.
- Prefer the official posted title near the top of the JD (page/header title), not body sentences.
- Good examples: "Cloud Platform Engineer", "Senior JavaScript Developer", "Senior Android Engineer", "Senior Software Engineer"
- Convert specialty postings into normal titles:
  - "Senior Javascript Developer - React" → "Senior JavaScript Developer"
  - "Senior Software Engineer, Android" → "Senior Android Engineer"
  - "Cloud Platform Engineer Job Details | Farmers Insurance Careers" → "Cloud Platform Engineer"
- NEVER return:
  - Body prose ("As a Senior Frontend Developer (React.js / Next.js), you will…")
  - Incomplete fragments with leftover parentheses ("… (React.js")
  - ATS/page chrome ("Job Details", "| Company Careers", "FAIR MATCH", locations, salary, remote/full-time badges)
  - Company name glued onto the title
- Keep Title Case. No pipes, dashes to company names, or marketing suffixes.
`.trim();

/** Light trim only — title quality comes from the prompt, not regex rewriting. */
export function normalizeJobTitle(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  return raw.replace(/\s+/g, ' ').trim();
}
