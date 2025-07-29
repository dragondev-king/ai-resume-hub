import React, { useState, useEffect } from 'react';
import { Sparkles, Loader2, FileText, Link } from 'lucide-react';
import { Profile, JobApplication } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { generateResume } from '../utils/resumeGenerator';
import { ResumeData } from '../types/resume';
import ResumePreview from './ResumePreview';

const ResumeGenerator: React.FC = () => {
  const { user, isBidder, isManager, isAdmin } = useAuth();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [jobTitle, setJobTitle] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobDescriptionLink, setJobDescriptionLink] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (user) {
      loadProfiles();
    }
  }, [user]);

  const loadProfiles = async () => {
    try {
      let query = supabase.from('profiles').select('*');
      
      if (isBidder) {
        // Bidders can only see profiles assigned to them
        const { data: assignments } = await supabase
          .from('profile_assignments')
          .select('profile_id')
          .eq('bidder_id', user?.id);
        
        const profileIds = assignments?.map(a => a.profile_id) || [];
        query = query.in('id', profileIds);
      } else if (isManager) {
        // Managers can see their own profiles
        query = query.eq('user_id', user?.id);
      }
      // Admins can see all profiles (no additional filter needed)

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateResume = async () => {
    if (!selectedProfile || !jobDescription.trim() || !jobTitle.trim()) {
      return;
    }

    const profile = profiles.find(p => p.id === selectedProfile);
    if (!profile) return;

    setIsGenerating(true);
    try {
      // Convert profile data to ResumeData format
      const resumeData: ResumeData = {
        personalInfo: {
          firstName: profile.first_name,
          lastName: profile.last_name,
          email: profile.email,
          phone: profile.phone,
          location: profile.location,
          linkedin: profile.linkedin,
          portfolio: profile.portfolio,
        },
        summary: profile.summary || '',
        experience: profile.experience.map(exp => ({
          company: exp.company,
          position: exp.position,
          startDate: exp.start_date,
          endDate: exp.end_date,
          current: exp.current,
          description: exp.description,
          achievements: exp.achievements,
        })),
        education: profile.education.map(edu => ({
          institution: edu.institution,
          degree: edu.degree,
          field: edu.field,
          startDate: edu.start_date,
          endDate: edu.end_date,
          current: edu.current,
          gpa: edu.gpa,
        })),
        skills: profile.skills,
        jobDescription,
      };

      const generatedResume = await generateResume(resumeData);
      setResumeData(generatedResume);

      // Save job application to database
      const jobApplication: Partial<JobApplication> = {
        profile_id: selectedProfile,
        bidder_id: user?.id!,
        job_title: jobTitle,
        company_name: companyName || undefined,
        job_description: jobDescription,
        job_description_link: jobDescriptionLink || undefined,
        resume_file_name: `${profile.first_name}_${profile.last_name}_${jobTitle}_Resume.docx`,
        generated_summary: generatedResume.generatedContent?.summary,
        generated_experience: generatedResume.generatedContent?.experience?.map(exp => ({
          ...exp,
          start_date: exp.startDate,
          end_date: exp.endDate,
        })),
        generated_skills: generatedResume.generatedContent?.skills,
      };

      const { error: saveError } = await supabase
        .from('job_applications')
        .insert([jobApplication]);

      if (saveError) {
        console.error('Error saving job application:', saveError);
      }
    } catch (error) {
      console.error('Error generating resume:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary-600" />
      </div>
    );
  }

  if (profiles.length === 0) {
    return (
      <div className="text-center py-12">
        <FileText className="w-16 h-16 mx-auto text-gray-400 mb-4" />
        <h3 className="text-lg font-medium text-gray-900 mb-2">No Profiles Available</h3>
        <p className="text-gray-600 mb-4">
          {isBidder 
            ? "You don't have any profiles assigned to you yet. Contact your manager to get access to profiles."
            : "You need to create a profile first before generating a resume."
          }
        </p>
        {!isBidder && (
          <button
            onClick={() => window.location.href = '/profiles'}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
          >
            Create Profile
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile Selection */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Select Profile</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Choose a profile to generate resume from
          </label>
          <select
            value={selectedProfile}
            onChange={(e) => setSelectedProfile(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          >
            <option value="">Select a profile...</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.first_name} {profile.last_name} - {profile.email}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Job Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Job Information</h3>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Job Title *
            </label>
            <input
              type="text"
              value={jobTitle}
              onChange={(e) => setJobTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="e.g., Senior Software Engineer"
              required
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
              placeholder="e.g., Google Inc."
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Job Description Link
          </label>
          <div className="relative">
            <Link className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="url"
              value={jobDescriptionLink}
              onChange={(e) => setJobDescriptionLink(e.target.value)}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="https://example.com/job-posting"
            />
          </div>
        </div>
      </div>

      {/* Job Description */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Job Description</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Paste the job description here *
          </label>
          <textarea
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
            rows={8}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Paste the job description here. The AI will use this to tailor your resume..."
            required
          />
        </div>
      </div>

      {/* Generate Button */}
      <div className="pt-4">
        <button
          onClick={handleGenerateResume}
          disabled={!selectedProfile || !jobDescription.trim() || !jobTitle.trim() || isGenerating}
          className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
              Generating Resume...
            </>
          ) : (
            <>
              <Sparkles className="w-5 h-5 mr-2" />
              Generate AI Resume
            </>
          )}
        </button>
      </div>

      {/* Resume Preview */}
      {resumeData && (
        <div className="mt-8">
          <ResumePreview resumeData={resumeData} />
        </div>
      )}
    </div>
  );
};

export default ResumeGenerator; 