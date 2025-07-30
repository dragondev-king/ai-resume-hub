import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';

interface GeneratedResume {
  summary: string;
  experience: any[];
  skills: string[];
}

export const generateDocx = async (generatedResume: GeneratedResume, fileName: string): Promise<void> => {
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 1440, // 1 inch
              right: 1440,
              bottom: 1440,
              left: 1440,
            },
          },
        },
        children: [
          // Summary
          ...(generatedResume.summary ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'PROFESSIONAL SUMMARY',
                  size: 24,
                  bold: true,
                  color: '2E5BBA',
                  allCaps: true,
                }),
              ],
              spacing: {
                before: 400,
                after: 200,
              },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: generatedResume.summary,
                  size: 22,
                }),
              ],
              spacing: {
                after: 300,
              },
            }),
          ] : []),
          
          // Experience
          ...(generatedResume.experience.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'PROFESSIONAL EXPERIENCE',
                  size: 24,
                  bold: true,
                  color: '2E5BBA',
                  allCaps: true,
                }),
              ],
              spacing: {
                before: 400,
                after: 200,
              },
            }),
            ...createExperienceSection(generatedResume.experience),
          ] : []),
          
          // Skills
          ...(generatedResume.skills.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'SKILLS',
                  size: 24,
                  bold: true,
                  color: '2E5BBA',
                  allCaps: true,
                }),
              ],
              spacing: {
                before: 400,
                after: 200,
              },
            }),
            new Paragraph({
              children: [
                new TextRun({
                  text: generatedResume.skills.join(', '),
                  size: 22,
                }),
              ],
              spacing: {
                after: 300,
              },
            }),
          ] : []),
        ],
      },
    ],
  });

  // Generate and download the document
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
};

const createExperienceSection = (experience: any[]): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  
  experience.forEach((exp, index) => {
    // Job title and company
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: exp.position,
            size: 24,
            bold: true,
          }),
          new TextRun({
            text: ` at ${exp.company}`,
            size: 24,
            bold: true,
            color: '2E5BBA',
          }),
        ],
        spacing: {
          before: index > 0 ? 300 : 0,
          after: 100,
        },
      })
    );
    
    // Date range
    const dateRange = formatDateRange(exp.start_date, exp.end_date);
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: dateRange,
            size: 20,
            color: '666666',
            italics: true,
          }),
        ],
        spacing: {
          after: 200,
        },
      })
    );
    
    // Description
    if (exp.description) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: exp.description,
              size: 22,
            }),
          ],
          spacing: {
            after: 200,
          },
        })
      );
    }
  });
  
  return paragraphs;
};

const formatDateRange = (startDate: string, endDate: string): string => {
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  return `${start} - ${end}`;
}; 