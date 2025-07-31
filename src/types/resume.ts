export interface ResumeData {
  first_name: string;
  last_name: string;
  title?: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  portfolio?: string;
  summary?: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
}

export interface Experience {
  company: string;
  position: string;
  start_date: string;
  end_date: string;
  description: string;
}

export interface Education {
  school: string;
  degree: string;
  field: string;
  start_date: string;
  end_date: string;
} 