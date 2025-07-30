import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { Profile, Experience, Education } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';

interface ProfileFormData {
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  portfolio?: string;
  summary?: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
}

interface ProfileFormProps {
  profile?: Profile;
  onSave?: () => void;
}

const ProfileForm: React.FC<ProfileFormProps> = ({ profile, onSave }) => {
  const { user } = useUser();
  const [isSaving, setIsSaving] = useState(false);
  const [skillFields, setSkillFields] = useState(
    profile?.skills.length ? profile.skills.map((skill, index) => ({ id: index, value: skill })) : [{ id: 0, value: '' }]
  );

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<ProfileFormData>({
    defaultValues: {
      first_name: profile?.first_name || '',
      last_name: profile?.last_name || '',
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
          current: false,
          description: '',
          achievements: [''],
        },
      ],
      education: profile?.education?.length ? profile.education : [
        {
          institution: '',
          degree: '',
          field: '',
          start_date: '',
          end_date: '',
          current: false,
          gpa: '',
        },
      ],
      skills: profile?.skills || [''],
    },
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
    
    if (user.role === "bidder") {
      toast.error('Bidders cannot create or edit profiles');
      return;
    }
    
    setIsSaving(true);
    try {
      const skills = skillFields.map(field => field.value).filter(skill => skill.trim());
      const profileData = {
        ...data,
        skills,
        user_id: user.id,
        updated_at: new Date().toISOString(),
      };

      if (profile) {
        // Update existing profile
        const { error } = await supabase
          .from('profiles')
          .update(profileData)
          .eq('id', profile.id);
        
        if (error) throw error;
      } else {
        // Create new profile
        const { error } = await supabase
          .from('profiles')
          .insert([profileData]);
        
        if (error) throw error;
      }

      onSave?.();
    } catch (error: any) {
      console.error('Error saving profile:', error);
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
              current: false,
              description: '',
              achievements: [''],
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                <input
                  type="month"
                  {...register(`experience.${index}.start_date`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="month"
                  {...register(`experience.${index}.end_date`)}
                  disabled={watch(`experience.${index}.current`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register(`experience.${index}.current`)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 text-sm text-gray-700">Current Position</label>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
              <textarea
                {...register(`experience.${index}.description`)}
                rows={3}
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
              institution: '',
              degree: '',
              field: '',
              start_date: '',
              end_date: '',
              current: false,
              gpa: '',
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
                <label className="block text-sm font-medium text-gray-700 mb-1">Institution</label>
                <input
                  type="text"
                  {...register(`education.${index}.institution`)}
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
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                  type="month"
                  {...register(`education.${index}.start_date`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="month"
                  {...register(`education.${index}.end_date`)}
                  disabled={watch(`education.${index}.current`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent disabled:bg-gray-100"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <input
                  type="checkbox"
                  {...register(`education.${index}.current`)}
                  className="h-4 w-4 text-primary-600 focus:ring-primary-500 border-gray-300 rounded"
                />
                <label className="ml-2 text-sm text-gray-700">Currently Studying</label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">GPA (optional)</label>
                <input
                  type="text"
                  {...register(`education.${index}.gpa`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="3.8/4.0"
                />
              </div>
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