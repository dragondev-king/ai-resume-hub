import React, { useState, useEffect, useCallback } from 'react';
import {
  Users,
  Calendar,
  Clock,
  BarChart3,
  X
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useUser } from '../contexts/UserContext';
import OwnerProfileModal from '../components/OwnerProfileModal';
import ResumeTemplatePreview from '../components/ResumeTemplatePreview';
import { listResumeTemplates, type ResumeTemplate } from '../resumeTemplates';

interface OwnerSummary {
  owner_id: string;
  owner_first_name: string;
  owner_last_name: string;
  owner_email: string;
  profile_count: number;
  today_applications: number;
  this_week_applications: number;
  this_month_applications: number;
}

const HomePage: React.FC = () => {
  const { user, role } = useUser();
  const [loading, setLoading] = useState(true);
  const [ownerSummaries, setOwnerSummaries] = useState<OwnerSummary[]>([]);
  const [selectedOwner, setSelectedOwner] = useState<{ id: string; name: string } | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [expandedTemplate, setExpandedTemplate] = useState<ResumeTemplate | null>(null);
  const resumeTemplates = listResumeTemplates();

  const loadOwnerSummaries = useCallback(async () => {
    try {
      setLoading(true);

      // Load owner summaries
      const { data: ownerData, error: ownerError } = await supabase.rpc(
        'get_application_summaries_by_owner',
        {
          p_user_id: user?.id || '',
          p_user_role: role
        }
      );

      if (ownerError) {
        console.error('Error loading owner summaries:', ownerError);
      } else {
        setOwnerSummaries(ownerData || []);
      }
    } catch (error) {
      console.error('Error loading owner summaries:', error);
    } finally {
      setLoading(false);
    }
  }, [user, role]);

  useEffect(() => {
    if (user) {
      loadOwnerSummaries();
    }
  }, [user, role, loadOwnerSummaries]);

  useEffect(() => {
    if (!expandedTemplate) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpandedTemplate(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [expandedTemplate]);

  const handleOwnerClick = (owner: OwnerSummary) => {
    setSelectedOwner({
      id: owner.owner_id,
      name: `${owner.owner_first_name} ${owner.owner_last_name}`
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedOwner(null);
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
          <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-600">
            Welcome back, {user?.first_name}!
          </p>
        </div>
      </div>

      {/* Resume template previews */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <div className="mb-4">
          <h2 className="text-lg font-medium text-gray-900">Resume templates</h2>
          <p className="text-sm text-gray-600">
            Click a template to open a full preview with sample content.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {resumeTemplates.map((template) => (
            <button
              key={template.id}
              type="button"
              onClick={() => setExpandedTemplate(template)}
              className="group flex flex-col gap-2 rounded-lg border border-transparent p-2 text-left transition-colors hover:border-gray-200 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            >
              <ResumeTemplatePreview
                template={template}
                variant="compact"
                className="w-full transition-shadow group-hover:shadow-md"
              />
              <div className="text-center">
                <div className="text-sm font-medium text-gray-900">{template.name}</div>
                <div className="mt-1 flex items-center justify-center gap-1.5">
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full border border-gray-200"
                    style={{ backgroundColor: `#${template.colors.primary}` }}
                    aria-hidden
                  />
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full border border-gray-200"
                    style={{ backgroundColor: `#${template.colors.accent}` }}
                    aria-hidden
                  />
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {expandedTemplate && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="template-preview-title"
          onClick={() => setExpandedTemplate(null)}
        >
          <div
            className="relative my-4 w-full max-w-3xl rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-5 py-4 rounded-t-lg">
              <div>
                <h3 id="template-preview-title" className="text-lg font-medium text-gray-900">
                  {expandedTemplate.name}
                </h3>
                <p className="text-sm text-gray-500">Sample resume preview</p>
              </div>
              <button
                type="button"
                onClick={() => setExpandedTemplate(null)}
                className="rounded-md p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
                aria-label="Close preview"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="bg-gray-100 p-4 sm:p-8">
              <ResumeTemplatePreview
                template={expandedTemplate}
                variant="expanded"
                className="mx-auto w-full max-w-[8.5in] shadow-lg"
              />
            </div>
          </div>
        </div>
      )}

      {/* Applications by Profile */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <p className="text-sm text-gray-600 mb-4">Click on any owner row to view detailed profile breakdown</p>
        {ownerSummaries.length === 0 ? (
          <div className="text-center py-8">
            <Users className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <p className="text-gray-600">No owners found or no applications yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Profiles
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
                {ownerSummaries.map((owner) => (
                  <tr
                    key={owner.owner_id}
                    onClick={() => handleOwnerClick(owner)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {owner.owner_first_name} {owner.owner_last_name}
                        </div>
                        <div className="text-sm text-gray-500">{owner.owner_email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Users className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-gray-900">{owner.profile_count}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Clock className="w-4 h-4 text-blue-500" />
                        <span className="text-sm text-gray-900">{owner.today_applications}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <Calendar className="w-4 h-4 text-green-500" />
                        <span className="text-sm text-gray-900">{owner.this_week_applications}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center space-x-2">
                        <BarChart3 className="w-4 h-4 text-purple-500" />
                        <span className="text-sm text-gray-900">{owner.this_month_applications}</span>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Owner Profile Modal */}
      <OwnerProfileModal
        isOpen={isModalOpen}
        onClose={handleCloseModal}
        ownerId={selectedOwner?.id || ''}
        ownerName={selectedOwner?.name || ''}
      />
    </div>
  );
};

export default HomePage;
