import React, { useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { FileText, Sparkles, User } from 'lucide-react';
import ResumeForm from './components/ResumeForm';
import ResumePreview from './components/ResumePreview';
import { generateResume } from './utils/resumeGenerator';
import { ResumeData } from './types/resume';

function App() {
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'form' | 'preview'>('form');

  const handleGenerateResume = async (data: ResumeData) => {
    setIsGenerating(true);
    try {
      const generatedResume = await generateResume(data);
      setResumeData(generatedResume);
      setActiveTab('preview');
      toast.success('Resume generated successfully!');
    } catch (error) {
      console.error('Error generating resume:', error);
      toast.error('Failed to generate resume. Please try again.');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">AI Resume Generator</h1>
                <p className="text-sm text-gray-500">Powered by AI</p>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Sparkles className="w-5 h-5 text-primary-600" />
              <span className="text-sm font-medium text-gray-700">AI-Powered</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('form')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'form'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4" />
                  <span>Personal Information</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                disabled={!resumeData}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'preview'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                } ${!resumeData ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>Resume Preview</span>
                </div>
              </button>
            </nav>
          </div>
        </div>

        {/* Content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Section */}
          <div className={`${activeTab === 'form' ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Personal Information
                </h2>
                <p className="text-sm text-gray-600">
                  Fill in your details and job description to generate a tailored resume
                </p>
              </div>
              <ResumeForm onSubmit={handleGenerateResume} isGenerating={isGenerating} />
            </div>
          </div>

          {/* Preview Section */}
          <div className={`${activeTab === 'preview' ? 'block' : 'hidden lg:block'}`}>
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Resume Preview
                </h2>
                <p className="text-sm text-gray-600">
                  Preview your generated resume before downloading
                </p>
              </div>
              {resumeData ? (
                <ResumePreview resumeData={resumeData} />
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Generate a resume to see the preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Mobile Tab Content */}
        {activeTab === 'preview' && (
          <div className="lg:hidden mt-8">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-2">
                  Resume Preview
                </h2>
                <p className="text-sm text-gray-600">
                  Preview your generated resume before downloading
                </p>
              </div>
              {resumeData ? (
                <ResumePreview resumeData={resumeData} />
              ) : (
                <div className="flex items-center justify-center h-64 text-gray-500">
                  <div className="text-center">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                    <p>Generate a resume to see the preview</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
