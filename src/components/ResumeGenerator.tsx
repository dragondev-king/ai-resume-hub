import React, { useState, useEffect, useCallback } from 'react';
import { Download, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { generateResume } from '../utils/resumeGenerator';
import { generateDocx } from '../utils/docxGenerator';
import { useUser } from '../contexts/UserContext';

interface Profile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  location?: string;
  linkedin?: string;
  portfolio?: string;
  summary?: string;
  experience: any[];
  education: any[];
  skills: string[];
}

const ResumeGenerator: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobDescriptionLink, setJobDescriptionLink] = useState('');
  const [jobTitle, setJobTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [generatedResume, setGeneratedResume] = useState<any>(null);
  const { user, role } = useUser();

  const loadProfiles = useCallback(async (userId: string) => {
    try {
      let query = supabase.from('profiles').select('*');

      // If user is a bidder, only show assigned profiles
      if (role === 'bidder') {
        query = supabase
          .from('profiles')
          .select(`
            *,
            profile_assignments!inner(bidder_id)
          `)
          .eq('profile_assignments.bidder_id', userId);
      }

      if (role === "manager") {
        query = supabase
          .from('profiles')
          .select('*')
          .eq('user_id', userId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error loading profiles:', error);
        toast.error('Failed to load profiles');
        return;
      }

      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles:', error);
      toast.error('Failed to load profiles');
    }
  }, [role]);

  useEffect(() => {
    if (user) {
      loadProfiles(user?.id);
    }
  }, [loadProfiles, user]);

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
      // Generate AI resume
      const generated = await generateResume(profile, jobDescription);
      setGeneratedResume(generated);

      // Save job application record
      if (user) {
        const { error: saveError } = await supabase.from('job_applications').insert([{
          profile_id: selectedProfile,
          bidder_id: user.id,
          job_title: jobTitle,
          company_name: companyName,
          job_description: jobDescription,
          job_description_link: jobDescriptionLink,
          resume_file_name: `${profile.first_name}_${profile.last_name}_${jobTitle}_resume.docx`,
          generated_summary: generated.summary,
          generated_experience: generated.experience,
          generated_skills: generated.skills,
        }]);

        if (saveError) {
          console.error('Error saving job application:', saveError);
          // Don't throw error, resume was generated successfully
        }
      }

      toast.success('Resume generated successfully!');
    } catch (error: any) {
      console.error('Error generating resume:', error);
      toast.error(error.message || 'Failed to generate resume');
    } finally {
      setLoading(false);
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
      const fileName = `${profile.first_name}_${profile.last_name}_${jobTitle}_resume.docx`;
      await generateDocx(generatedResume, fileName);
      toast.success('Resume downloaded successfully!');
    } catch (error: any) {
      console.error('Error downloading resume:', error);
      toast.error(error.message || 'Failed to download resume');
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Sparkles className="w-8 h-8 text-primary-600" />
          <div>
            <h2 className="text-2xl font-bold text-gray-900">AI Resume Generator</h2>
            <p className="text-gray-600">Generate tailored resumes using AI based on job descriptions</p>
          </div>
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
                  {profile.first_name} {profile.last_name} - {profile.email}
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
          </div>

          {/* Job Information */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Job Title
              </label>
              <input
                type="text"
                value={jobTitle}
                onChange={(e) => setJobTitle(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Software Engineer"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Tech Corp"
              />
            </div>
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
              placeholder="Paste the job description here. The AI will use this to tailor the resume..."
            />
          </div>

          {/* Generate Button */}
          <div className="flex justify-center">
            <button
              onClick={handleGenerate}
              disabled={loading || !selectedProfile || !jobDescription}
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
          </div>
        </div>
      </div>

      {/* Generated Resume */}
      {generatedResume && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-gray-900">Generated Resume</h3>
            <button
              onClick={handleDownload}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-green-600 border border-transparent rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2"
            >
              <Download className="w-4 h-4" />
              <span>Download DOCX</span>
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <h4 className="font-medium text-gray-900 mb-2">Generated Summary</h4>
              <p className="text-gray-700 bg-gray-50 p-3 rounded-md">
                {generatedResume.summary}
              </p>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Generated Skills</h4>
              <div className="flex flex-wrap gap-2">
                {generatedResume.skills.map((skill: string, index: number) => (
                  <span
                    key={index}
                    className="px-3 py-1 bg-primary-100 text-primary-800 text-sm font-medium rounded-full"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>

            <div>
              <h4 className="font-medium text-gray-900 mb-2">Generated Experience</h4>
              <div className="space-y-3">
                {generatedResume.experience.map((exp: any, index: number) => (
                  <div key={index} className="bg-gray-50 p-3 rounded-md">
                    <div className="font-medium text-gray-900">{exp.position} at {exp.company}</div>
                    <div className="text-sm text-gray-600">{exp.start_date} - {exp.end_date}</div>
                    <p className="text-gray-700 mt-2">{exp.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ResumeGenerator; 