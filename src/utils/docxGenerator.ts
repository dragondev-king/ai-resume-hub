import { Document, Packer, Paragraph, TextRun } from 'docx';
import { saveAs } from 'file-saver';
import { ResumeData } from '../types/resume';

export const generateDocx = async (resumeData: ResumeData): Promise<void> => {
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
          // Header with name and contact info
          new Paragraph({
            children: [
              new TextRun({
                text: `${resumeData.personalInfo.firstName} ${resumeData.personalInfo.lastName}`,
                size: 32,
                bold: true,
                color: '2E5BBA',
              }),
            ],
            spacing: {
              after: 200,
            },
          }),
          
          // Contact information
          ...createContactInfo(resumeData.personalInfo),
          
          // Summary
          ...(resumeData.generatedContent?.summary || resumeData.summary ? [
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
                  text: resumeData.generatedContent?.summary || resumeData.summary,
                  size: 22,
                }),
              ],
              spacing: {
                after: 300,
              },
            }),
          ] : []),
          
          // Experience
          ...(resumeData.experience.length > 0 ? [
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
            ...createExperienceSection(resumeData.experience),
          ] : []),
          
          // Education
          ...(resumeData.education.length > 0 ? [
            new Paragraph({
              children: [
                new TextRun({
                  text: 'EDUCATION',
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
            ...createEducationSection(resumeData.education),
          ] : []),
          
          // Skills
          ...(resumeData.generatedContent?.skills || resumeData.skills ? [
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
                  text: (resumeData.generatedContent?.skills || resumeData.skills).join(', '),
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
  const fileName = `${resumeData.personalInfo.firstName}_${resumeData.personalInfo.lastName}_Resume.docx`;
  saveAs(blob, fileName);
};

const createContactInfo = (personalInfo: ResumeData['personalInfo']): Paragraph[] => {
  const contactInfo: Paragraph[] = [];
  
  // Email and Phone
  const contactLine = [];
  if (personalInfo.email) {
    contactLine.push(personalInfo.email);
  }
  if (personalInfo.phone) {
    contactLine.push(personalInfo.phone);
  }
  
  if (contactLine.length > 0) {
    contactInfo.push(
      new Paragraph({
        children: [
          new TextRun({
            text: contactLine.join(' | '),
            size: 22,
            color: '666666',
          }),
        ],
        spacing: {
          after: 200,
        },
      })
    );
  }
  
  // Location
  if (personalInfo.location) {
    contactInfo.push(
      new Paragraph({
        children: [
          new TextRun({
            text: personalInfo.location,
            size: 22,
            color: '666666',
          }),
        ],
        spacing: {
          after: 200,
        },
      })
    );
  }
  
  // LinkedIn and Portfolio
  const links = [];
  if (personalInfo.linkedin) {
    links.push(`LinkedIn: ${personalInfo.linkedin}`);
  }
  if (personalInfo.portfolio) {
    links.push(`Portfolio: ${personalInfo.portfolio}`);
  }
  
  if (links.length > 0) {
    contactInfo.push(
      new Paragraph({
        children: [
          new TextRun({
            text: links.join(' | '),
            size: 22,
            color: '666666',
          }),
        ],
        spacing: {
          after: 300,
        },
      })
    );
  }
  
  return contactInfo;
};

const createExperienceSection = (experience: ResumeData['experience']): Paragraph[] => {
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
    const dateRange = formatDateRange(exp.startDate, exp.endDate, exp.current);
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
    
    // Achievements
    if (exp.achievements && exp.achievements.length > 0) {
      exp.achievements.forEach(achievement => {
        if (achievement.trim()) {
          paragraphs.push(
            new Paragraph({
              children: [
                new TextRun({
                  text: '• ',
                  size: 22,
                }),
                new TextRun({
                  text: achievement,
                  size: 22,
                }),
              ],
              spacing: {
                after: 100,
              },
              indent: {
                left: 720, // 0.5 inch
              },
            })
          );
        }
      });
    }
  });
  
  return paragraphs;
};

const createEducationSection = (education: ResumeData['education']): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  
  education.forEach((edu, index) => {
    // Degree and institution
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: `${edu.degree} in ${edu.field}`,
            size: 24,
            bold: true,
          }),
          new TextRun({
            text: `, ${edu.institution}`,
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
    
    // Date range and GPA
    const dateRange = formatDateRange(edu.startDate, edu.endDate, edu.current);
    const gpaText = edu.gpa ? ` | GPA: ${edu.gpa}` : '';
    
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: dateRange + gpaText,
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
  });
  
  return paragraphs;
};

const formatDateRange = (startDate: string, endDate: string, current: boolean): string => {
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };
  
  const start = formatDate(startDate);
  const end = current ? 'Present' : formatDate(endDate);
  return `${start} - ${end}`;
}; 