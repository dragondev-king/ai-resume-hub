import {
  formatCurrentSkills,
  formatEducation,
  type ResumeVersionConfig,
} from './resumeGeneration';

const JSON_SHAPE = `{
  "jobTitle": "extracted or inferred job title from the job description",
  "companyName": "extracted or inferred company name from the job description",
  "summary": "Professional summary tailored to this specific role...",
  "experience": [
    {
      "position": "Job title",
      "company": "Company Name",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "address": "Company Address",
      "descriptions": [
        "Shipped a new feature in the lead-generation app using <b>Skill</b> and <b>Skill</b>...",
        "Integrated APIs and backend services with <b>Skill</b>..."
      ]
    }
  ],
  "skills": ["skill1", "skill2", "skill3"]
}`;

export const resumePromptsV2: ResumeVersionConfig = {
  version: 'v2',
  system:
    'You are an expert resume writer. Tailor the resume for ATS keyword match and a human recruiter without inventing a new career. Put job-description keywords in the skills list and, when they are already true, in the summary and current role. Do not paste the hiring company name, product names, or unique JD programs into other employers. Keep each job\'s real stack from the original description and CURRENT SKILLS. Rephrase and reorder to emphasize overlap. Do not add languages, frameworks, or cloud products the candidate did not use at that company. Current/most recent role: 5-8 bullets. Other roles: 3-5. Short or older roles: 2-4. No padding with mentoring/agile/documentation filler. No invented metrics. Wrap tech tokens in experience bullets with <b>...</b>. Never put a version in a job that ended before that version existed. Extract jobTitle and companyName from the job description for metadata only.',
  timelineSystem: `You map technologies onto a candidate's real work history. A version must not appear in a job that ended before it existed. JD technologies belong in a role only if that role's original description or CURRENT SKILLS already include that family. Do not put required JD versions in mustUse unless the original experience already used that family. Respond with valid JSON only.`,
  auditSystem: `You are a credibility editor. Remove invented stacks, target-company leakage, and fake metrics. Do not add new employers or change dates. Prefer fewer honest bullets over padded ones. Respond with valid JSON only.`,
  buildMainPrompt: ({ profile, jobDescription, timeline, today, workHistory }) => `
Create a professional resume for this job. Tailor keywords and emphasis. Do not rewrite the candidate into a different engineer.

TODAY'S DATE: ${today}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE:
Name: ${profile.first_name} ${profile.last_name}
Current Summary: ${profile.summary || ''}

WORK HISTORY (dates, companies, and original stacks are FACTS):
${workHistory}

EDUCATION:
${formatEducation(profile)}

CURRENT SKILLS (keep these; add JD aliases the candidate already has; do not replace this list):
${formatCurrentSkills(profile)}

VERSION / STACK MAP:
${timeline || 'Only name a JD technology in a job if that job already used that family. Versions only if the role was still active after the version shipped. Summary: family names, no versions. Never invent a stack.'}

CRITICAL INSTRUCTIONS:
1. ANALYZE the job description for title, required skills, and terminology. Put jobTitle and companyName in the JSON metadata. Never write the hiring company, product, or program names into the summary or into any employer's bullets.

2. EXPERIENCE — tailor emphasis, freeze the stack:
   - Keep each company's original technologies from Original description and CURRENT SKILLS
   - Rewrite bullets to emphasize work that overlaps the JD, using the JD's phrasing only when it is already true (e.g. REST APIs if they built APIs)
   - Do not add Java, Spring, .NET, GraphQL, SOAP, Terraform, ATO, or any other JD-only stack to a job that did not use it
   - Do not use "scalability", "reliability", "robust", "passionate", "seasoned", "best practices", or "foster"
   - Quantify only if the original description had numbers. Do not invent 20%/25%/40%
   - Use action verbs. Prefer concrete delivery over mentoring/agile/code-review filler

3. BULLET COUNT:
   - Most recent role: 5-8 bullets
   - Other roles: 3-5
   - Short or older roles: 2-4
   - Full accomplishments, not stubs, and not padded to a quota

4. ATS KEYWORDS (this is how the resume still matches):
   - Skills list: start from CURRENT SKILLS, keep them, add JD terms the candidate already has, including exact aliases (AWS and Amazon Web Services if they have AWS)
   - Versions may appear in the skills list for ATS (React 18) even if bullets use the family name
   - Do not add skills the candidate has never used
   - Deduplicate Vue/Vue.js, Angular/Angular.js, React/React.js

5. SUMMARY:
   - 3-4 sentences. Mirror JD language for true strengths. Family names only, no version numbers, no hiring-company name

6. JOB TITLES:
   - Slight honest alignment only (Software Engineer → Senior Software Engineer if they were senior)
   - Do not change frontend work into a backend/Java/.NET title
   - Keep company names and start/end dates exactly

7. BOLD TECH IN BULLETS:
   - Wrap technical skills/tools/frameworks/languages with <b>...</b>
   - Only wrap the token. Keep tags inside JSON strings

Respond with ONLY valid JSON. Same number of positions as original experience.

${JSON_SHAPE}
`,
  buildTimelinePrompt: ({ today, jobDescription, workHistory }) => `TODAY'S DATE: ${today}

JOB DESCRIPTION:
${jobDescription}

CANDIDATE WORK HISTORY (dates and original descriptions are facts):
${workHistory}

Build a chronology map that prevents invented stacks and anachronistic versions.

INSTRUCTIONS:
1. Extract technologies and versioned products from THIS job description.
2. For each, estimate when it first became available (YYYY-MM). Distinguish family vs version.
3. Also note technologies from the original work-history descriptions.
4. For each role:
   - mayUse: families that both (a) existed during that role AND (b) appear in that role's original description or are clearly in the candidate's established stack from CURRENT SKILLS used at that company. Do not list JD-only tech the person never used.
   - mustUse: required JD versions ONLY if this is the most recent role, the role was still active after the version shipped, AND the original description already used that family. Otherwise empty.
   - mustNotUse: versions that did not exist yet, plus JD-only technologies this role never used
   - eraStackGuidance: remind the writer to keep this job's original stack
5. If the candidate never used a JD technology, it belongs in mustNotUse for every role. It may still be omitted from skills later if it is not in CURRENT SKILLS.

Respond with ONLY JSON using the REAL company names, dates, and technologies.

{
  "technologies": [
    {
      "name": "<Family> <Version>",
      "kind": "versioned",
      "introduced": "YYYY-MM",
      "confidence": "high",
      "notes": "Required by the JD. Include in a role only if original experience already used the family."
    }
  ],
  "roles": [
    {
      "company": "<company from work history>",
      "start_date": "YYYY-MM",
      "end_date": "YYYY-MM",
      "mayUse": ["<Family already used here>"],
      "mustUse": [],
      "mustNotUse": ["<JD-only tech>", "<Family> <Version>"],
      "eraStackGuidance": "Keep the original stack. Do not import JD-only technologies."
    }
  ]
}`,
  buildAuditPrompt: ({ today, jobDescription, workHistory, timeline, draft, currentSkills }) => `TODAY'S DATE: ${today}

JOB DESCRIPTION (keywords only — do not copy company/product names into experience):
${jobDescription}

FACTUAL WORK HISTORY (original stacks and dates):
${workHistory}

CURRENT SKILLS:
${currentSkills}

STACK MAP:
${timeline || 'Remove any technology a role did not originally use. Versions only if the role was active after they shipped. No hiring-company names in bullets or summary.'}

DRAFT RESUME JSON:
${draft}

AUDIT:
1. Keep companies, start/end dates, addresses, and the same number of roles.
2. Remove technologies, languages, and frameworks that are not in that job's original description and not in CURRENT SKILLS.
3. Delete any mention of the hiring company, its products, or unique JD program names from summary and bullets.
4. Remove invented percentages and metrics that were not in the original description.
5. Drop padded filler bullets (generic mentoring, agile ceremonies, documentation) if a role is above 8 (current) or 5 (older).
6. Skills: keep the real CURRENT SKILLS list; add only JD aliases the candidate already has; deduplicate; do not replace the list with JD-only keywords.
7. Summary: 3-4 sentences, no version numbers, no hiring-company name.
8. Keep <b>...</b> around remaining tech tokens. No "scalability"/"reliability"/"robust"/"passionate"/"seasoned".

Respond with ONLY the corrected resume JSON in this shape:
${JSON_SHAPE}`,
};
