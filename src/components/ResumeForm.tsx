import React, { useState } from 'react';
import { useForm, useFieldArray } from 'react-hook-form';
import { Plus, Trash2, Loader2, Sparkles } from 'lucide-react';
import { ResumeData } from '../types/resume';

interface ResumeFormProps {
  onSubmit: (data: ResumeData) => void;
  isGenerating: boolean;
}

const ResumeForm: React.FC<ResumeFormProps> = ({ onSubmit, isGenerating }) => {

  const {
    register,
    handleSubmit,
    control,
    watch,
    formState: { errors },
  } = useForm<ResumeData>({
    defaultValues: {
      personalInfo: {
        firstName: '',
        lastName: '',
        email: '',
        phone: '',
        location: '',
        linkedin: '',
        portfolio: '',
      },
      summary: '',
      experience: [
        {
          company: '',
          position: '',
          startDate: '',
          endDate: '',
          current: false,
          description: '',
          achievements: [''],
        },
      ],
      education: [
        {
          institution: '',
          degree: '',
          field: '',
          startDate: '',
          endDate: '',
          current: false,
          gpa: '',
        },
      ],
      skills: [''],
      jobDescription: '',
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

  const [skillFields, setSkillFields] = useState([{ id: 0, value: '' }]);

  const onSubmitForm = (data: ResumeData) => {
    // Add skills from skillFields to the data
    const skills = skillFields.map(field => field.value).filter(skill => skill.trim());
    onSubmit({ ...data, skills });
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
    <form onSubmit={handleSubmit(onSubmitForm)} className="space-y-6">
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
              {...register('personalInfo.firstName', { required: 'First name is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="John"
            />
            {errors.personalInfo?.firstName && (
              <p className="mt-1 text-sm text-red-600">{errors.personalInfo.firstName.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Last Name *
            </label>
            <input
              type="text"
              {...register('personalInfo.lastName', { required: 'Last name is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="Doe"
            />
            {errors.personalInfo?.lastName && (
              <p className="mt-1 text-sm text-red-600">{errors.personalInfo.lastName.message}</p>
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
              {...register('personalInfo.email', { 
                required: 'Email is required',
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: 'Invalid email address'
                }
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="john.doe@example.com"
            />
            {errors.personalInfo?.email && (
              <p className="mt-1 text-sm text-red-600">{errors.personalInfo.email.message}</p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Phone *
            </label>
            <input
              type="tel"
              {...register('personalInfo.phone', { required: 'Phone is required' })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="+1 (555) 123-4567"
            />
            {errors.personalInfo?.phone && (
              <p className="mt-1 text-sm text-red-600">{errors.personalInfo.phone.message}</p>
            )}
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Location *
          </label>
          <input
            type="text"
            {...register('personalInfo.location', { required: 'Location is required' })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="San Francisco, CA"
          />
          {errors.personalInfo?.location && (
            <p className="mt-1 text-sm text-red-600">{errors.personalInfo.location.message}</p>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              LinkedIn (optional)
            </label>
            <input
              type="url"
              {...register('personalInfo.linkedin')}
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
              {...register('personalInfo.portfolio')}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              placeholder="https://johndoe.dev"
            />
          </div>
        </div>
      </div>

      {/* Job Description */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Job Description</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Job Description *
          </label>
          <textarea
            {...register('jobDescription', { required: 'Job description is required' })}
            rows={6}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            placeholder="Paste the job description here. The AI will use this to tailor your resume..."
          />
          {errors.jobDescription && (
            <p className="mt-1 text-sm text-red-600">{errors.jobDescription.message}</p>
          )}
        </div>
      </div>

      {/* Current Summary */}
      <div className="space-y-4">
        <h3 className="text-lg font-medium text-gray-900">Current Summary</h3>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Professional Summary
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
              startDate: '',
              endDate: '',
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
                  {...register(`experience.${index}.startDate`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="month"
                  {...register(`experience.${index}.endDate`)}
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
              startDate: '',
              endDate: '',
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
                  {...register(`education.${index}.startDate`)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                <input
                  type="month"
                  {...register(`education.${index}.endDate`)}
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
          disabled={isGenerating}
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
    </form>
  );
};

export default ResumeForm; 