import React, { useState, useEffect } from 'react';
import { Calendar, Building, User, Filter, Download, Eye } from 'lucide-react';
import { JobApplicationWithDetails, Profile } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';

const JobApplications: React.FC = () => {
  const { user, isAdmin, isManager, isBidder } = useAuth();
  const [applications, setApplications] = useState<JobApplicationWithDetails[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    profileId: '',
    bidderId: '',
    dateFrom: '',
    dateTo: '',
  });

  useEffect(() => {
    if (user) {
      loadApplications();
      if (isAdmin || isManager) {
        loadProfiles();
      }
    }
  }, [user, filters]);

  const loadApplications = async () => {
    try {
      let query = supabase
        .from('job_applications')
        .select(`
          *,
          profile:profiles(*),
          bidder:user_roles!job_applications_bidder_id_fkey(user_id)
        `);

      // Apply role-based filtering
      if (isBidder) {
        query = query.eq('bidder_id', user?.id);
      } else if (isManager) {
        // Managers can see applications for their profiles
        const { data: managerProfiles } = await supabase
          .from('profiles')
          .select('id')
          .eq('user_id', user?.id);
        
        const profileIds = managerProfiles?.map(p => p.id) || [];
        if (profileIds.length > 0) {
          query = query.in('profile_id', profileIds);
        } else {
          query = query.eq('profile_id', 'no-profiles'); // This will return empty results
        }
      }
      // Admins can see all applications (no additional filter)

      // Apply user filters
      if (filters.profileId) {
        query = query.eq('profile_id', filters.profileId);
      }
      if (filters.bidderId) {
        query = query.eq('bidder_id', filters.bidderId);
      }
      if (filters.dateFrom) {
        query = query.gte('created_at', filters.dateFrom);
      }
      if (filters.dateTo) {
        query = query.lte('created_at', filters.dateTo);
      }

      const { data, error } = await query.order('created_at', { ascending: false });

      if (error) throw error;
      setApplications(data || []);
    } catch (error) {
      console.error('Error loading applications:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadProfiles = async () => {
    try {
      let query = supabase.from('profiles').select('*');
      
      if (isManager) {
        query = query.eq('user_id', user?.id);
      }
      // Admins can see all profiles

      const { data, error } = await query.order('created_at', { ascending: false });
      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const clearFilters = () => {
    setFilters({
      profileId: '',
      bidderId: '',
      dateFrom: '',
      dateTo: '',
    });
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
          <h2 className="text-2xl font-bold text-gray-900">Job Applications</h2>
          <p className="text-gray-600">View and manage your job application history</p>
        </div>
        <div className="text-sm text-gray-500">
          {applications.length} application{applications.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Filters */}
      {(isAdmin || isManager) && (
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <div className="flex items-center space-x-2 mb-4">
            <Filter className="w-4 h-4 text-gray-500" />
            <h3 className="font-medium text-gray-900">Filters</h3>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {isAdmin && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Profile
                </label>
                <select
                  value={filters.profileId}
                  onChange={(e) => setFilters({ ...filters, profileId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                >
                  <option value="">All Profiles</option>
                  {profiles.map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.first_name} {profile.last_name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date From
              </label>
              <input
                type="date"
                value={filters.dateFrom}
                onChange={(e) => setFilters({ ...filters, dateFrom: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date To
              </label>
              <input
                type="date"
                value={filters.dateTo}
                onChange={(e) => setFilters({ ...filters, dateTo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>

            <div className="flex items-end">
              <button
                onClick={clearFilters}
                className="w-full px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 border border-gray-300 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                Clear Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Applications List */}
      {applications.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Applications Found</h3>
          <p className="text-gray-600">
            {isBidder 
              ? "You haven't generated any resumes yet."
              : "No job applications match your current filters."
            }
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((application) => (
            <div key={application.id} className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center space-x-2 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {application.job_title}
                    </h3>
                    {application.company_name && (
                      <>
                        <span className="text-gray-400">•</span>
                        <div className="flex items-center space-x-1 text-gray-600">
                          <Building className="w-4 h-4" />
                          <span>{application.company_name}</span>
                        </div>
                      </>
                    )}
                  </div>
                  
                  <div className="flex items-center space-x-4 text-sm text-gray-500">
                    <div className="flex items-center space-x-1">
                      <Calendar className="w-4 h-4" />
                      <span>{formatDate(application.created_at)}</span>
                    </div>
                    {application.profile && (
                      <div className="flex items-center space-x-1">
                        <User className="w-4 h-4" />
                        <span>{application.profile.first_name} {application.profile.last_name}</span>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  {application.job_description_link && (
                    <a
                      href={application.job_description_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center space-x-1 text-primary-600 hover:text-primary-700"
                    >
                      <Eye className="w-4 h-4" />
                      <span className="text-sm">View Job</span>
                    </a>
                  )}
                  {application.resume_file_name && (
                    <button className="flex items-center space-x-1 text-primary-600 hover:text-primary-700">
                      <Download className="w-4 h-4" />
                      <span className="text-sm">Download</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div>
                  <h4 className="text-sm font-medium text-gray-700 mb-1">Job Description</h4>
                  <p className="text-sm text-gray-600 line-clamp-3">
                    {application.job_description}
                  </p>
                </div>

                {application.generated_summary && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Generated Summary</h4>
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {application.generated_summary}
                    </p>
                  </div>
                )}

                {application.generated_skills && application.generated_skills.length > 0 && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 mb-1">Generated Skills</h4>
                    <div className="flex flex-wrap gap-1">
                      {application.generated_skills.map((skill, index) => (
                        <span
                          key={index}
                          className="px-2 py-1 text-xs bg-primary-100 text-primary-800 rounded-full"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default JobApplications; 