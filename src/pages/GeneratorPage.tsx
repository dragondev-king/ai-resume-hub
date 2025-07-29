import React from 'react';
import ResumeGenerator from '../components/ResumeGenerator';

const GeneratorPage: React.FC = () => {
  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-2">
          Generate AI Resume
        </h2>
        <p className="text-sm text-gray-600">
          Select a profile and add a job description to generate a tailored resume
        </p>
      </div>
      <ResumeGenerator />
    </div>
  );
};

export default GeneratorPage; 