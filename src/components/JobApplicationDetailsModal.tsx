import React, { useCallback, useState } from 'react';
import { X, Building, User, FileText, Download, Link, ChevronDown, ChevronUp, AlertTriangle, CheckCircle } from 'lucide-react';
import { JobApplicationWithDetails } from '../lib/supabase';
import { useProfiles } from '../contexts/ProfilesContext';
import { useUser } from '../contexts/UserContext';
import { supabase } from '../lib/supabase';
import { generateDocx } from '../utils/docxGenerator';
import { toast } from 'react-hot-toast';
import { formatDate } from '../utils/helpers';

interface JobApplicationDetailsModalProps {
  application: JobApplicationWithDetails | null;
  isOpen: boolean;
  onClose: () => void;
}

const JobApplicationDetailsModal: React.FC<JobApplicationDetailsModalProps> = ({
  application,
  isOpen,
  onClose
}) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [isJobDescriptionExpanded, setIsJobDescriptionExpanded] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const { profiles } = useProfiles();
  const { role } = useUser();

  const applicationProfile = profiles.find(p => p.id === application?.profile_id);

  const handleRegenerateResume = useCallback(async () => {
    if (!application || !applicationProfile) return;

    try {
      setIsGenerating(true);
      const fileName = `${applicationProfile?.first_name}_${applicationProfile?.last_name}_${application.job_title || ''}-${application.company_name || ''}.docx`;

      const generatedResumeData = {
        summary: application.generated_summary || '',
        experience: application.generated_experience || [],
        skills: application.generated_skills || []
      }

      await generateDocx(generatedResumeData, fileName, applicationProfile);

      toast.success('Resume regenerated successfully!');

    } catch (error) {
      console.error('Error regenerating resume:', error);
    } finally {
      setIsGenerating(false);
    }
  }, [application, applicationProfile]);

  const handleRejectApplication = useCallback(async () => {
    if (!application) return;

    if (!window.confirm('Are you sure you want to reject this application? This will allow the bidder to apply to other roles at this company.')) {
      return;
    }

    try {
      setIsRejecting(true);
      const { error } = await supabase.rpc('reject_job_application', {
        p_application_id: application.id
      });

      if (error) {
        console.error('Error rejecting application:', error);
        toast.error('Failed to reject application');
        return;
      }

      toast.success('Application rejected successfully. The bidder can now apply to other roles at this company.');
      onClose(); // Close modal after successful rejection
    } catch (error) {
      console.error('Error rejecting application:', error);
      toast.error('Failed to reject application');
    } finally {
      setIsRejecting(false);
    }
  }, [application, onClose]);

  if (!isOpen || !application) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Job Application Details</h2>
            <p className="text-gray-600">submitted by <b>{application.bidder_first_name} {application.bidder_last_name}</b> on {formatDate(application.created_at, true, true)}</p>
            <div className="flex items-center mt-2">
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${application.status === 'active'
                ? 'bg-green-100 text-green-800'
                : application.status === 'rejected'
                  ? 'bg-red-100 text-red-800'
                  : 'bg-yellow-100 text-yellow-800'
                }`}>
                {application.status === 'active' ? (
                  <>
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Active
                  </>
                ) : application.status === 'rejected' ? (
                  <>
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Rejected
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Withdrawn
                  </>
                )}
              </span>
              {application.status === 'rejected' && application.rejected_at && (
                <span className="text-xs text-gray-500 ml-2">
                  Rejected on {formatDate(application.rejected_at, true)}
                </span>
              )}
              {application.status === 'withdrawn' && application.withdrawn_at && (
                <span className="text-xs text-gray-500 ml-2">
                  Withdrawn on {formatDate(application.withdrawn_at, true)}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-4">
            {/* Reject Button - Only for managers and admins, only for active applications */}
            {(role === 'manager' || role === 'admin') && application.status === 'active' && (
              <button
                onClick={handleRejectApplication}
                disabled={isRejecting}
                className="flex items-center px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isRejecting ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                ) : (
                  <AlertTriangle className="w-4 h-4 mr-2" />
                )}
                {isRejecting ? 'Rejecting...' : 'Reject Application'}
              </button>
            )}
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="overflow-y-auto max-h-[calc(90vh-120px)] p-6">
          <div className="space-y-8">
            {/* Job Information */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Building className="w-5 h-5 mr-2" />
                Job Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Job Title</label>
                  <p className="text-lg font-medium text-gray-900">{application.job_title}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Company</label>
                  <p className="text-lg text-gray-900">{application.company_name || 'Not specified'}</p>
                </div>
                {application.job_description_link && (
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700">Job Description Link</label>
                    <a
                      href={application.job_description_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary-600 hover:text-primary-700 flex items-center"
                    >
                      <Link className="w-4 h-4 mr-1" />
                      View Job Description
                    </a>
                  </div>
                )}
              </div>

              {/* Job Description */}
              {application.job_description && (
                <div className="mt-4">
                  <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                    <button
                      onClick={() => setIsJobDescriptionExpanded(!isJobDescriptionExpanded)}
                      className="flex items-center justify-between w-full text-left p-4 hover:bg-gray-50 transition-colors border-b border-gray-100"
                    >
                      <div className="flex items-center space-x-3">
                        <div className="w-2 h-2 bg-primary-500 rounded-full"></div>
                        <span className="font-semibold text-gray-900">Job Description</span>
                        <span className="text-sm text-gray-500 bg-gray-100 px-2 py-1 rounded-full">
                          {application.job_description.length > 100 ? 'Long' : 'Short'}
                        </span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-sm text-gray-500">
                          {isJobDescriptionExpanded ? 'Hide' : 'Show'} details
                        </span>
                        {isJobDescriptionExpanded ? (
                          <ChevronUp className="w-5 h-5 text-gray-500" />
                        ) : (
                          <ChevronDown className="w-5 h-5 text-gray-500" />
                        )}
                      </div>
                    </button>
                    {isJobDescriptionExpanded && (
                      <div className="p-4 bg-gray-50">
                        <div className="bg-white rounded-md p-4 border border-gray-200 max-h-96 overflow-y-auto">
                          <div className="prose prose-sm max-w-none">
                            <div className="text-gray-700 whitespace-pre-wrap leading-relaxed text-sm">
                              {application.job_description}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-xs text-gray-500">
                          <span>{application.job_description.length} characters</span>
                          <span>{application.job_description.split('\n').length} lines</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Profile Information */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2" />
                Profile Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Profile Name</label>
                  <p className="text-lg text-gray-900">
                    {application.profile_first_name} {application.profile_last_name}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Profile Email</label>
                  <p className="text-lg text-gray-900 flex items-center">
                    {/* <Mail className="w-4 h-4 mr-1" /> */}
                    {application.profile_email}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Profile Title</label>
                  <p className="text-lg text-gray-900 flex items-center">
                    {/* <Mail className="w-4 h-4 mr-1" /> */}
                    {applicationProfile?.title}
                  </p>
                </div>
              </div>
            </div>

            {/* Bidder Information */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <User className="w-5 h-5 mr-2" />
                Bidder Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bidder Name</label>
                  <p className="text-lg text-gray-900">
                    {application.bidder_first_name} {application.bidder_last_name}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700">Bidder Email</label>
                  <p className="text-lg text-gray-900 flex items-center">
                    {/* <Mail className="w-4 h-4 mr-1" /> */}
                    {application.bidder_email}
                  </p>
                </div>
              </div>
            </div>

            {/* AI Generated Summary */}
            {application.generated_summary && (
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  AI Generated Summary
                </h3>
                <div className="prose max-w-none">
                  <p className="text-gray-700 leading-relaxed">{application.generated_summary}</p>
                </div>
              </div>
            )}

            {/* AI Generated Experience */}
            {application.generated_experience && application.generated_experience.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  AI Generated Experience
                </h3>
                <div className="space-y-4">
                  {application.generated_experience.map((exp: any, index: number) => (
                    <div key={index} className="border-l-4 border-primary-500 pl-4">
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-semibold text-gray-900">{exp.position}</h4>
                        <span className="text-sm text-gray-600">
                          {formatDate(exp.start_date)} - {exp.end_date ? formatDate(exp.end_date) : 'Present'}
                        </span>
                      </div>
                      <p className="text-gray-700 font-medium mb-2">{exp.company}</p>
                      {exp.descriptions && exp.descriptions.length > 0 ? (
                        <ul className="list-disc list-inside space-y-1 text-gray-700">
                          {exp.descriptions.map((desc: string, descIndex: number) => (
                            <li key={descIndex}>{desc}</li>
                          ))}
                        </ul>
                      ) : exp.description && (
                        <p className="text-gray-700">{exp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AI Generated Skills */}
            {application.generated_skills && application.generated_skills.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <FileText className="w-5 h-5 mr-2" />
                  AI Generated Skills
                </h3>
                <div className="flex flex-wrap gap-2">
                  {application.generated_skills.map((skill: string, index: number) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-primary-100 text-primary-800 rounded-full text-sm font-medium"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Resume Actions */}
            <div className="bg-gray-50 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <Download className="w-5 h-5 mr-2" />
                Resume Actions
              </h3>
              <div className="flex flex-wrap gap-4">
                <button
                  onClick={handleRegenerateResume}
                  disabled={isGenerating}
                  className="flex items-center px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isGenerating ? (
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  ) : (
                    <Download className="w-4 h-4 mr-2" />
                  )}
                  {isGenerating ? 'Generating...' : 'Regenerate Resume'}
                </button>
                {application.resume_file_name && (
                  <div className="flex items-center text-gray-600">
                    {/* <FileText className="w-4 h-4 mr-2" /> */}
                    <span className="text-sm">Original file: {application.resume_file_name}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default JobApplicationDetailsModal; 