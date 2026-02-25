import React, { useState } from 'react';
import { useForm, useFieldArray, useWatch } from 'react-hook-form';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Profile } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { getUseAiEnhancedJobTitlePreference, USE_AI_ENHANCED_JOB_TITLE_KEY } from '../utils/docxGenerator';

interface ProfileFormData {
  first_name: string;
  last_name: string;
  title?: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  portfolio?: string;
  summary?: string;
  experience: {
    company: string;
    position: string;
    start_date: string;
    end_date: string;
    description: string;
    address?: string;
  }[];
  education: {
    school: string;
    degree: string;
    field: string;
    start_date: string;
    end_date: string;
  }[];
  skills: string[];
  resume_filename_format: string;
  check_duplicate_applications: boolean;
}

interface ProfileFormProps {
  profile?: Profile;
  onSave?: () => void;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ profile, onSave }) => {
  const { role } = useUser();
  const { user } = useUser();
  const [isSaving, setIsSaving] = useState(false);
  const [useAiEnhancedJobTitle, setUseAiEnhancedJobTitle] = useState(() => getUseAiEnhancedJobTitlePreference());
  const [skillFields, setSkillFields] = useState(
    profile?.skills.length ? profile.skills.map((skill, index) => ({ id: index, value: skill })) : [{ id: 0, value: '' }]
  );

  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<ProfileFormData>({
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
      title: profile?.title || '',
      email: profile?.email || '',
      phone: profile?.phone || '',
      location: profile?.location || '',
      linkedin: profile?.linkedin || '',
      portfolio: profile?.portfolio || '',
      summary: profile?.summary || '',
      experience: profile?.experience?.length ? profile.experience : [
        {
          company: '',
          position: '',
          start_date: '',
          end_date: '',
          description: '',
          address: '',
        },
      ],
      education: profile?.education?.length ? profile.education : [
        {
          school: '',
          degree: '',
          field: '',
          start_date: '',
          end_date: '',
        },
      ],
      skills: profile?.skills || [''],
      resume_filename_format: profile?.resume_filename_format || 'first_last',
      check_duplicate_applications: profile?.check_duplicate_applications !== undefined ? profile.check_duplicate_applications : true,
    },
  });

  const watchedExperience = useWatch({
    control,
    name: 'experience',
  });

  const {
    fields: experienceFields,
    append: appendExperience,
    remove: removeExperience,
  } = useFieldArray({
    control,
    name: 'experience',
  });

  const {
    fields: educationFields,
    append: appendEducation,
    remove: removeEducation,
  } = useFieldArray({
    control,
    name: 'education',
  });

  const onSubmit = async (data: ProfileFormData) => {
    if (!user) return;

    if (role === 'bidder') {
      toast.error('Bidders cannot create or edit profiles');
      return;
    }

    setIsSaving(true);
    try {
      // Sanitize skills by trimming whitespace
      const skills = skillFields.map(field => field.value.trim()).filter(skill => skill);

      // Sanitize and validate experience entries
      const sanitizedExperience = data.experience
        .map(exp => ({
          company: exp.company?.trim() || '',
          position: exp.position?.trim() || '',
          start_date: exp.start_date,
          end_date: exp.end_date,
          description: exp.description?.trim() || '',
          address: exp.address?.trim() || '',
        }))
        .filter(exp => exp.company || exp.position); // Keep entries with at least company or position

      // Validate that we have at least one valid experience entry with a company name
      const hasValidExperience = sanitizedExperience.some(exp => exp.company);
      if (!hasValidExperience) {
        toast.error('Please add at least one work experience with a company name');
        setIsSaving(false);
        return;
      }

      // Sanitize education entries
      const sanitizedEducation = data.education
        .map(edu => ({
          school: edu.school?.trim() || '',
          degree: edu.degree?.trim() || '',
          field: edu.field?.trim() || '',
          start_date: edu.start_date,
          end_date: edu.end_date,
        }))
        .filter(edu => edu.school || edu.degree); // Keep entries with at least school or degree

      // Use upsert_profile RPC function for both create and update
      const { error } = await supabase.rpc('upsert_profile', {
        p_user_id: user.id,
        p_first_name: data.first_name.trim(),
        p_last_name: data.last_name.trim(),
        p_title: data.title?.trim(),
        p_email: data.email.trim(),
        p_phone: data.phone.trim(),
        p_location: data.location.trim(),
        p_profile_id: profile?.id || null,
        p_linkedin: data.linkedin?.trim(),
        p_portfolio: data.portfolio?.trim(),
        p_summary: data.summary?.trim(),
        p_experience: sanitizedExperience,
        p_education: sanitizedEducation,
        p_skills: skills,
        p_resume_filename_format: data.resume_filename_format,
        p_check_duplicate_applications: data.check_duplicate_applications,
      });

      if (error) throw error;
      toast.success(profile ? 'Profile updated successfully!' : 'Profile created successfully!');

      onSave?.();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error(error.message || 'Failed to save profile');
    } finally {
      setIsSaving(false);
    }
  };

  const addSkill = () => {
    setSkillFields([...skillFields, { id: Date.now(), value: '' }]);
  };

  const removeSkill = (index: number) => {
    setSkillFields(skillFields.filter((_, i) => i !== index));
  };

  const updateSkill = (index: number, value: string) => {
    setSkillFields(skillFields.map((field, i) => i === index ? { ...field, value } : field));
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Personal Information */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Personal Information</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              First Name *
            </label>
            <input
              type="text"
              {...register('first_name', { required: 'First name is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="John"
            />
            {errors.first_name && (
              <p className="mt-1 text-sm text-red-600">{errors.first_name.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name *
            </label>
            <input
              type="text"
              {...register('last_name', { required: 'Last name is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Doe"
            />
            {errors.last_name && (
              <p className="mt-1 text-sm text-red-600">{errors.last_name.message}</p>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Professional Title
          </label>
          <input
            type="text"
            {...register('title')}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Full Stack Developer, AI Engineer, etc."
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email *
            </label>
            <input
              type="email"
              {...register('email', {
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address'
                }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="john.doe@example.com"
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-600">{errors.email.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone *
            </label>
            <input
              type="tel"
              {...register('phone', { required: 'Phone is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="+1 (555) 123-4567"
            />
            {errors.phone && (
              <p className="mt-1 text-sm text-red-600">{errors.phone.message}</p>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Location *
          </label>
          <input
            type="text"
            {...register('location', { required: 'Location is required' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="San Francisco, CA"
          />
          {errors.location && (
            <p className="mt-1 text-sm text-red-600">{errors.location.message}</p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LinkedIn (optional)
            </label>
            <input
              type="url"
              {...register('linkedin')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="https://linkedin.com/in/johndoe"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Portfolio (optional)
            </label>
            <input
              type="url"
              {...register('portfolio')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="https://johndoe.dev"
            />
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Professional Summary</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Summary
          </label>
          <textarea
            {...register('summary')}
            rows={4}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Brief overview of your professional background and key strengths..."
          />
        </div>
      </div>

      {/* Experience */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Work Experience</h3>
          <button
            type="button"
            onClick={() => appendExperience({
              company: '',
              position: '',
              start_date: '',
              end_date: '',
              description: '',
              address: '',
            })}
            className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />
            <span>Add Experience</span>
          </button>
        </div>
        {experienceFields.map((field, index) => (
          <div key={field.id} className="border border-gray-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Experience {index + 1}</h4>
              {experienceFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeExperience(index)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                <input
                  type="text"
                  {...register(`experience.${index}.company`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Company Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
                <input
                  type="text"
                  {...register(`experience.${index}.position`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Job Title"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  {...register(`experience.${index}.start_date`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="date"
                  {...register(`experience.${index}.end_date`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company Address</label>
              <input
                type="text"
                {...register(`experience.${index}.address`)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="123 Main St, City, State, ZIP"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <span className={`text-xs ${(watchedExperience?.[index]?.description?.length || 0) >= 350
                  ? 'text-red-500'
                  : (watchedExperience?.[index]?.description?.length || 0) >= 300
                    ? 'text-yellow-500'
                    : 'text-gray-500'
                  }`}>
                  {watchedExperience?.[index]?.description?.length || 0}/350
                </span>
              </div>
              <textarea
                {...register(`experience.${index}.description`)}
                rows={3}
                maxLength={350}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Brief description of your role and responsibilities..."
              />
            </div>
          </div>
        ))}
      </div>

      {/* Education */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Education</h3>
          <button
            type="button"
            onClick={() => appendEducation({
              school: '',
              degree: '',
              field: '',
              start_date: '',
              end_date: '',
            })}
            className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />
            <span>Add Education</span>
          </button>
        </div>
        {educationFields.map((field, index) => (
          <div key={field.id} className="border border-gray-200 rounded-lg p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-gray-900">Education {index + 1}</h4>
              {educationFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeEducation(index)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">School</label>
                <input
                  type="text"
                  {...register(`education.${index}.school`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="University Name"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Degree</label>
                <input
                  type="text"
                  {...register(`education.${index}.degree`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Bachelor's, Master's, etc."
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Field of Study</label>
                <input
                  type="text"
                  {...register(`education.${index}.field`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Computer Science"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="date"
                  {...register(`education.${index}.start_date`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                {...register(`education.${index}.end_date`)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>
        ))}
      </div>

      {/* Skills */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium text-gray-900">Skills</h3>
          <button
            type="button"
            onClick={addSkill}
            className="flex items-center space-x-1 text-sm text-primary-600 hover:text-primary-700"
          >
            <Plus className="w-4 h-4" />
            <span>Add Skill</span>
          </button>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {skillFields.map((field, index) => (
            <div key={field.id} className="flex items-center space-x-2">
              <input
                type="text"
                value={field.value}
                onChange={(e) => updateSkill(index, e.target.value)}
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                placeholder="Skill name"
              />
              {skillFields.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeSkill(index)}
                  className="text-red-600 hover:text-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Resume Filename Format */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Resume Filename Format</h3>
        <div className="space-y-3">
          <label className="flex items-center">
            <input
              type="radio"
              {...register('resume_filename_format')}
              value="first_last"
              className="mr-3"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">
                Simple Format
              </span>
              <p className="text-xs text-gray-500">
                {profile?.first_name || 'John'}_{profile?.last_name || 'Doe'}.docx
              </p>
            </div>
          </label>
          <label className="flex items-center">
            <input
              type="radio"
              {...register('resume_filename_format')}
              value="first_last_job_company"
              className="mr-3"
            />
            <div>
              <span className="text-sm font-medium text-gray-700">
                Extended Format
              </span>
              <p className="text-xs text-gray-500">
                {profile?.first_name || 'John'}_{profile?.last_name || 'Doe'}_jobTitle-companyName.docx
              </p>
            </div>
          </label>
        </div>
        <p className="text-xs text-gray-500">
          Choose how your resume files will be named when downloaded. The extended format includes job title and company name.
        </p>
      </div>

      {/* Application Settings */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Application Settings</h3>
        <div className="flex items-start">
          <div className="flex items-center h-5">
            <input
              type="checkbox"
              {...register('check_duplicate_applications')}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="check_duplicate_applications" className="font-medium text-gray-700">
              Check for duplicate applications to companies
            </label>
            <p className="text-gray-500">
              When enabled, the system will prevent submitting multiple applications to the same company for this profile.
              When disabled, you can submit multiple applications to the same company.
            </p>
          </div>
        </div>
        <div className="flex items-start pt-2">
          <div className="flex items-center h-5">
            <input
              type="checkbox"
              id="use_ai_enhanced_job_title"
              checked={useAiEnhancedJobTitle}
              onChange={(e) => {
                const checked = e.target.checked;
                setUseAiEnhancedJobTitle(checked);
                window.localStorage.setItem(USE_AI_ENHANCED_JOB_TITLE_KEY, checked ? 'true' : 'false');
              }}
              className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
            />
          </div>
          <div className="ml-3 text-sm">
            <label htmlFor="use_ai_enhanced_job_title" className="font-medium text-gray-700">
              Use AI-enhanced job titles in DOCX
            </label>
            <p className="text-gray-500">
              When enabled, generated resumes use AI-tailored job titles per experience when available. When disabled, your original job titles are used everywhere.
            </p>
          </div>
        </div>
      </div>

      {/* Submit Button */}
      <div className="pt-6">
        <button
          type="submit"
          disabled={isSaving}
          className="w-full flex items-center justify-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSaving ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
              Saving Profile...
            </>
          ) : (
            <>
              <Save className="w-5 h-5 mr-2" />
              Save Profile
            </>
          )}
        </button>
      </div>
    </form>
  );
};

export default ProfileForm; 