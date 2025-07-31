import React, { useState, useEffect, useCallback } from 'react';
import { User, Plus, Settings, Crown, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Profile, ProfileWithDetailsRPC } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import ProfileForm from '../components/ProfileForm';
import { toast } from 'react-hot-toast';
import { useUser } from '../contexts/UserContext';

const ProfilesPage: React.FC = () => {
  const { user, role } = useUser()
  const [profiles, setProfiles] = useState<ProfileWithDetailsRPC[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false)
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);

  
  const loadProfiles = useCallback(async (userID: string) => {
    try {
      setIsLoadingProfiles(true)
      
      // Ensure we have valid parameters before calling the RPC function
      if (!user?.id || !role) {
        console.log('User or role not loaded yet, skipping profile load');
        setProfiles([]);
        return;
      }
      
      console.log('Calling get_profiles_with_details with params:', { p_user_id: user.id, p_user_role: role });
      
      const { data, error } = await supabase.rpc('get_profiles_with_details', {
        p_user_id: user.id,
        p_user_role: role
      });

      if (error) {
        console.error('RPC function error:', error);
        throw error;
      }

      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles:', error);
    } finally {
      setIsLoadingProfiles(false)
    }
  }, [user, role]);

  useEffect(() => {
    if (user && user.id) {
      loadProfiles(user.id);
    }
  }, [user, loadProfiles]);


  const handleProfileSave = () => {
    setShowProfileForm(false);
    setEditingProfile(null);
    if (user && user.id) {
      loadProfiles(user.id);
    }
    toast.success('Profile saved successfully!');
  };

  const handleEditProfile = (profile: Profile) => {
    setEditingProfile(profile);
    setShowProfileForm(true);
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (window.confirm('Are you sure you want to delete this profile?')) {
      try {
        const { error } = await supabase.rpc('delete_profile', {
          p_profile_id: profileId
        });

        if (error) throw error;
        if (user && user.id) {
          loadProfiles(user.id);
        }
        toast.success('Profile deleted successfully!');
      } catch (error) {
        console.error('Error deleting profile:', error);
        toast.error('Failed to delete profile');
      }
    }
  };

  if (isLoadingProfiles) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profiles Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Your Profiles</h2>
          <p className="text-gray-600">Manage your professional profiles</p>
        </div>
        {role !== 'bidder' && (
          <button
            onClick={() => setShowProfileForm(true)}
            className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
          >
            <Plus className="w-4 h-4" />
            <span>New Profile</span>
          </button>
        )}
      </div>

      {/* Profile Form Modal */}
      {showProfileForm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingProfile ? 'Edit Profile' : 'Create New Profile'}
                </h3>
                <button
                  onClick={() => {
                    setShowProfileForm(false);
                    setEditingProfile(null);
                  }}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <span className="sr-only">Close</span>
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <ProfileForm
                profile={editingProfile || undefined}
                onSave={handleProfileSave}
              />
            </div>
          </div>
        </div>
      )}

      {/* Profiles List */}
      {profiles.length === 0 ? (
        <div className="text-center py-12">
          <User className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Profiles Yet</h3>
          <p className="text-gray-600 mb-4">
            {role === 'bidder' 
              ? "You don't have any profiles assigned to you yet. Contact your manager to get access to profiles."
              : "Create your first profile to start generating AI-powered resumes."
            }
          </p>
          {role !== 'bidder' && (
            <button
              onClick={() => setShowProfileForm(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create Profile
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {profiles.map((profile) => (
            <div key={profile.id} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    {profile.first_name} {profile.last_name}
                  </h3>
                  <p className="text-sm text-gray-600">{profile.email}</p>
                  <p className="text-sm text-gray-500">{profile.location}</p>
                </div>
                {role !== 'bidder' && (
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleEditProfile(profile)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      <Settings className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Profile Owner */}
              {profile.owner_id && (
                <div className="mb-3 p-3 bg-gray-50 rounded-md">
                  <div className="flex items-center space-x-2 mb-1">
                    <Crown className="w-4 h-4 text-yellow-600" />
                    <span className="text-xs font-medium text-gray-700">Profile Owner</span>
                  </div>
                  <div className="text-sm text-gray-600">
                    {profile.owner_first_name && profile.owner_last_name 
                      ? `${profile.owner_first_name} ${profile.owner_last_name}`
                      : profile.owner_email
                    }
                    <span className="ml-2 px-2 py-1 text-xs bg-blue-100 text-blue-800 rounded-full">
                      {profile.owner_role}
                    </span>
                  </div>
                </div>
              )}

              {/* Assigned Bidders */}
              {profile.assigned_bidders && profile.assigned_bidders.length > 0 && (
                <div className="mb-3 p-3 bg-green-50 rounded-md">
                  <div className="flex items-center space-x-2 mb-2">
                    <Users className="w-4 h-4 text-green-600" />
                    <span className="text-xs font-medium text-gray-700">
                      Assigned Bidders ({profile.assigned_bidders.length})
                    </span>
                  </div>
                  <div className="space-y-1">
                    {profile.assigned_bidders.slice(0, 2).map((bidder) => (
                      <div key={bidder.id} className="text-sm text-gray-600">
                        {bidder.first_name && bidder.last_name 
                          ? `${bidder.first_name} ${bidder.last_name}`
                          : bidder.email
                        }
                      </div>
                    ))}
                    {profile.assigned_bidders.length > 2 && (
                      <div className="text-xs text-gray-500">
                        +{profile.assigned_bidders.length - 2} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Experience:</span>
                  <span className="font-medium">{profile.experience?.length || 0} positions</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Education:</span>
                  <span className="font-medium">{profile.education?.length || 0} degrees</span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">Skills:</span>
                  <span className="font-medium">{profile.skills?.length || 0} skills</span>
                </div>
              </div>
              <div className="mt-4 flex space-x-2">
                <Link
                  to="/generator"
                  className="flex-1 px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100 text-center"
                >
                  Generate Resume
                </Link>
                {role !== 'bidder' && (
                  <button
                    onClick={() => handleDeleteProfile(profile.id)}
                    className="px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ProfilesPage; 