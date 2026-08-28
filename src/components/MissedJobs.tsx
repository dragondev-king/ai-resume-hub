import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Filter, ChevronLeft, ChevronRight, Copy, ExternalLink, Check } from 'lucide-react';
import { MissedJobApplicationRPC } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { useProfiles } from '../contexts/ProfilesContext';
import { formatDate } from '../utils/helpers';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';

const MissedJobs: React.FC = () => {
  const { user, role } = useUser();
  const { profiles, loading: profilesLoading } = useProfiles();
  const [searchParams, setSearchParams] = useSearchParams();

  const [jobs, setJobs] = useState<MissedJobApplicationRPC[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);

  const getInitialFilters = () => ({
    profileId: searchParams.get('profileId') || '',
    dateRange: searchParams.get('dateRange') === 'today' ? 'today' : 'this-week',
  });

  const [filters, setFilters] = useState(getInitialFilters);
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1', 10));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get('pageSize') || '100', 10));
  const [totalJobs, setTotalJobs] = useState(0);

  const updateURLParams = useCallback((
    newFilters: { profileId: string; dateRange: string },
    newPage: number = 1,
    newPageSize: number = pageSize
  ) => {
    const params = new URLSearchParams();
    if (newFilters.profileId) params.set('profileId', newFilters.profileId);
    if (newFilters.dateRange && newFilters.dateRange !== 'this-week') {
      params.set('dateRange', newFilters.dateRange);
    }
    if (newPage > 1) params.set('page', newPage.toString());
    if (newPageSize !== 100) params.set('pageSize', newPageSize.toString());
    setSearchParams(params, { replace: true });
  }, [setSearchParams, pageSize]);

  const setFiltersAndUpdateURL = useCallback((newFilters: { profileId: string; dateRange: string }) => {
    setFilters(newFilters);
    setCurrentPage(1);
    updateURLParams(newFilters, 1);
  }, [updateURLParams]);

  useEffect(() => {
    if (profilesLoading || profiles.length === 0) return;

    const profileStillValid = filters.profileId && profiles.some((p) => p.id === filters.profileId);
    if (!profileStillValid) {
      setFiltersAndUpdateURL({ ...filters, profileId: profiles[0].id });
    }
  }, [profiles, profilesLoading, filters.profileId, filters, setFiltersAndUpdateURL]);

  const loadMissedJobs = useCallback(async () => {
    if (!user?.id || !role || !filters.profileId) {
      setJobs([]);
      setTotalJobs(0);
      setLoading(false);
      return;
    }

    try {
      setFilterLoading(true);

      const { data, error } = await supabase.rpc('get_missed_job_applications', {
        p_user_id: user.id,
        p_user_role: role,
        p_profile_id: filters.profileId,
        p_date_range: filters.dateRange,
        p_page_size: pageSize,
        p_page_number: currentPage,
      });

      if (error) throw error;

      const { data: countData, error: countError } = await supabase.rpc(
        'get_missed_job_applications_count',
        {
          p_user_id: user.id,
          p_user_role: role,
          p_profile_id: filters.profileId,
          p_date_range: filters.dateRange,
        }
      );

      if (countError) throw countError;

      setJobs(data || []);
      setTotalJobs(countData || 0);
    } catch (error) {
      console.error('Error loading missed jobs:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to load missed jobs');
      setJobs([]);
      setTotalJobs(0);
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  }, [user, role, filters.profileId, filters.dateRange, pageSize, currentPage]);

  useEffect(() => {
    loadMissedJobs();
  }, [loadMissedJobs]);

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize);
    setCurrentPage(1);
    updateURLParams(filters, 1, newSize);
  };

  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    updateURLParams(filters, newPage, pageSize);
  };

  const copyLink = async (job: MissedJobApplicationRPC) => {
    try {
      await navigator.clipboard.writeText(job.job_description_link);
      setCopiedLinkId(job.id);
      toast.success('Job link copied');
      setTimeout(() => setCopiedLinkId(null), 2000);
    } catch {
      toast.error('Failed to copy job link');
    }
  };

  const totalPages = Math.max(1, Math.ceil(totalJobs / pageSize));
  const startIndex = totalJobs === 0 ? 0 : (currentPage - 1) * pageSize;
  const endIndex = startIndex + jobs.length;

  if (loading || profilesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Missed Jobs</h2>
          <p className="text-gray-600">
            Companies others applied to this period that this profile has not applied to yet.
            Only jobs with a link are listed.
          </p>
        </div>
        <div className="text-sm text-gray-500">
          {totalJobs} job{totalJobs !== 1 ? 's' : ''}
        </div>
      </div>

      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <div className="flex items-center space-x-2 mb-4">
          <Filter className="w-4 h-4 text-gray-500" />
          <h3 className="font-medium text-gray-900">Filters</h3>
        </div>

        <div className="flex gap-8 flex-wrap">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Profile
            </label>
            <select
              value={filters.profileId}
              onChange={(e) => setFiltersAndUpdateURL({ ...filters, profileId: e.target.value })}
              className="w-full min-w-[220px] px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              {profiles.length === 0 ? (
                <option value="">No profiles available</option>
              ) : null}
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.first_name} {profile.last_name}
                  {profile.title ? ` · ${profile.title}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
            </label>
            <select
              value={filters.dateRange}
              onChange={(e) => setFiltersAndUpdateURL({ ...filters, dateRange: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="today">Today</option>
              <option value="this-week">This Week</option>
            </select>
          </div>
        </div>
      </div>

      {filterLoading ? (
        <div className="bg-white rounded-lg border border-gray-200 p-12">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </div>
      ) : profiles.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Profiles</h3>
          <p className="text-gray-600">
            {role === 'bidder'
              ? 'No profiles have been assigned to you yet. Contact your manager.'
              : 'Create a profile first to see missed jobs.'}
          </p>
        </div>
      ) : jobs.length === 0 ? (
        <div className="text-center py-12">
          <Calendar className="w-16 h-16 mx-auto text-gray-400 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No Missed Jobs</h3>
          <p className="text-gray-600">
            This profile has an active application to every company that others applied to in this period
            (or no linked applications were submitted).
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Show:</label>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={50}>50</option>
                <option value={100}>100</option>
                <option value={200}>200</option>
                <option value={500}>500</option>
              </select>
              <span className="text-sm text-gray-600">per page</span>
            </div>
            <span className="text-sm text-gray-600">
              Showing {startIndex + 1} to {endIndex} of {totalJobs} jobs
            </span>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      No
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Company
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Job Title
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Job Link
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Applied By Others
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {jobs.map((job, index) => (
                    <tr key={job.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {startIndex + index + 1}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 break-words">{job.company_name}</div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900 break-words max-w-xs">
                          {job.job_title || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <a
                          href={job.job_description_link}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm text-primary-600 hover:text-primary-800 break-all max-w-md inline-block"
                        >
                          {job.job_description_link}
                        </a>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(job.created_at, true, true)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center space-x-2">
                          <button
                            type="button"
                            onClick={() => copyLink(job)}
                            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-md"
                            title="Copy job link"
                          >
                            {copiedLinkId === job.id ? (
                              <Check className="w-4 h-4 text-green-600" />
                            ) : (
                              <Copy className="w-4 h-4" />
                            )}
                          </button>
                          <a
                            href={job.job_description_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-2 text-gray-500 hover:text-primary-600 hover:bg-gray-100 rounded-md"
                            title="Open job link"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center space-x-2">
              <button
                type="button"
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage <= 1}
                className="p-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-700">
                Page {currentPage} of {totalPages}
              </span>
              <button
                type="button"
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage >= totalPages}
                className="p-2 border border-gray-300 rounded-md disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default MissedJobs;
