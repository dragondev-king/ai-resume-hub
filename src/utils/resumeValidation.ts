type ExperienceCompany = {
  company?: string;
  descriptions?: string[];
};

function companyKey(name?: string): string {
  return (name ?? '').trim().toLowerCase();
}

function companiesDiffer(original: ExperienceCompany[], generated: ExperienceCompany[]): boolean {
  if (original.length !== generated.length) return true;
  const counts = new Map<string, number>();
  for (const exp of original) {
    const key = companyKey(exp.company);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  for (const exp of generated) {
    const key = companyKey(exp.company);
    const remaining = counts.get(key) ?? 0;
    if (remaining <= 0) return true;
    counts.set(key, remaining - 1);
  }
  return false;
}

function hasBullet(exp: ExperienceCompany): boolean {
  return (exp.descriptions ?? []).some((line) => line.trim().length > 0);
}

export function validateGeneratedResume(params: {
  originalExperience: ExperienceCompany[];
  generatedExperience: ExperienceCompany[];
  displayedExperience: ExperienceCompany[];
}): string | null {
  const problems: string[] = [];
  if (companiesDiffer(params.originalExperience, params.generatedExperience)) {
    problems.push('The generated companies do not match the original work history. A company was added, removed, or replaced.');
  }
  if (params.displayedExperience.length === 0 || params.displayedExperience.some((exp) => !hasBullet(exp))) {
    problems.push('Some roles have no work experience bullets.');
  }
  if (problems.length === 0) return null;
  return `${problems.join(' ')} Regenerate the resume.`;
}
