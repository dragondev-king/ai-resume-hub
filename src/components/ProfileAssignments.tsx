import React, { useState, useEffect, useCallback } from 'react';
import { User, Users, Plus, X } from 'lucide-react';
import { Profile, ProfileAssignment } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';

interface UserWithRole {
  id: string;
  email: string;
  role: string;
}

const ProfileAssignments: React.FC = () => {
  const { user, role } = useUser();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [bidders, setBidders] = useState<UserWithRole[]>([]);
  const [assignments, setAssignments] = useState<ProfileAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState<string>('');
  const [selectedBidder, setSelectedBidder] = useState<string>('');

  const loadProfiles = useCallback(async () => {
    try {
      console.log('Loading profiles for assignments');
      let query = supabase.from('profiles').select('*');
      
      if (role === 'manager') {
        console.log('Loading manager profiles for assignments');
        query = query.eq('user_id', user?.id);
      } else if (role === 'admin') {
        console.log('Loading all profiles for admin assignments');
      }
      // Admins can see all profiles

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.error('Error loading profiles for assignments:', error);
        throw error;
      }
      console.log('Loaded profiles for assignments:', data?.length || 0);
      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles for assignments:', error);
      setProfiles([]);
    }
  }, [user, role]);

  const loadBidders = useCallback(async () => {
    try {
      console.log('Loading bidders for assignments');
      // Query users table directly for bidders
      const { data, error } = await supabase
        .from('users')
        .select('id, email, role')
        .eq('role', 'bidder')
        .eq('is_active', true);

      if (error) {
        console.error('Error loading bidders:', error);
        throw error;
      }

      console.log('Loaded bidders:', data?.length || 0);
      setBidders(data || []);
    } catch (error) {
      console.error('Error loading bidders:', error);
      setBidders([]);
    }
  }, []);

  const loadAssignments = useCallback(async () => {
    try {
      console.log('Loading profile assignments');
      let query = supabase.from('profile_assignments').select('*');
      
      if (role === 'manager') {
        // Managers can only see assignments for their profiles
        console.log('Loading assignments for manager profiles');
        const { data: managerProfiles, error: profileError } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user?.id);
        
        if (profileError) {
          console.error('Error loading manager profiles for assignments:', profileError);
          throw profileError;
        }
        
        const profileIds = managerProfiles?.map(p => p.id) || [];
        console.log('Manager profile IDs for assignments:', profileIds);
        if (profileIds.length > 0) {
          query = query.in('profile_id', profileIds);
        } else {
          query = query.eq('profile_id', 'no-profiles'); // This will return empty results
        }
      } else if (role === 'admin') {
        console.log('Loading all assignments for admin');
      }
      // Admins can see all assignments

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) {
        console.error('Error loading assignments:', error);
        throw error;
      }
      console.log('Loaded assignments:', data?.length || 0);
      setAssignments(data || []);
    } catch (error) {
      console.error('Error loading assignments:', error);
      setAssignments([]);
    }
  }, [user, role]);

  const loadData = useCallback(async () => {
    try {
      console.log('Loading profile assignments data for user:', user?.id, 'Role:', { role });
      await Promise.all([
        loadProfiles(),
        loadBidders(),
        loadAssignments(),
      ]);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  }, [user, loadProfiles, loadBidders, loadAssignments, role]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  const handleAssignProfile = async () => {
    if (!selectedProfile || !selectedBidder) return;

    try {
      const { error } = await supabase
        .from('profile_assignments')
        .insert([{
          profile_id: selectedProfile,
          bidder_id: selectedBidder,
          assigned_by: user?.id!,
        }]);

      if (error) throw error;

      setShowAssignModal(false);
      setSelectedProfile('');
      setSelectedBidder('');
      loadAssignments();
    } catch (error) {
      console.error('Error assigning profile:', error);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    try {
      const { error } = await supabase
        .from('profile_assignments')
        .delete()
        .eq('id', assignmentId);

      if (error) throw error;
      loadAssignments();
    } catch (error) {
      console.error('Error removing assignment:', error);
    }
  };

  const getProfileName = (profileId: string) => {
    const profile = profiles.find(p => p.id === profileId);
    return profile ? `${profile.first_name} ${profile.last_name}` : 'Unknown Profile';
  };

  const getBidderEmail = (bidderId: string) => {
    const bidder = bidders.find(b => b.id === bidderId);
    return bidder?.email || 'Unknown User';
  };

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
          <h2 className="text-2xl font-bold text-gray-900">Profile Assignments</h2>
          <p className="text-gray-600">Manage which bidders can access which profiles</p>
        </div>
        <button
          onClick={() => setShowAssignModal(true)}
          className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
        >
          <Plus className="w-4 h-4" />
          <span>Assign Profile</span>
        </button>
      </div>

      {/* Assignments List */}
      {assignments.length === 0 ? (
        <div className="text-center py-12">
          <Users className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Profile Assignments</h3>
          <p className="text-gray-600 mb-4">
            {role === 'admin' 
              ? "No profile assignments have been created yet. Create profiles and bidder users, then assign profiles to bidders."
              : "No profile assignments match your current filters."
            }
          </p>
          {role === 'admin' && (
            <button
              onClick={() => setShowAssignModal(true)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Create First Assignment
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {assignments.map((assignment) => (
            <div key={assignment.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <div className="flex items-center space-x-2">
                    <User className="w-5 h-5 text-gray-400" />
                    <span className="font-medium text-gray-900">
                      {getProfileName(assignment.profile_id)}
                    </span>
                  </div>
                  <span className="text-gray-400">→</span>
                  <div className="flex items-center space-x-2">
                    <Users className="w-5 h-5 text-gray-400" />
                    <span className="text-gray-700">{getBidderEmail(assignment.bidder_id)}</span>
                  </div>
                </div>
                <button
                  onClick={() => handleRemoveAssignment(assignment.id)}
                  className="flex items-center space-x-1 text-red-600 hover:text-red-700"
                >
                  <X className="w-4 h-4" />
                  <span className="text-sm">Remove</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Assign Modal */}
      {showAssignModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900">
                  Assign Profile to Bidder
                </h3>
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Profile
                  </label>
                  <select
                    value={selectedProfile}
                    onChange={(e) => setSelectedProfile(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Choose a profile...</option>
                    {profiles.map((profile) => (
                      <option key={profile.id} value={profile.id}>
                        {profile.first_name} {profile.last_name} - {profile.email}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Select Bidder
                  </label>
                  <select
                    value={selectedBidder}
                    onChange={(e) => setSelectedBidder(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  >
                    <option value="">Choose a bidder...</option>
                    {bidders.map((bidder) => (
                      <option key={bidder.id} value={bidder.id}>
                        {bidder.email}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowAssignModal(false)}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAssignProfile}
                  disabled={!selectedProfile || !selectedBidder}
                  className="px-4 py-2 text-sm font-medium text-white bg-primary-600 border border-transparent rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Assign Profile
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ProfileAssignments; 