export interface ResumeData {
  personalInfo: {
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    location: string;
    linkedin?: string;
    portfolio?: string;
  };
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
  jobDescription: string;
  generatedContent?: {
    summary: string;
    experience: Experience[];
    skills: string[];
  };
}

export interface Experience {
  company: string;
  position: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
  achievements: string[];
}

export interface Education {
  institution: string;
  degree: string;
  field: string;
  startDate: string;
  endDate: string;
  current: boolean;
  gpa?: string;
} 