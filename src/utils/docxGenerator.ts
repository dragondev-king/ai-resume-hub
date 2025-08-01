import { Document, Packer, Paragraph, TextRun, AlignmentType, BorderStyle } from 'docx';
import { saveAs } from 'file-saver';
import { ProfileWithDetailsRPC } from '../lib/supabase';

interface GeneratedResume {
  summary: string;
  experience: any[];
  skills: string[];
}

type Profile = ProfileWithDetailsRPC;

export const generateDocx = async (generatedResume: GeneratedResume, fileName: string, profile?: Profile): Promise<void> => {
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
          ...createHeader(profile),
          
          // Contact Information
          ...(profile ? [
            createSectionHeader('CONTACT'),
            ...createContactSection(profile)
          ] : []),
          
          // Professional Summary
          ...(generatedResume.summary ? [
            createSectionHeader('SUMMARY'),
            new Paragraph({
              children: [
                new TextRun({
                  text: generatedResume.summary,
                  size: 22,
                }),
              ],
              spacing: {
                after: 400,
              },
            }),
          ] : []),
          
          // Professional Experience (combine original profile experience with AI enhancements)
          ...(profile?.experience && profile.experience.length > 0 ? [
            createSectionHeader('PROFESSIONAL EXPERIENCE'),
            ...createProfessionalExperienceSection(profile.experience, generatedResume.experience),
          ] : []),
          
          // Education
          ...(profile?.education && profile.education.length > 0 ? [
            createSectionHeader('EDUCATION'),
            ...createEducationSection(profile.education),
          ] : []),
          
          // Skills (combine original profile skills with AI enhancements)
          ...(generatedResume?.skills && generatedResume.skills.length > 0 ? [
            createSectionHeader('SKILLS'),
            ...createSkillsSection(Array.from(new Set([...generatedResume.skills]))),
          ] : []),
        ],
      },
    ],
  });

  // Generate and download the document
  const blob = await Packer.toBlob(doc);
  saveAs(blob, fileName);
};

const createHeader = (profile?: Profile): Paragraph[] => {
  const name = profile ? `${profile.first_name} ${profile.last_name}` : 'Professional Resume';
  const title = profile?.title;
  
  const paragraphs: Paragraph[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: name,
          size: 36,
          bold: true,
          font: 'Cambria',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: {
        before: 200,
        after: title ? 100 : 200,
      },
    })
  ];

  if (title) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: title,
            size: 24,
            font: 'Cambria',
          }),
        ],
        alignment: AlignmentType.CENTER,
        spacing: {
          after: 200,
        },
      })
    );
  }

  return paragraphs;
};

const createContactSection = (profile: Profile): Paragraph[] => {
  const contactInfo = [];
  
  if (profile.email) contactInfo.push({ label: 'Email', value: profile.email });
  if (profile.phone) contactInfo.push({ label: 'Phone', value: profile.phone });
  if (profile.location) contactInfo.push({ label: 'Location', value: profile.location });
  if (profile.linkedin) contactInfo.push({ label: 'LinkedIn', value: profile.linkedin });
  if (profile.portfolio) contactInfo.push({ label: 'Portfolio', value: profile.portfolio });
  
  return contactInfo.map(info => 
    new Paragraph({
      children: [
        new TextRun({
          text: '• ',
          size: 20,
          font: 'Cambria',
        }),
        new TextRun({
          text: `${info.label}: `,
          size: 20,
          font: 'Cambria',
          bold: true,
        }),
        new TextRun({
          text: info.value,
          size: 20,
          font: 'Cambria',
        }),
      ],
      alignment: AlignmentType.LEFT,
      spacing: {
        after: 100,
      },
    })
  );
};

const createSectionHeader = (title: string): Paragraph => {
  return new Paragraph({
    children: [
      new TextRun({
        text: title,
        size: 28,
        bold: true,
        font: 'Cambria',
        allCaps: true,
      }),
    ],
    spacing: {
      before: 400,
      after: 200,
    },
    border: {
      bottom: {
        space: 1,
        style: BorderStyle.SINGLE,
        size: 6,
      },
    },
  });
};

const createProfessionalExperienceSection = (originalExperience: any[], aiExperience: any[]): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  
  // Use original experience data, but enhance with AI-generated descriptions if available
  originalExperience.forEach((exp, index) => {
    // Try to find matching AI-enhanced experience (only by company name)
    const aiEnhanced = aiExperience.find(ai => 
      ai.company?.toLowerCase().includes(exp.company?.toLowerCase())
    );
    
    // Use AI-enhanced descriptions array if available, otherwise convert original to array
    const descriptions = aiEnhanced?.descriptions || (exp.description ? [exp.description] : []);
    
    // Add spacing before each experience entry
    if (index > 0) {
      paragraphs.push(
        new Paragraph({
          children: [],
          spacing: { before: 300 },
        })
      );
    }

    // Company name
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: exp.company,
            size: 24,
            bold: true,
            font: 'Cambria',
          }),
        ],
        spacing: { after: 100 },
      })
    );

    // Job title
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: aiEnhanced?.position || exp.position,
            size: 22,
            bold: true,
            font: 'Cambria',
          }),
        ],
        spacing: { after: 100 },
      })
    );

    // Date range and location
    const dateLocation = [];
    const dateRange = formatDateRange(exp.start_date, exp.end_date);
    if (dateRange) dateLocation.push(dateRange);
    if (exp.location) dateLocation.push(exp.location);
    
    if (dateLocation.length > 0) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: dateLocation.join(' | '),
              size: 20,
              italics: true,
              font: 'Cambria',
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }

    // Experience bullet points
    if (descriptions && descriptions.length > 0) {
      const bulletPoints = createExperienceBulletPoints(descriptions);
      paragraphs.push(...bulletPoints);
    }

    // Add spacing after the experience entry
    paragraphs.push(
      new Paragraph({
        children: [],
        spacing: { after: 200 },
      })
    );
  });
  
  return paragraphs;
};

const createEducationSection = (education: any[]): Paragraph[] => {
  const paragraphs: Paragraph[] = [];
  
  education.forEach((edu, index) => {
    if (index > 0) {
      paragraphs.push(
        new Paragraph({
          children: [],
          spacing: { before: 200 },
        })
      );
    }

    // Degree and field
    const degreeText = [edu.degree, edu.field].filter(Boolean).join(' in ');
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: degreeText,
            size: 22,
            bold: true,
            font: 'Cambria',
          }),
        ],
        spacing: { after: 100 },
      })
    );

    // School and dates
    const schoolInfo = [];
    if (edu.school) schoolInfo.push(edu.school);
    const dateRange = formatDateRange(edu.start_date, edu.end_date);
    if (dateRange) schoolInfo.push(`(${dateRange})`);
    
    if (schoolInfo.length > 0) {
      paragraphs.push(
        new Paragraph({
          children: [
            new TextRun({
              text: schoolInfo.join(' '),
              size: 20,
              font: 'Cambria',
            }),
          ],
          spacing: { after: 200 },
        })
      );
    }
  });
  
  return paragraphs;
};

const createExperienceBulletPoints = (descriptions: string[]): Paragraph[] => {
  if (!descriptions || descriptions.length === 0) return [];

  return descriptions.map(description => 
    new Paragraph({
      children: [
        new TextRun({
          text: '• ',
          size: 22,
          font: 'Cambria',
        }),
        new TextRun({
          text: description.endsWith('.') ? description : description + '.',
          size: 22,
          font: 'Cambria',
        }),
      ],
      spacing: {
        after: 120,
      },
      indent: {
        left: 360, // 0.25 inch indent
      },
    })
  );
};

const createSkillsSection = (skills: string[]): Paragraph[] => {
  // Group skills into categories for better presentation
  const technicalSkills = skills.filter(skill => 
    /(javascript|python|java|c\+\+|react|angular|vue|node|sql|aws|docker|kubernetes|git|agile|scrum|api|html|css|typescript|php|ruby|go|rust|swift|kotlin|flutter|react native|machine learning|ai|data|analytics|cloud|devops|testing|ci\/cd)/i.test(skill)
  );
  
  const softSkills = skills.filter(skill => 
    /(leadership|communication|teamwork|problem solving|project management|collaboration|mentoring|presentation|negotiation|customer service|time management|organization|creativity|adaptability|critical thinking|decision making)/i.test(skill)
  );

  const otherSkills = skills.filter(skill => 
    !technicalSkills.includes(skill) && !softSkills.includes(skill)
  );

  const paragraphs: Paragraph[] = [];

  if (technicalSkills.length > 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Technical: ',
            size: 22,
            font: 'Cambria',
            bold: true,
          }),
          new TextRun({
            text: technicalSkills.join(', '),
            size: 22,
            font: 'Cambria',
          }),
        ],
        spacing: {
          after: 150,
        },
      })
    );
  }
  
  if (softSkills.length > 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Soft Skills: ',
            size: 22,
            font: 'Cambria',
            bold: true,
          }),
          new TextRun({
            text: softSkills.join(', '),
            size: 22,
            font: 'Cambria',
          }),
        ],
        spacing: {
          after: 150,
        },
      })
    );
  }
  
  if (otherSkills.length > 0) {
    paragraphs.push(
      new Paragraph({
        children: [
          new TextRun({
            text: 'Other: ',
            size: 22,
            font: 'Cambria',
            bold: true,
          }),
          new TextRun({
            text: otherSkills.join(', '),
            size: 22,
            font: 'Cambria',
          }),
        ],
        spacing: {
          after: 300,
        },
      })
    );
  }

  return paragraphs;
};

const formatDateRange = (startDate: string, endDate: string): string => {
  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString('en-US', { 
        month: '2-digit', 
        year: 'numeric' 
      });
    } catch {
      return dateString;
    }
  };
  
  const start = formatDate(startDate);
  const end = formatDate(endDate);
  
  if (!start && !end) return '';
  if (!start) return `Until ${end}`;
  if (!end) return `${start} - Present`;
  
  return `${start} – ${end}`;
}; 