import React from 'react';
import { X, Mail, Phone, MapPin, Linkedin, Globe, Briefcase, GraduationCap, Code } from 'lucide-react';
import { ProfileWithDetailsRPC } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';

interface ProfileDetailsProps {
  profile: ProfileWithDetailsRPC;
  onClose: () => void;
  onAssignBidders?: () => void;
  userRole?: string;
}

const ProfileDetails: React.FC<ProfileDetailsProps> = ({ profile, onClose, onAssignBidders, userRole }) => {
  const { role } = useUser();

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-semibold text-gray-900">Profile Details</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6">
            <div className="bg-gray-50 rounded-lg p-4">
              <h4 className="text-lg font-medium text-gray-900 mb-4">Personal Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Full Name</label>
                  <p className="text-sm text-gray-900 mt-1">
                    {profile.first_name} {profile.last_name}
                  </p>
                </div>
                {profile.title && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Professional Title</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {profile.title}
                    </p>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700">Email</label>
                  <div className="flex items-center mt-1">
                    <Mail className="w-4 h-4 text-gray-400 mr-2" />
                    <p className="text-sm text-gray-900">{profile.email}</p>
                  </div>
                </div>
                {profile.phone && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Phone</label>
                    <div className="flex items-center mt-1">
                      <Phone className="w-4 h-4 text-gray-400 mr-2" />
                      <p className="text-sm text-gray-900">{profile.phone}</p>
                    </div>
                  </div>
                )}
                {profile.location && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Location</label>
                    <div className="flex items-center mt-1">
                      <MapPin className="w-4 h-4 text-gray-400 mr-2" />
                      <p className="text-sm text-gray-900">{profile.location}</p>
                    </div>
                  </div>
                )}
                {profile.linkedin && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">LinkedIn</label>
                    <div className="flex items-center mt-1">
                      <Linkedin className="w-4 h-4 text-gray-400 mr-2" />
                      <a
                        href={profile.linkedin}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        View Profile
                      </a>
                    </div>
                  </div>
                )}
                {profile.portfolio && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Portfolio</label>
                    <div className="flex items-center mt-1">
                      <Globe className="w-4 h-4 text-gray-400 mr-2" />
                      <a
                        href={profile.portfolio}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-blue-600 hover:text-blue-800"
                      >
                        Visit Portfolio
                      </a>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {profile.summary && (
              <div className="bg-gray-50 rounded-lg p-4">
                <h4 className="text-lg font-medium text-gray-900 mb-4">Professional Summary</h4>
                <p className="text-sm text-gray-700 leading-relaxed">{profile.summary}</p>
              </div>
            )}

            {profile.experience && profile.experience.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center mb-4">
                  <Briefcase className="w-5 h-5 text-gray-600 mr-2" />
                  <h4 className="text-lg font-medium text-gray-900">Work Experience</h4>
                </div>
                <div className="space-y-4">
                  {profile.experience.map((exp: any, index: number) => (
                    <div key={index} className="border-l-4 border-blue-500 pl-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-medium text-gray-900">{exp.title}</h5>
                          <p className="text-sm text-gray-600">{exp.company}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">
                            {exp.startDate && formatDate(exp.startDate)} - {exp.endDate ? formatDate(exp.endDate) : 'Present'}
                          </p>
                        </div>
                      </div>
                      {exp.description && (
                        <p className="text-sm text-gray-700 mt-2">{exp.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.education && profile.education.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center mb-4">
                  <GraduationCap className="w-5 h-5 text-gray-600 mr-2" />
                  <h4 className="text-lg font-medium text-gray-900">Education</h4>
                </div>
                <div className="space-y-4">
                  {profile.education.map((edu: any, index: number) => (
                    <div key={index} className="border-l-4 border-green-500 pl-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h5 className="font-medium text-gray-900">{edu.degree}</h5>
                          <p className="text-sm text-gray-600">{edu.institution}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-sm text-gray-500">
                            {edu.startDate && formatDate(edu.startDate)} - {edu.endDate ? formatDate(edu.endDate) : 'Present'}
                          </p>
                        </div>
                      </div>
                      {edu.description && (
                        <p className="text-sm text-gray-700 mt-2">{edu.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {profile.skills && profile.skills.length > 0 && (
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="flex items-center mb-4">
                  <Code className="w-5 h-5 text-gray-600 mr-2" />
                  <h4 className="text-lg font-medium text-gray-900">Skills</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {profile.skills.map((skill: string, index: number) => (
                    <span
                      key={index}
                      className="px-3 py-1 bg-blue-100 text-blue-800 text-sm rounded-full"
                    >
                      {skill}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {profile.owner_id && role !== 'bidder' && (
              <div className="bg-yellow-50 rounded-lg p-4">
                <h4 className="text-lg font-medium text-gray-900 mb-4">Profile Owner</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Owner Name</label>
                    <p className="text-sm text-gray-900 mt-1">
                      {profile.owner_first_name && profile.owner_last_name
                        ? `${profile.owner_first_name} ${profile.owner_last_name}`
                        : 'N/A'
                      }
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Owner Email</label>
                    <p className="text-sm text-gray-900 mt-1">{profile.owner_email}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Owner Role</label>
                    <span className="inline-block mt-1 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                      {profile.owner_role}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {profile.assigned_bidders && role !== 'bidder' && (
              <>
                {
                  profile.assigned_bidders.length > 0 ? (
                    <div className="bg-green-50 rounded-lg p-4">
                      <h4 className="text-lg font-medium text-gray-900 mb-4">
                        Assigned Bidders ({profile.assigned_bidders.length})
                      </h4>
                      <div className="space-y-2">
                        {profile.assigned_bidders.map((bidder: any) => (
                          <div key={bidder.id} className="flex items-center justify-between p-2 bg-white rounded border">
                            <div>
                              <p className="text-sm font-medium text-gray-900">
                                {bidder.first_name && bidder.last_name
                                  ? `${bidder.first_name} ${bidder.last_name}`
                                  : 'N/A'
                                }
                              </p>
                              <p className="text-xs text-gray-600">{bidder.email}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="bg-red-50 rounded-lg p-4">
                      <h4 className="text-lg font-medium text-gray-900 mb-4">
                        No Bidders Assigned
                      </h4>
                    </div>
                  )
                }
              </>
            )}
          </div>

          <div className="flex justify-end space-x-3 mt-6">
            {(userRole === 'admin' || userRole === 'manager') && onAssignBidders && (
              <button
                onClick={onAssignBidders}
                className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Manage Bidders
              </button>
            )}
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ProfileDetails; 