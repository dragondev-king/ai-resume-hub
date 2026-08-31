export type BoldTextSegment = { text: string; bold: boolean };

export function parseBoldMarkup(input: string): BoldTextSegment[] {
  if (!input) return [];
  const segments: BoldTextSegment[] = [];
  const re = /<(?:b|bold)>([\s\S]*?)<\/(?:b|bold)>|\*\*([\s\S]*?)\*\*/gi;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = re.exec(input)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: input.slice(lastIndex, match.index), bold: false });
    }
    const boldText = match[1] ?? match[2] ?? '';
    if (boldText) {
      segments.push({ text: boldText, bold: true });
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < input.length) {
    segments.push({ text: input.slice(lastIndex), bold: false });
  }

  return segments.filter((s) => s.text.length > 0);
}

export function stripBoldMarkup(input: string): string {
  return parseBoldMarkup(input)
    .map((s) => s.text)
    .join('');
}
