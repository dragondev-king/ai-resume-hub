import React from 'react';
import { Download, Mail, Phone, MapPin, ExternalLink } from 'lucide-react';
import { ResumeData } from '../types/resume';
import { generateDocx } from '../utils/docxGenerator';

interface ResumePreviewProps {
  data: ResumeData;
}

const ResumePreview: React.FC<ResumePreviewProps> = ({ data }) => {
  const handleDownload = async () => {
    try {
      const fileName = `${data.first_name}_${data.last_name}_resume.docx`;
      await generateDocx({
        summary: data.summary || '',
        experience: data.experience,
        skills: data.skills,
      }, fileName);
    } catch (error) {
      console.error('Error generating document:', error);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
  };

  const formatDateRange = (startDate: string, endDate: string) => {
    const start = formatDate(startDate);
    const end = formatDate(endDate);
    return `${start} - ${end}`;
  };

  return (
    <div className="space-y-6">
      {/* Download Button */}
      <div className="flex justify-end">
        <button
          onClick={handleDownload}
          className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          <Download className="w-4 h-4" />
          <span>Download .docx</span>
        </button>
      </div>

      {/* Resume Preview */}
      <div className="bg-white border border-gray-200 rounded-lg p-8 max-w-4xl mx-auto">
        {/* Header */}
        <div className="border-b border-gray-300 pb-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            {data.first_name} {data.last_name}
          </h1>
          <div className="flex flex-wrap gap-4 text-sm text-gray-600">
            <div className="flex items-center space-x-1">
              <Mail className="w-4 h-4" />
              <span>{data.email}</span>
            </div>
            {data.phone && (
              <div className="flex items-center space-x-1">
                <Phone className="w-4 h-4" />
                <span>{data.phone}</span>
              </div>
            )}
            {data.location && (
              <div className="flex items-center space-x-1">
                <MapPin className="w-4 h-4" />
                <span>{data.location}</span>
              </div>
            )}
            {data.linkedin && (
              <div className="flex items-center space-x-1">
                <ExternalLink className="w-4 h-4" />
                <a
                  href={data.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  LinkedIn
                </a>
              </div>
            )}
            {data.portfolio && (
              <div className="flex items-center space-x-1">
                <ExternalLink className="w-4 h-4" />
                <a
                  href={data.portfolio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary-600 hover:text-primary-700"
                >
                  Portfolio
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Summary */}
        {data.summary && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Professional Summary</h2>
            <p className="text-gray-700 leading-relaxed">
              {data.summary}
            </p>
          </div>
        )}

        {/* Experience */}
        {data.experience.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Professional Experience</h2>
            <div className="space-y-4">
              {data.experience.map((exp, index) => (
                <div key={index} className="border-l-4 border-primary-500 pl-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">{exp.position}</h3>
                    <span className="text-sm text-gray-600">
                      {formatDateRange(exp.start_date, exp.end_date)}
                    </span>
                  </div>
                  <p className="text-primary-600 font-medium mb-2">{exp.company}</p>
                  <p className="text-gray-700 text-sm leading-relaxed">{exp.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {data.education.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Education</h2>
            <div className="space-y-4">
              {data.education.map((edu, index) => (
                <div key={index} className="border-l-4 border-gray-300 pl-4">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-semibold text-gray-900">
                      {edu.degree} in {edu.field}
                    </h3>
                    <span className="text-sm text-gray-600">
                      {formatDateRange(edu.start_date, edu.end_date)}
                    </span>
                  </div>
                  <p className="text-primary-600 font-medium mb-1">{edu.school}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {data.skills.length > 0 && (
          <div className="mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-3">Skills</h2>
            <div className="flex flex-wrap gap-2">
              {data.skills.map((skill, index) => (
                <span
                  key={index}
                  className="px-3 py-1 bg-primary-100 text-primary-800 text-sm rounded-full"
                >
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ResumePreview; 