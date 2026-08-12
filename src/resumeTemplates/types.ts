/** Resume template configuration (loaded from JSON). */

export type ResumeSectionId = 'summary' | 'skills' | 'education' | 'experience';

export interface ResumeTemplate {
  id: string;
  name: string;
  colors: {
    primary: string;
    accent: string;
    body: string;
    muted: string;
  };
  /** Font family names for DOCX (PDF embeds DejaVu Sans). */
  fonts: {
    heading: string;
    body: string;
  };
  /** Font sizes in points. */
  sizes: {
    name: number;
    title: number;
    section: number;
    experienceHeading: number;
    experienceMeta: number;
    body: number;
    contact: number;
  };
  spacing: {
    /** DOCX character spacing (twentieths of a point). */
    charSpacingDocx: number;
    /** DOCX line spacing (240 = single). */
    lineDocx: number;
    pdfCharSpace: number;
    pdfLineHeight: number;
    marginPt: number;
  };
  header: {
    nameAlign: 'left' | 'center';
    nameTransform: 'uppercase' | 'none';
    showRole: boolean;
    underlineAfterContact: boolean;
  };
  contact: {
    layout: 'stacked' | 'inline';
  };
  sectionOrder: ResumeSectionId[];
  experience: {
    layout: 'twoColumn' | 'stacked';
    showAddress: boolean;
  };
  skills: {
    categorized: boolean;
  };
  sectionStyle: {
    underline: boolean;
    allCaps: boolean;
  };
}

/** Runtime helpers derived from a template. */
export interface ResumeTheme {
  template: ResumeTemplate;
  colors: ResumeTemplate['colors'];
  fonts: ResumeTemplate['fonts'];
  /** Half-points for DOCX TextRun.size */
  docxSizes: {
    name: number;
    title: number;
    section: number;
    experienceHeading: number;
    experienceMeta: number;
    body: number;
    contact: number;
    experienceBullet: number;
  };
  /** Points for PDF */
  pdfSizes: ResumeTemplate['sizes'];
  spacing: ResumeTemplate['spacing'];
}
