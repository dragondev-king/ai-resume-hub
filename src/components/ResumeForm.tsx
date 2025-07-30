import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, Save, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { supabase } from '../lib/supabase';
import { ResumeData } from '../types/resume';
import ResumePreview from './ResumePreview';
import { useUser } from '../contexts/UserContext';

interface ResumeFormProps {
  onSave?: () => void;
}

const ResumeForm: React.FC<ResumeFormProps> = ({ onSave }) => {
  const [showPreview, setShowPreview] = useState(false);
  const [loading, setLoading] = useState(false);
  const { user } = useUser();

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<ResumeData>({
    defaultValues: {
      first_name: '',
      last_name: '',
      email: '',
      phone: '',
      location: '',
      linkedin: '',
      portfolio: '',
      summary: '',
      experience: [{ company: '', position: '', start_date: '', end_date: '', description: '' }],
      education: [{ school: '', degree: '', field: '', start_date: '', end_date: '' }],
      skills: [],
    },
  });

  const { fields: experienceFields, append: appendExperience, remove: removeExperience } = useFieldArray({
    control,
    name: 'experience',
  });

  const { fields: educationFields, append: appendEducation, remove: removeEducation } = useFieldArray({
    control,
    name: 'education',
  });

  const [skills, setSkills] = useState<string[]>([]);
  const [newSkill, setNewSkill] = useState('');

  const addSkill = () => {
    if (newSkill.trim() && !skills.includes(newSkill.trim())) {
      setSkills([...skills, newSkill.trim()]);
      setNewSkill('');
    }
  };

  const removeSkill = (index: number) => {
    setSkills(skills.filter((_, i) => i !== index));
  };

  const onSubmit = async (data: ResumeData) => {
    if (!user) {
      toast.error('User not found');
      return;
    }

    setLoading(true);
    try {
      const profileData = {
        ...data,
        user_id: user.id,
        skills,
      };

      const { error } = await supabase.from('profiles').insert([profileData]);

      if (error) throw error;

      toast.success('Profile saved successfully!');
      onSave?.();
    } catch (error: any) {
      console.error('Error saving profile:', error);
      toast.error(error.message || 'Failed to save profile');
    } finally {
      setLoading(false);
    }
  };

  const formData = watch();

  return (
    <div className="max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">Create Profile</h2>
          <div className="flex space-x-3">
            <button
              type="button"
              onClick={() => setShowPreview(!showPreview)}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              <Eye className="w-4 h-4" />
              <span>{showPreview ? 'Hide Preview' : 'Show Preview'}</span>
            </button>
            <button
              type="submit"
              form="resume-form"
              disabled={loading}
              className="flex items-center space-x-2 px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              <span>{loading ? 'Saving...' : 'Save Profile'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Form */}
          <div>
            <form id="resume-form" onSubmit={handleSubmit(onSubmit)} className="space-y-6">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Personal Information</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      First Name *
                    </label>
                    <input
                      {...register('first_name', { required: 'First name is required' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="John"
                    />
                    {errors.first_name && (
                      <p className="text-red-600 text-sm mt-1">{errors.first_name.message}</p>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Last Name *
                    </label>
                    <input
                      {...register('last_name', { required: 'Last name is required' })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="Doe"
                    />
                    {errors.last_name && (
                      <p className="text-red-600 text-sm mt-1">{errors.last_name.message}</p>
                    )}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email *
                  </label>
                  <input
                    {...register('email', { 
                      required: 'Email is required',
                      pattern: {
                        value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                        message: 'Invalid email address'
                      }
                    })}
                    type="email"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="john.doe@example.com"
                  />
                  {errors.email && (
                    <p className="text-red-600 text-sm mt-1">{errors.email.message}</p>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Phone
                    </label>
                    <input
                      {...register('phone')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="+1 (555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Location
                    </label>
                    <input
                      {...register('location')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="New York, NY"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      LinkedIn
                    </label>
                    <input
                      {...register('linkedin')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="linkedin.com/in/johndoe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Portfolio
                    </label>
                    <input
                      {...register('portfolio')}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      placeholder="johndoe.dev"
                    />
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Professional Summary
                </label>
                <textarea
                  {...register('summary')}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  placeholder="Brief summary of your professional background and career objectives..."
                />
              </div>

              {/* Experience */}
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-medium text-gray-900">Work Experience</h3>
                  <button
                    type="button"
                    onClick={() => appendExperience({ company: '', position: '', start_date: '', end_date: '', description: '' })}
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

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Company
                        </label>
                        <input
                          {...register(`experience.${index}.company`)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder="Company Name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Position
                        </label>
                        <input
                          {...register(`experience.${index}.position`)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder="Job Title"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Start Date
                        </label>
                        <input
                          {...register(`experience.${index}.start_date`)}
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          End Date
                        </label>
                        <input
                          {...register(`experience.${index}.end_date`)}
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Description
                      </label>
                      <textarea
                        {...register(`experience.${index}.description`)}
                        rows={3}
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        placeholder="Describe your responsibilities and achievements..."
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
                    onClick={() => appendEducation({ school: '', degree: '', field: '', start_date: '', end_date: '' })}
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

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          School
                        </label>
                        <input
                          {...register(`education.${index}.school`)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder="University Name"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Degree
                        </label>
                        <input
                          {...register(`education.${index}.degree`)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder="Bachelor's, Master's, etc."
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Field of Study
                        </label>
                        <input
                          {...register(`education.${index}.field`)}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                          placeholder="Computer Science, Business, etc."
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Start Date
                        </label>
                        <input
                          {...register(`education.${index}.start_date`)}
                          type="date"
                          className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        End Date
                      </label>
                      <input
                        {...register(`education.${index}.end_date`)}
                        type="date"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Skills */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-gray-900">Skills</h3>
                
                <div className="flex space-x-2">
                  <input
                    type="text"
                    value={newSkill}
                    onChange={(e) => setNewSkill(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addSkill())}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                    placeholder="Add a skill"
                  />
                  <button
                    type="button"
                    onClick={addSkill}
                    className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                  >
                    Add
                  </button>
                </div>

                {skills.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {skills.map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-primary-100 text-primary-800"
                      >
                        {skill}
                        <button
                          type="button"
                          onClick={() => removeSkill(index)}
                          className="ml-2 text-primary-600 hover:text-primary-800"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </form>
          </div>

          {/* Preview */}
          {showPreview && (
            <div className="lg:col-span-1">
              <ResumePreview data={{ ...formData, skills }} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResumeForm; 