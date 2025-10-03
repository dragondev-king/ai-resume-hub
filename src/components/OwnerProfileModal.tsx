import React, { useState, useEffect, useCallback } from 'react';
import { X, Clock, Calendar, BarChart3, Users } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';

interface ProfileSummary {
  profile_id: string;
  profile_first_name: string;
  profile_last_name: string;
  profile_email: string;
  assigned_bidders: string;
  is_active: boolean;
  today_applications: number;
  this_week_applications: number;
  this_month_applications: number;
}

interface OwnerProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerId: string;
  ownerName: string;
}

const OwnerProfileModal: React.FC<OwnerProfileModalProps> = ({
  isOpen,
  onClose,
  ownerId,
  ownerName
}) => {
  const { user, role } = useUser();
  const [loading, setLoading] = useState(false);
  const [profileSummaries, setProfileSummaries] = useState<ProfileSummary[]>([]);

  const loadProfileSummaries = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc(
        'get_application_summaries_by_profile_for_owner',
        {
          p_owner_id: ownerId,
          p_user_id: user?.id || '',
          p_user_role: role
        }
      );

      if (error) {
        console.error('Error loading profile summaries:', error);
      } else {
        setProfileSummaries(data || []);
      }
    } catch (error) {
      console.error('Error loading profile summaries:', error);
    } finally {
      setLoading(false);
    }
  }, [ownerId, user, role]);

  useEffect(() => {
    if (isOpen && ownerId) {
      loadProfileSummaries();
    }
  }, [isOpen, ownerId, loadProfileSummaries]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Profile Details for {ownerName}
            </h2>
            <p className="text-sm text-gray-600">
              Applications by individual profiles
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
          {loading ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : profileSummaries.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
              <p className="text-gray-600">No profiles found for this owner.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Profile
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Assigned Bidders
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Today
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      This Week
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      This Month
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {profileSummaries.map((profile) => (
                    <tr key={profile.profile_id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {profile.profile_first_name} {profile.profile_last_name}
                          </div>
                          <div className="text-sm text-gray-500">{profile.profile_email}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">
                          {profile.assigned_bidders}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${profile.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                          }`}>
                          {profile.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <Clock className="w-4 h-4 text-blue-500" />
                          <span className="text-sm text-gray-900">{profile.today_applications}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <Calendar className="w-4 h-4 text-green-500" />
                          <span className="text-sm text-gray-900">{profile.this_week_applications}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <BarChart3 className="w-4 h-4 text-purple-500" />
                          <span className="text-sm text-gray-900">{profile.this_month_applications}</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default OwnerProfileModal;
