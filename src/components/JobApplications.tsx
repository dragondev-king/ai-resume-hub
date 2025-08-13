import React, { useState, useEffect, useCallback } from 'react';
import { Calendar, Filter, Eye, ChevronLeft, ChevronRight, Trash2, Search } from 'lucide-react';
import { JobApplicationWithDetails, Bidder } from '../lib/supabase';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import { useProfiles } from '../contexts/ProfilesContext';
import JobApplicationDetailsModal from './JobApplicationDetailsModal';
import ConfirmationModal from './ConfirmationModal';
import { formatDate } from '../utils/helpers';
import toast from 'react-hot-toast';
import { useSearchParams } from 'react-router-dom';

const JobApplications: React.FC = () => {
  const { user, role } = useUser();
  const { profiles } = useProfiles();
  const [searchParams, setSearchParams] = useSearchParams();

  const [applications, setApplications] = useState<JobApplicationWithDetails[]>([]);
  const [bidders, setBidders] = useState<Bidder[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterLoading, setFilterLoading] = useState(false);

  // Initialize filters from URL params
  const getInitialFilters = () => ({
    profileId: searchParams.get('profileId') || '',
    bidderId: searchParams.get('bidderId') || '',
    dateFrom: searchParams.get('dateFrom') || '',
    dateTo: searchParams.get('dateTo') || '',
    dateRange: searchParams.get('dateRange') || 'today',
    status: searchParams.get('status') || '',
    companyName: searchParams.get('companyName') || '',
  });

  const [filters, setFilters] = useState(getInitialFilters);

  // Pagination state - initialize from URL params
  const [currentPage, setCurrentPage] = useState(parseInt(searchParams.get('page') || '1'));
  const [pageSize, setPageSize] = useState(parseInt(searchParams.get('pageSize') || '25'));
  const [totalApplications, setTotalApplications] = useState(0);

  // Function to update URL parameters
  const updateURLParams = useCallback((newFilters: any, newPage: number = 1, newPageSize: number = pageSize) => {
    const params = new URLSearchParams();

    // Add filter params (only if they have values)
    if (newFilters.profileId) params.set('profileId', newFilters.profileId);
    if (newFilters.bidderId) params.set('bidderId', newFilters.bidderId);
    if (newFilters.dateFrom) params.set('dateFrom', newFilters.dateFrom);
    if (newFilters.dateTo) params.set('dateTo', newFilters.dateTo);
    if (newFilters.dateRange && newFilters.dateRange !== 'today') params.set('dateRange', newFilters.dateRange);
    if (newFilters.status) params.set('status', newFilters.status);
    if (newFilters.companyName) params.set('companyName', newFilters.companyName);

    // Add pagination params
    if (newPage > 1) params.set('page', newPage.toString());
    if (newPageSize !== 25) params.set('pageSize', newPageSize.toString());

    setSearchParams(params, { replace: true });
  }, [setSearchParams, pageSize]);

  // Custom setFilters function that also updates URL
  const setFiltersAndUpdateURL = useCallback((newFilters: any) => {
    setFilters(newFilters);
    updateURLParams(newFilters, 1); // Reset to page 1 when filters change
  }, [updateURLParams]);

  // Modal state
  const [selectedApplication, setSelectedApplication] = useState<JobApplicationWithDetails | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Confirmation modal state
  const [deleteConfirmation, setDeleteConfirmation] = useState<{
    isOpen: boolean;
    applicationId: string | null;
  }>({
    isOpen: false,
    applicationId: null
  });

  const loadApplications = useCallback(async () => {
    try {
      setFilterLoading(true);
      console.log('Loading applications for user:', user?.id, 'Role:', { role });

      // Load applications with pagination
      const { data: applicationsData, error } = await supabase.rpc('get_job_applications_with_filters', {
        p_user_id: user?.id || '',
        p_user_role: role,
        p_profile_id: filters.profileId || null,
        p_bidder_id: filters.bidderId || null,
        p_date_from: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : null,
        p_date_to: filters.dateTo ? new Date(filters.dateTo).toISOString() : null,
        p_date_range: filters.dateRange,
        p_status: filters.status || null,
        p_company_name: filters.companyName || null,
        p_page_size: pageSize,
        p_page_number: currentPage
      });

      if (error) {
        console.error('Error loading applications:', error);
        throw error;
      }

      // Load total count for pagination
      const { data: countData, error: countError } = await supabase.rpc('get_job_applications_count', {
        p_user_id: user?.id || '',
        p_user_role: role,
        p_profile_id: filters.profileId || null,
        p_bidder_id: filters.bidderId || null,
        p_date_from: filters.dateFrom ? new Date(filters.dateFrom).toISOString() : null,
        p_date_to: filters.dateTo ? new Date(filters.dateTo).toISOString() : null,
        p_date_range: filters.dateRange,
        p_status: filters.status || null,
        p_company_name: filters.companyName || null
      });

      if (countError) {
        console.error('Error loading count:', countError);
        throw countError;
      }

      console.log('Loaded applications:', applicationsData?.length || 0, 'Total:', countData);
      setApplications(applicationsData || []);
      setTotalApplications(countData || 0);
    } catch (error) {
      console.error('Error loading applications:', error);
      // Set empty array to prevent infinite loading
      setApplications([]);
      setTotalApplications(0);
    } finally {
      setLoading(false);
      setFilterLoading(false);
    }
  }, [user, filters, role, pageSize, currentPage]);



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
      // Load bidders for admin and manager roles
      if (role === 'admin' || role === 'manager') {
        loadBidders();
      }
    }
  }, [user, filters, loadApplications, role, loadBidders]);

  const clearFilters = () => {
    const clearedFilters = {
      profileId: '',
      bidderId: '',
      dateFrom: '',
      dateTo: '',
      dateRange: 'today', // Reset to today as default
      status: '', // Reset status filter
      companyName: '', // Reset company name search
    };
    setFiltersAndUpdateURL(clearedFilters);
    setCurrentPage(1); // Reset to first page
  };



  // Pagination calculations
  const totalPages = Math.ceil(totalApplications / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = Math.min(startIndex + pageSize, totalApplications);

  // Pagination handlers
  const goToPage = (page: number) => {
    const newPage = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(newPage);
    updateURLParams(filters, newPage, pageSize);
  };

  const goToPreviousPage = () => {
    goToPage(currentPage - 1);
  };

  const goToNextPage = () => {
    goToPage(currentPage + 1);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
    updateURLParams(filters, 1, newPageSize);
  };

  const handleViewClick = (e: React.MouseEvent, application: JobApplicationWithDetails) => {
    e.stopPropagation(); // Prevent row click
    setSelectedApplication(application);
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedApplication(null);
  };

  const handleDeleteApplication = async (applicationId: string) => {
    if (!user) return;

    try {
      setIsDeleting(true);
      const { error } = await supabase.rpc('delete_job_application', {
        p_application_id: applicationId,
        p_user_id: user.id,
        p_user_role: role
      });

      if (error) {
        console.error('Error deleting application:', error);
        toast.error('Failed to delete application: ' + error.message);
        return;
      }

      // Refresh the applications list
      await loadApplications();
      toast.success('Application deleted successfully!');
    } catch (error) {
      console.error('Error deleting application:', error);
      toast.error('Failed to delete application');
    } finally {
      setIsDeleting(false);
    }
  };

  const openDeleteConfirmation = (applicationId: string) => {
    setDeleteConfirmation({
      isOpen: true,
      applicationId
    });
  };

  const closeDeleteConfirmation = () => {
    setDeleteConfirmation({
      isOpen: false,
      applicationId: null
    });
  };

  const confirmDelete = async () => {
    if (deleteConfirmation.applicationId) {
      await handleDeleteApplication(deleteConfirmation.applicationId);
      closeDeleteConfirmation();
    }
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

        <div className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${role === 'admin' ? 'lg:grid-cols-8' :
          role === 'manager' ? 'lg:grid-cols-7' :
            'lg:grid-cols-6'
          }`}>
          {/* Profile Filter - Admin, Manager, and Bidder */}
          {(role === 'admin' || role === 'manager' || role === 'bidder') && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Profile
              </label>
              <select
                value={filters.profileId}
                onChange={(e) => setFiltersAndUpdateURL({ ...filters, profileId: e.target.value })}
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
                onChange={(e) => setFiltersAndUpdateURL({ ...filters, bidderId: e.target.value })}
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
                setFiltersAndUpdateURL({
                  ...filters,
                  dateRange: newRange,
                  // Clear custom dates when switching to preset ranges
                  dateFrom: newRange === 'custom' ? filters.dateFrom : '',
                  dateTo: newRange === 'custom' ? filters.dateTo : ''
                });
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="this-week">This Week</option>
              <option value="this-month">This Month</option>
              <option value="last-week">Last Week</option>
              <option value="last-month">Last Month</option>
              <option value="all">All Time</option>
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
                onChange={(e) => setFiltersAndUpdateURL({ ...filters, dateFrom: e.target.value })}
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
                onChange={(e) => setFiltersAndUpdateURL({ ...filters, dateTo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          )}

          {/* Status Filter - All roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <select
              value={filters.status}
              onChange={(e) => setFiltersAndUpdateURL({ ...filters, status: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            >
              <option value="">All Statuses</option>
              <option value="active">Active</option>
              <option value="rejected">Rejected</option>
              <option value="withdrawn">Withdrawn</option>
            </select>
          </div>

          {/* Company Name Search - All roles */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search className="h-4 w-4 text-gray-400" />
              </div>
              <input
                type="text"
                value={filters.companyName}
                onChange={(e) => setFiltersAndUpdateURL({ ...filters, companyName: e.target.value })}
                placeholder="Search by company name..."
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

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
        <div className="space-y-4">
          {/* Pagination Controls */}
          <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex items-center space-x-4">
              <label className="text-sm font-medium text-gray-700">Show:</label>
              <select
                value={pageSize}
                onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                className="px-3 py-1 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span className="text-sm text-gray-600">per page</span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">
                Showing {startIndex + 1} to {Math.min(endIndex, totalApplications)} of {totalApplications} applications
              </span>
            </div>
          </div>

          {/* Applications Table */}
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      No
                    </th>
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
                      Status
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
                  {applications.map((application, index) => (
                    <tr
                      key={application.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                    >
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {(index + 1) + (currentPage - 1) * pageSize}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm font-medium text-gray-900 break-words max-w-xs">
                          {application.job_title}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900 break-words">
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
                        <div className="text-sm">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${application.status === 'active'
                            ? 'bg-green-100 text-green-800'
                            : application.status === 'rejected'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-yellow-100 text-yellow-800'
                            }`}>
                            {application.status === 'active' ? 'Active' :
                              application.status === 'rejected' ? 'Rejected' :
                                application.status === 'withdrawn' ? 'Withdrawn' : 'Unknown'}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {formatDate(application.created_at, true, true)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={(e) => handleViewClick(e, application)}
                            className="flex items-center space-x-1 text-primary-600 hover:text-primary-700"
                          >
                            <Eye className="w-4 h-4" />
                            <span className="text-sm">View</span>
                          </button>
                          {(role === 'admin' || role === 'manager') && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                openDeleteConfirmation(application.id);
                              }}
                              disabled={isDeleting}
                              className="flex items-center space-x-1 text-red-600 hover:text-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                              title="Delete application"
                            >
                              <Trash2 className="w-4 h-4" />
                              <span className="text-sm">Delete</span>
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

          {/* Pagination Navigation */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between bg-white rounded-lg border border-gray-200 p-4">
              <div className="flex items-center space-x-2">
                <button
                  onClick={goToPreviousPage}
                  disabled={currentPage === 1}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Page Numbers */}
                <div className="flex items-center space-x-1">
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum = 0;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        onClick={() => goToPage(pageNum)}
                        className={`px-3 py-2 text-sm font-medium rounded-md ${currentPage === pageNum
                          ? 'bg-primary-600 text-white'
                          : 'text-gray-500 bg-white border border-gray-300 hover:bg-gray-50'
                          }`}
                      >
                        {pageNum}
                      </button>
                    );
                  })}
                </div>

                <button
                  onClick={goToNextPage}
                  disabled={currentPage === totalPages}
                  className="px-3 py-2 text-sm font-medium text-gray-500 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="text-sm text-gray-600">
                Page {currentPage} of {totalPages}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Job Application Details Modal */}
      <JobApplicationDetailsModal
        application={selectedApplication}
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        onDelete={openDeleteConfirmation}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={deleteConfirmation.isOpen}
        onClose={closeDeleteConfirmation}
        onConfirm={confirmDelete}
        title="Delete Application"
        message="Are you sure you want to delete this job application? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        type="danger"
        isLoading={isDeleting}
      />
    </div>
  );
};

export default JobApplications; 