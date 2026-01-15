import React, { useState, useEffect } from 'react';
import { Download, Loader2, Sparkles, Edit, Save, X, FileText, MessageSquare, Plus, Trash2, RefreshCw, Copy, Check } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { generateResume } from '../utils/resumeGenerator';
import { generateDocx } from '../utils/docxGenerator';
import { generateCoverLetter, generateAnswer } from '../utils/coverLetterGenerator';
import { useUser } from '../contexts/UserContext';
import { useProfiles } from '../contexts/ProfilesContext';
import { formatDate } from '../utils/helpers';

interface EditableResume {
  summary: string;
  skills: string[];
  experience: any[];
  jobTitle?: string;
  companyName?: string;
}

interface GeneratedCoverLetter {
  content: string;
  jobTitle?: string;
  companyName?: string;
}

interface ApplicationQuestion {
  id: string;
  question: string;
  answer?: string;
}

const ResumeGenerator: React.FC = () => {
  const { profiles, loading: profilesLoading } = useProfiles();
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobDescriptionLink, setJobDescriptionLink] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedResume, setGeneratedResume] = useState<EditableResume | null>(null);
  const [editingResume, setEditingResume] = useState<EditableResume | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [newSkill, setNewSkill] = useState('');

  // Cover Letter State
  const [generatedCoverLetter, setGeneratedCoverLetter] = useState<GeneratedCoverLetter | null>(null);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);

  // Application Questions State
  const [applicationQuestions, setApplicationQuestions] = useState<ApplicationQuestion[]>([]);
  const [newQuestion, setNewQuestion] = useState('');
  const [isGeneratingAnswer, setIsGeneratingAnswer] = useState<string | null>(null);

  // Application Eligibility State
  const [isApplicationEligible, setIsApplicationEligible] = useState(true);

  // Copy State
  const [copiedCoverLetter, setCopiedCoverLetter] = useState(false);
  const [copiedAnswers, setCopiedAnswers] = useState<{ [key: string]: boolean }>({});

  const { user, role } = useUser();

  // Auto-select profile if there's only one
  useEffect(() => {
    if (profiles.length === 1 && !selectedProfile) {
      setSelectedProfile(profiles[0].id);
    }
  }, [profiles, selectedProfile]);

  // Helper function to generate filename based on profile settings
  const generateFileName = (profile: any, jobTitle?: string, companyName?: string): string => {
    const format = profile.resume_filename_format || 'first_last';

    if (format === 'first_last_job_company' && jobTitle && companyName) {
      return `${profile.first_name}_${profile.last_name}_${jobTitle}-${companyName}.docx`;
    }

    return `${profile.first_name}_${profile.last_name}.docx`;
  };

  const handleGenerate = async () => {
    if (!selectedProfile || !jobDescription) {
      toast.error('Please select a profile and enter a job description');
      return;
    }

    const profile = profiles.find(p => p.id === selectedProfile);
    if (!profile) {
      toast.error('Selected profile not found');
      return;
    }

    setLoading(true);
    try {
      // Generate AI resume with job title and company name extraction
      const generated = await generateResume(profile, jobDescription);

      // Check if this profile can apply to this company before showing the resume
      // Only check if the profile has duplicate checking enabled (defaults to true)
      if (generated.companyName && Boolean(profile.check_duplicate_applications) !== false) {
        const { data: canApply, error: checkError } = await supabase.rpc('can_apply_to_company', {
          p_profile_id: selectedProfile,
          p_company_name: generated.companyName
        });

        if (checkError) {
          console.error('Error checking application eligibility:', checkError);
          toast.error('Error checking application eligibility');
          setLoading(false);
          return;
        }

        if (!canApply) {
          setIsApplicationEligible(false);
          toast.error(`This profile already has an active application to ${generated.companyName}. You cannot submit multiple applications to the same company.`);
          setLoading(false);
          return;
        }
        setIsApplicationEligible(true);
      } else {
        // If duplicate checking is disabled, always allow
        setIsApplicationEligible(true);
      }

      setGeneratedResume(generated);
      setEditingResume(generated);
      setIsEditing(false);
      setTimeout(() => {
        document.getElementById('generated-resume')?.scrollIntoView({ behavior: 'smooth' });
      }, 300);
      toast.success('Resume generated successfully! You can now edit the content before downloading.');
    } catch (error: any) {
      console.error('Error generating resume:', error);
      toast.error(error.message || 'Failed to generate resume');
    } finally {
      setLoading(false);
    }
  };

  const handleStartEditing = () => {
    if (generatedResume) {
      setEditingResume({ ...generatedResume });
      setIsEditing(true);
    }
  };

  const handleSaveEdits = () => {
    if (editingResume) {
      setGeneratedResume(editingResume);
      setIsEditing(false);
      toast.success('Changes saved successfully!');
    }
  };

  const handleCancelEdits = () => {
    if (generatedResume) {
      setEditingResume({ ...generatedResume });
      setIsEditing(false);
    }
  };

  const handleAddSkill = () => {
    if (newSkill.trim() && editingResume) {
      setEditingResume({
        ...editingResume,
        skills: [...editingResume.skills, newSkill.trim()]
      });
      setNewSkill('');
    }
  };

  const handleRemoveSkill = (index: number) => {
    if (editingResume) {
      setEditingResume({
        ...editingResume,
        skills: editingResume.skills.filter((_, i) => i !== index)
      });
    }
  };

  const handleUpdateExperience = (index: number, field: string, value: string) => {
    if (editingResume) {
      const updatedExperience = [...editingResume.experience];
      updatedExperience[index] = { ...updatedExperience[index], [field]: value };
      setEditingResume({
        ...editingResume,
        experience: updatedExperience
      });
    }
  };

  const handleUpdateExperienceDescription = (expIndex: number, descIndex: number, value: string) => {
    if (editingResume) {
      const updatedExperience = [...editingResume.experience];
      const descriptions = [...(updatedExperience[expIndex].descriptions || [])];
      descriptions[descIndex] = value;
      updatedExperience[expIndex] = { ...updatedExperience[expIndex], descriptions };
      setEditingResume({
        ...editingResume,
        experience: updatedExperience
      });
    }
  };

  const handleAddExperienceDescription = (expIndex: number) => {
    if (editingResume) {
      const updatedExperience = [...editingResume.experience];
      const descriptions = [...(updatedExperience[expIndex].descriptions || []), ''];
      updatedExperience[expIndex] = { ...updatedExperience[expIndex], descriptions };
      setEditingResume({
        ...editingResume,
        experience: updatedExperience
      });
    }
  };

  const handleRemoveExperienceDescription = (expIndex: number, descIndex: number) => {
    if (editingResume) {
      const updatedExperience = [...editingResume.experience];
      const descriptions = updatedExperience[expIndex].descriptions?.filter((_: string, i: number) => i !== descIndex) || [];
      updatedExperience[expIndex] = { ...updatedExperience[expIndex], descriptions };
      setEditingResume({
        ...editingResume,
        experience: updatedExperience
      });
    }
  };

  const handleDownload = async () => {
    if (!generatedResume) {
      toast.error('No resume to download');
      return;
    }

    const profile = profiles.find(p => p.id === selectedProfile);
    if (!profile) {
      toast.error('Profile not found');
      return;
    }

    try {
      // Save job application record
      if (user) {
        const { error: saveError } = await supabase.rpc('create_job_application', {
          p_profile_id: selectedProfile,
          p_bidder_id: user.id,
          p_job_title: generatedResume.jobTitle || 'Not specified',
          p_job_description: jobDescription,
          p_company_name: generatedResume.companyName || 'Not specified',
          p_job_description_link: jobDescriptionLink,
          p_resume_file_name: generateFileName(profile, generatedResume.jobTitle, generatedResume.companyName),
          p_generated_summary: generatedResume.summary,
          p_generated_experience: generatedResume.experience,
          p_generated_skills: generatedResume.skills,
        });

        if (saveError) {
          console.error('Error saving job application:', saveError);
          toast.error('Error saving job application');
          return;
        }
      }

      const fileName = generateFileName(profile, generatedResume.jobTitle, generatedResume.companyName);
      await generateDocx(generatedResume, fileName, profile);
      toast.success('Resume downloaded and job application saved!');
    } catch (error: any) {
      console.error('Error downloading resume:', error);
      toast.error(error.message || 'Failed to download resume');
    }
  };

  const handleDownloadOnly = async () => {
    if (!generatedResume) {
      toast.error('No resume to download');
      return;
    }

    const profile = profiles.find(p => p.id === selectedProfile);
    if (!profile) {
      toast.error('Profile not found');
      return;
    }

    try {
      const fileName = generateFileName(profile, generatedResume.jobTitle, generatedResume.companyName);
      await generateDocx(generatedResume, fileName, profile);
      toast.success('Resume downloaded successfully!');
    } catch (error: any) {
      console.error('Error downloading resume:', error);
      toast.error(error.message || 'Failed to download resume');
    }
  };

  // Cover Letter Generation
  const handleGenerateCoverLetter = async () => {
    if (!generatedResume || !selectedProfile) {
      toast.error('Please generate a resume first');
      return;
    }

    const profile = profiles.find(p => p.id === selectedProfile);
    if (!profile) {
      toast.error('Profile not found');
      return;
    }

    setIsGeneratingCoverLetter(true);
    try {
      const coverLetter = await generateCoverLetter(profile, jobDescription, generatedResume);
      setGeneratedCoverLetter(coverLetter);
      toast.success('Cover letter generated successfully!');
    } catch (error: any) {
      console.error('Error generating cover letter:', error);
      toast.error(error.message || 'Failed to generate cover letter');
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  // Application Questions Management
  const handleAddQuestion = () => {
    if (newQuestion.trim()) {
      const question: ApplicationQuestion = {
        id: Date.now().toString(),
        question: newQuestion.trim()
      };
      setApplicationQuestions([...applicationQuestions, question]);
      setNewQuestion('');
    }
  };

  const handleRemoveQuestion = (id: string) => {
    setApplicationQuestions(applicationQuestions.filter(q => q.id !== id));
  };

  const handleGenerateAnswer = async (questionId: string) => {
    if (!generatedResume || !selectedProfile) {
      toast.error('Please generate a resume first');
      return;
    }

    const profile = profiles.find(p => p.id === selectedProfile);
    if (!profile) {
      toast.error('Profile not found');
      return;
    }

    const question = applicationQuestions.find(q => q.id === questionId);
    if (!question) return;

    setIsGeneratingAnswer(questionId);
    try {
      const answer = await generateAnswer(profile, question.question, jobDescription, generatedResume);

      setApplicationQuestions(prev =>
        prev.map(q =>
          q.id === questionId
            ? { ...q, answer: answer.content }
            : q
        )
      );

      toast.success('Answer generated successfully!');
    } catch (error: any) {
      console.error('Error generating answer:', error);
      toast.error(error.message || 'Failed to generate answer');
    } finally {
      setIsGeneratingAnswer(null);
    }
  };

  // Copy Functions
  const handleCopyCoverLetter = async () => {
    if (!generatedCoverLetter?.content) {
      toast.error('No cover letter to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(generatedCoverLetter.content);
      setCopiedCoverLetter(true);
      toast.success('Cover letter copied to clipboard!');

      // Reset the copied state after 2 seconds
      setTimeout(() => setCopiedCoverLetter(false), 2000);
    } catch (error) {
      console.error('Failed to copy cover letter:', error);
      toast.error('Failed to copy cover letter');
    }
  };

  // Download Cover Letter Function
  const handleDownloadCoverLetter = () => {
    if (!generatedCoverLetter?.content) {
      toast.error('No cover letter to download');
      return;
    }

    try {
      // Create filename with profile name, job title, and company
      const fileName = `CoverLetter_${generatedCoverLetter.jobTitle || 'Job'}_${generatedCoverLetter.companyName || 'Company'}.txt`;

      // Create blob with cover letter content
      const blob = new Blob([generatedCoverLetter.content], { type: 'text/plain' });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;

      // Trigger download
      document.body.appendChild(link);
      link.click();

      // Cleanup
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);

      toast.success('Cover letter downloaded successfully!');
    } catch (error) {
      console.error('Failed to download cover letter:', error);
      toast.error('Failed to download cover letter');
    }
  };

  const handleCopyAnswer = async (questionId: string) => {
    const question = applicationQuestions.find(q => q.id === questionId);
    if (!question?.answer) {
      toast.error('No answer to copy');
      return;
    }

    try {
      await navigator.clipboard.writeText(question.answer);
      setCopiedAnswers(prev => ({ ...prev, [questionId]: true }));
      toast.success('Answer copied to clipboard!');

      // Reset the copied state after 2 seconds
      setTimeout(() => {
        setCopiedAnswers(prev => ({ ...prev, [questionId]: false }));
      }, 2000);
    } catch (error) {
      console.error('Failed to copy answer:', error);
      toast.error('Failed to copy answer');
    }
  };

  // Reset Function
  const handleReset = () => {
    setJobDescription('');
    setJobDescriptionLink('');
    setGeneratedResume(null);
    setEditingResume(null);
    setIsEditing(false);
    setNewSkill('');
    setGeneratedCoverLetter(null);
    setApplicationQuestions([]);
    setNewQuestion('');
    setIsApplicationEligible(true);
    setCopiedCoverLetter(false);
    setCopiedAnswers({});
    toast.success('Form reset successfully! You can now generate a new resume.');
  };

  const currentResume = isEditing ? editingResume : generatedResume;

  if (profilesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-3">
            <Sparkles className="w-8 h-8 text-primary-600" />
            <div>
              <h2 className="text-2xl font-bold text-gray-900">AI Resume Generator</h2>
              <p className="text-gray-600">Generate tailored resumes using AI. Simply paste a job description and the AI will extract job details and create a customized resume.</p>
            </div>
          </div>
          {(generatedResume || jobDescription || jobDescriptionLink || applicationQuestions.length > 0) && (
            <button
              onClick={handleReset}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
              title="Reset form to start fresh"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Reset</span>
            </button>
          )}
        </div>
      </div>

      {/* Form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="space-y-6">
          {/* Profile Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Select Profile *
            </label>
            <select
              value={selectedProfile}
              onChange={(e) => setSelectedProfile(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">Choose a profile...</option>
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.first_name} {profile.last_name} {profile.title ? `(${profile.title})` : ''} - {profile.email}
                </option>
              ))}
            </select>
            {profiles.length === 0 && (
              <p className="text-sm text-gray-500 mt-2">
                {role === 'bidder'
                  ? 'No profiles have been assigned to you yet. Contact your manager.'
                  : 'No profiles available. Create a profile first.'
                }
              </p>
            )}
            {profiles.length === 1 && selectedProfile && (
              <p className="text-sm text-green-600 mt-2">
                ✓ Profile automatically selected
              </p>
            )}
          </div>



          {/* Job Description Link */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job Description Link (Optional)
            </label>
            <input
              type="url"
              value={jobDescriptionLink}
              onChange={(e) => setJobDescriptionLink(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="https://example.com/job-posting"
            />
          </div>

          {/* Job Description */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job Description *
            </label>
            <textarea
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
              rows={8}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Paste the job description here. The AI will extract the job title and company name, then tailor the resume accordingly..."
            />
          </div>

          {/* Generate and Reset Buttons */}
          <div className="flex justify-center space-x-4">
            <button
              onClick={handleGenerate}
              disabled={loading || !selectedProfile || !jobDescription || !isApplicationEligible}
              className="flex items-center space-x-2 px-8 py-3 text-lg font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  <span>Generate AI Resume</span>
                </>
              )}
            </button>
            {(generatedResume || jobDescription || jobDescriptionLink || applicationQuestions.length > 0) && (
              <button
                onClick={handleReset}
                disabled={loading}
                className="flex items-center space-x-2 px-6 py-3 text-lg font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Clear form and start over"
              >
                <RefreshCw className="w-5 h-5" />
                <span>Reset</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Generated Resume */}
      {currentResume && isApplicationEligible && (
        <div id="generated-resume" className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Generated Resume</h3>
            <div className="flex items-center space-x-2">
              {!isEditing ? (
                <button
                  onClick={handleStartEditing}
                  className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                >
                  <Edit className="w-4 h-4" />
                  <span>Edit Content</span>
                </button>
              ) : (
                <>
                  <button
                    onClick={handleSaveEdits}
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                  >
                    <Save className="w-4 h-4" />
                    <span>Save Changes</span>
                  </button>
                  <button
                    onClick={handleCancelEdits}
                    className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-md hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
                  >
                    <X className="w-4 h-4" />
                    <span>Cancel</span>
                  </button>
                </>
              )}
              <button
                onClick={handleDownload}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
              >
                <Download className="w-4 h-4" />
                <span>Download & Save</span>
              </button>
              <button
                onClick={handleDownloadOnly}
                className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2"
              >
                <Download className="w-4 h-4" />
                <span>Download Only</span>
              </button>
            </div>
          </div>

          {/* Extracted Job Information */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <h4 className="font-medium text-blue-900 mb-2">Extracted Job Information</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-blue-700 mb-1">Job Title</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editingResume?.jobTitle || ''}
                    onChange={(e) => setEditingResume(prev => prev ? { ...prev, jobTitle: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Job title extracted from description"
                  />
                ) : (
                  <p className="text-blue-900 bg-white p-2 rounded border">
                    {currentResume?.jobTitle || 'Not specified'}
                  </p>
                )}
              </div>
              <div>
                <label className="block text-sm font-medium text-blue-700 mb-1">Company Name</label>
                {isEditing ? (
                  <input
                    type="text"
                    value={editingResume?.companyName || ''}
                    onChange={(e) => setEditingResume(prev => prev ? { ...prev, companyName: e.target.value } : null)}
                    className="w-full px-3 py-2 border border-blue-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Company name extracted from description"
                  />
                ) : (
                  <p className="text-blue-900 bg-white p-2 rounded border">
                    {currentResume?.companyName || 'Not specified'}
                  </p>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-6">
            {/* Summary Section */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Professional Summary</h4>
              {isEditing ? (
                <textarea
                  value={editingResume?.summary || ''}
                  onChange={(e) => setEditingResume(prev => prev ? { ...prev, summary: e.target.value } : null)}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              ) : (
                <p className="text-gray-700 bg-gray-50 p-3 rounded-md">
                  {currentResume.summary}
                </p>
              )}
            </div>

            {/* Skills Section */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Skills</h4>
              {isEditing ? (
                <div className="space-y-3">
                  <div className="flex space-x-2">
                    <input
                      type="text"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSkill())}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Add a skill"
                    />
                    <button
                      onClick={handleAddSkill}
                      className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                    >
                      Add
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {editingResume?.skills.map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800"
                      >
                        {skill}
                        <button
                          onClick={() => handleRemoveSkill(index)}
                          className="ml-2 text-primary-600 hover:text-primary-800"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {currentResume.skills.map((skill, index) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-primary-100 text-primary-800 text-sm font-medium rounded-full"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {/* Experience Section */}
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Experience</h4>
              <div className="space-y-3">
                {currentResume.experience.map((exp, index) => (
                  <div key={index} className="bg-gray-50 p-3 rounded-md">
                    {isEditing ? (
                      <div className="space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={exp.position || ''}
                            onChange={(e) => handleUpdateExperience(index, 'position', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Position"
                          />
                          <input
                            type="text"
                            value={exp.company || ''}
                            onChange={(e) => handleUpdateExperience(index, 'company', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Company"
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            type="text"
                            value={exp.start_date || ''}
                            onChange={(e) => handleUpdateExperience(index, 'start_date', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Start Date"
                          />
                          <input
                            type="text"
                            value={exp.end_date || ''}
                            onChange={(e) => handleUpdateExperience(index, 'end_date', e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="End Date"
                          />
                        </div>
                        <div>
                          <input
                            type="text"
                            value={exp.address || ''}
                            onChange={(e) => handleUpdateExperience(index, 'address', e.target.value)}
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm"
                            placeholder="Company Address (optional)"
                          />
                        </div>

                        {/* Bullet Points */}
                        <div className="space-y-2">
                          <div className="flex items-center justify-between">
                            <label className="text-sm font-medium text-gray-700">Bullet Points:</label>
                            <button
                              type="button"
                              onClick={() => handleAddExperienceDescription(index)}
                              className="text-sm text-primary-600 hover:text-primary-700"
                            >
                              + Add Bullet Point
                            </button>
                          </div>
                          {(exp.descriptions || []).map((desc: string, descIndex: number) => (
                            <div key={descIndex} className="flex items-center space-x-2">
                              <span className="text-primary-600 text-sm">•</span>
                              <input
                                type="text"
                                value={desc}
                                onChange={(e) => handleUpdateExperienceDescription(index, descIndex, e.target.value)}
                                className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                                placeholder="Enter bullet point description..."
                              />
                              <button
                                type="button"
                                onClick={() => handleRemoveExperienceDescription(index, descIndex)}
                                className="text-red-600 hover:text-red-700"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="font-medium text-gray-900">{exp.position} at {exp.company}</div>
                        <div className="text-sm text-gray-600">{formatDate(exp.start_date)} - {exp.end_date ? formatDate(exp.end_date) : 'Present'}</div>
                        {exp.address && (
                          <div className="text-sm text-gray-500">{exp.address}</div>
                        )}
                        <div className="text-gray-700 mt-2 space-y-1">
                          {(exp.descriptions || []).map((desc: string, descIndex: number) => (
                            <div key={descIndex} className="flex items-start">
                              <span className="text-primary-600 mr-2 mt-1">•</span>
                              <span>{desc}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Cover Letter Section */}
      {currentResume && isApplicationEligible && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Cover Letter
            </h3>
          </div>

          {generatedCoverLetter ? (
            <>
              <div className="bg-gray-50 rounded-md p-4">
                <div className="prose max-w-none">
                  <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {generatedCoverLetter.content}
                  </div>
                </div>
              </div>
              <div className="flex justify-end items-center space-x-2 mt-4">
                {generatedCoverLetter && (
                  <>
                    <button
                      onClick={handleDownloadCoverLetter}
                      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>Download .txt</span>
                    </button>
                    <button
                      onClick={handleCopyCoverLetter}
                      className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                    >
                      {copiedCoverLetter ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Copied!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <FileText className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Generate a personalized cover letter based on your resume and the job description.</p>
            </div>
          )}
          <button
            onClick={handleGenerateCoverLetter}
            disabled={isGeneratingCoverLetter}
            className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isGeneratingCoverLetter ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating...</span>
              </>
            ) : (
              <>
                <FileText className="w-4 h-4" />
                <span>{generatedCoverLetter ? 'Regenerate Cover Letter' : 'Generate Cover Letter'}</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Application Questions Section */}
      {currentResume && isApplicationEligible && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <MessageSquare className="w-5 h-5 mr-2" />
              Application Questions
            </h3>
          </div>

          {/* Add Question Form */}
          <div className="mb-6">
            <div className="flex space-x-2">
              <input
                type="text"
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddQuestion())}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Enter a job application question (e.g., 'Why are you interested in this position?')"
              />
              <button
                onClick={handleAddQuestion}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Questions List */}
          {applicationQuestions.length > 0 ? (
            <div className="space-y-4">
              {applicationQuestions.map((question) => (
                <div key={question.id} className="bg-gray-50 rounded-md p-4">
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-medium text-gray-900">{question.question}</h4>
                    <button
                      onClick={() => handleRemoveQuestion(question.id)}
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {question.answer ? (
                    <div className="space-y-3">
                      <div className="bg-white rounded-md p-3 border border-gray-200">
                        <div className="prose prose-sm max-w-none">
                          <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                            {question.answer}
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleCopyAnswer(question.id)}
                          className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-green-600 bg-green-50 border border-green-200 rounded-md hover:bg-green-100 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
                        >
                          {copiedAnswers[question.id] ? (
                            <>
                              <Check className="w-4 h-4" />
                              <span>Copied!</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>
                        <button
                          onClick={() => handleGenerateAnswer(question.id)}
                          disabled={isGeneratingAnswer === question.id}
                          className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 border border-blue-200 rounded-md hover:bg-blue-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGeneratingAnswer === question.id ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Regenerating...</span>
                            </>
                          ) : (
                            <>
                              <RefreshCw className="w-4 h-4" />
                              <span>Regenerate Answer</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => handleGenerateAnswer(question.id)}
                      disabled={isGeneratingAnswer === question.id}
                      className="flex items-center space-x-2 px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 border border-primary-200 rounded-md hover:bg-primary-100 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isGeneratingAnswer === question.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>Generating...</span>
                        </>
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4" />
                          <span>Generate Answer</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Add common job application questions to generate personalized answers.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default ResumeGenerator; 