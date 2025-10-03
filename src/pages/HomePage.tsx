import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Calendar,
  Clock,
  BarChart3
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';

interface ProfileSummary {
  profile_id: string;
  profile_first_name: string;
  profile_last_name: string;
  profile_email: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_email: string;
  assigned_bidders: string;
  today_applications: number;
  this_week_applications: number;
  this_month_applications: number;
}

const HomePage: React.FC = () => {
  const { user, role } = useUser();
  const [loading, setLoading] = useState(true);
  const [profileSummaries, setProfileSummaries] = useState<ProfileSummary[]>([]);

  const loadProfileSummaries = useCallback(async () => {
    try {
      setLoading(true);

      // Load profile summaries
      const { data: profileData, error: profileError } = await supabase.rpc(
        'get_application_summaries_by_profile',
        {
          p_user_id: user?.id || '',
          p_user_role: role
        }
      );

      if (profileError) {
        console.error('Error loading profile summaries:', profileError);
      } else {
        setProfileSummaries(profileData || []);
      }
    } catch (error) {
      console.error('Error loading profile summaries:', error);
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    if (user) {
      loadProfileSummaries();
    }
  }, [user, role, loadProfileSummaries]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">
            Welcome back, {user?.first_name}! Here's a summary of applications by profiles.
          </p>
        </div>
      </div>

      {/* Applications by Profile */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Applications by Profile</h3>
        {profileSummaries.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">No profiles found or no applications yet.</p>
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
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned Bidders
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
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {profile.owner_first_name} {profile.owner_last_name}
                        </div>
                        <div className="text-sm text-gray-500">{profile.owner_email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-900">
                        {profile.assigned_bidders}
                      </div>
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
    </div>
  );
};

export default HomePage;
