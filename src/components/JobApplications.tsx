import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Filter, Download, Eye } from 'lucide-react';
import { JobApplicationWithDetails, Profile, Bidder } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';

const JobApplications: React.FC = () => {
  const { user, role } = useUser();
  const [applications, setApplications] = useState<JobApplicationWithDetails[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [filters, setFilters] = useState({
    profileId: '',
    bidderId: '',
    dateFrom: '',
    dateTo: '',
    dateRange: 'all', // 'all', 'this-week', 'this-month', 'custom'
  });

  const loadApplications = useCallback(async () => {
    try {
      setFilterLoading(true);
      console.log('Loading applications for user:', user?.id, 'Role:', { role });
      
      const { data: applicationsData, error } = await supabase.rpc('get_job_applications_with_filters', {
        p_user_id: user?.id || '',
        p_user_role: role,
        p_profile_id: filters.profileId || null,
        p_bidder_id: filters.bidderId || null,
        p_date_from: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : null,
        p_date_to: filters.dateTo ? new Date(filters.dateTo).toISOString() : null,
        p_date_range: filters.dateRange
      });

      if (error) {
        console.error('Error loading applications:', error);
        throw error;
      }

      console.log('Loaded applications:', applicationsData?.length || 0);
      setApplications(applicationsData || []);
    } catch (error) {
      console.error('Error loading applications:', error);
      // Set empty array to prevent infinite loading
      setApplications([]);
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  }, [user, filters, role]);

  const loadProfiles = useCallback(async () => {
    try {
      console.log('Loading profiles for applications page');
      
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
        console.error('Error loading profiles for applications:', error);
        throw error;
      }
      console.log('Loaded profiles for applications:', data?.length || 0);
      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles for applications:', error);
      setProfiles([]);
    }
  }, [user, role]);

  const loadBidders = useCallback(async () => {
    try {
      console.log('Loading bidders for applications page');
      const { data, error } = await supabase.rpc('get_bidders_for_applications', {
        p_user_id: user?.id || '',
        p_user_role: role
      });
      
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
  }, [user, role]);

  useEffect(() => {
    if (user) {
      loadApplications();
      // Load profiles for admin, manager, and bidder roles
      if (role === 'admin' || role === 'manager' || role === 'bidder') {
        loadProfiles();
      }
      // Load bidders for admin and manager roles
      if (role === 'admin' || role === 'manager') {
        loadBidders();
      }
    }
  }, [user, filters, loadApplications, role, loadProfiles, loadBidders]);

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
      dateRange: 'all',
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
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900">Filters</h3>
        </div>
        
        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${
          role === 'admin' ? 'lg:grid-cols-6' : 
          role === 'manager' ? 'lg:grid-cols-5' : 
          'lg:grid-cols-4'
        }`}>
          {/* Profile Filter - Admin, Manager, and Bidder */}
          {(role === 'admin' || role === 'manager' || role === 'bidder') && (
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

          {/* Bidder Filter - Admin and Manager */}
          {(role === 'admin' || role === 'manager') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bidder
              </label>
              <select
                value={filters.bidderId}
                onChange={(e) => setFilters({ ...filters, bidderId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              >
                <option value="">All Bidders</option>
                {bidders.map((bidder) => (
                  <option key={bidder.id} value={bidder.id}>
                    {bidder.first_name} {bidder.last_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Date Range Filter - All roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
            </label>
            <select
              value={filters.dateRange}
              onChange={(e) => {
                const newRange = e.target.value;
                setFilters({ 
                  ...filters, 
                  dateRange: newRange,
                  // Clear custom dates when switching to preset ranges
                  dateFrom: newRange === 'custom' ? filters.dateFrom : '',
                  dateTo: newRange === 'custom' ? filters.dateTo : ''
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="all">All Time</option>
              <option value="this-week">This Week</option>
              <option value="this-month">This Month</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          {/* Custom Date From Filter - Only when custom range is selected */}
          {filters.dateRange === 'custom' && (
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
          )}

          {/* Custom Date To Filter - Only when custom range is selected */}
          {filters.dateRange === 'custom' && (
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
          )}

          {/* Clear Filters Button - All roles */}
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

             {/* Applications List */}
       {filterLoading ? (
         <div className="bg-white rounded-lg border border-gray-200 p-12">
           <div className="flex items-center justify-center">
             <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
             <span className="ml-3 text-gray-600">Applying filters...</span>
           </div>
         </div>
       ) : applications.length === 0 ? (
         <div className="text-center py-12">
           <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
           <h3 className="text-lg font-medium text-gray-900 mb-2">No Applications Found</h3>
           <p className="text-gray-600">
             {role === 'bidder' 
               ? "You haven't generated any resumes yet."
               : role === 'admin'
               ? "No job applications have been created yet. Create profiles and generate resumes to see application history."
               : "No job applications match your current filters."
             }
           </p>
         </div>
       ) : (
         <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
           <div className="overflow-x-auto">
             <table className="min-w-full divide-y divide-gray-200">
               <thead className="bg-gray-50">
                 <tr>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Job Title
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Company
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Profile
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Bidder
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Date
                   </th>
                   <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                     Actions
                   </th>
                 </tr>
               </thead>
               <tbody className="bg-white divide-y divide-gray-200">
                 {applications.map((application) => (
                   <tr key={application.id} className="hover:bg-gray-50">
                     <td className="px-6 py-4 whitespace-nowrap">
                       <div className="text-sm font-medium text-gray-900">
                         {application.job_title}
                       </div>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap">
                       <div className="text-sm text-gray-900">
                         {application.company_name || '-'}
                       </div>
                     </td>
                                           <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {application.profile_first_name && application.profile_last_name 
                            ? `${application.profile_first_name} ${application.profile_last_name}` 
                            : '-'
                          }
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {application.bidder_first_name && application.bidder_last_name 
                            ? `${application.bidder_first_name} ${application.bidder_last_name}` 
                            : '-'
                          }
                        </div>
                      </td>
                     <td className="px-6 py-4 whitespace-nowrap">
                       <div className="text-sm text-gray-900">
                         {formatDate(application.created_at)}
                       </div>
                     </td>
                     <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
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
                     </td>
                   </tr>
                 ))}
               </tbody>
             </table>
           </div>
         </div>
       )}
    </div>
  );
};

export default JobApplications; 