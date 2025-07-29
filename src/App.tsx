import React, { useState } from 'react';
import { Toaster, toast } from 'react-hot-toast';
import { FileText, Sparkles, User, LogOut, Plus, Settings } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import ProfileForm from './components/ProfileForm';
import ResumeGenerator from './components/ResumeGenerator';
import { Profile } from './lib/supabase';
import { supabase } from './lib/supabase';

const AppContent: React.FC = () => {
  const { user, loading, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState<'profiles' | 'generator'>('profiles');
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [editingProfile, setEditingProfile] = useState<Profile | null>(null);
  const [showProfileForm, setShowProfileForm] = useState(false);

  React.useEffect(() => {
    if (user) {
      loadProfiles();
    }
  }, [user]);

  const loadProfiles = async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user?.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (error) {
      console.error('Error loading profiles:', error);
    }
  };

  const handleProfileSave = () => {
    setShowProfileForm(false);
    setEditingProfile(null);
    loadProfiles();
    toast.success('Profile saved successfully!');
  };

  const handleEditProfile = (profile: Profile) => {
    setEditingProfile(profile);
    setShowProfileForm(true);
  };

  const handleDeleteProfile = async (profileId: string) => {
    if (window.confirm('Are you sure you want to delete this profile?')) {
      try {
        const { error } = await supabase
          .from('profiles')
          .delete()
          .eq('id', profileId);

        if (error) throw error;
        loadProfiles();
        toast.success('Profile deleted successfully!');
      } catch (error) {
        console.error('Error deleting profile:', error);
        toast.error('Failed to delete profile');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <Toaster position="top-right" />
      
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-10 h-10 bg-primary-600 rounded-lg">
                <FileText className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-gray-900">AI Resume Generator</h1>
                <p className="text-sm text-gray-500">Powered by AI</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                <span className="text-sm font-medium text-gray-700">AI-Powered</span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{user.email}</span>
                <button
                  onClick={handleSignOut}
                  className="flex items-center space-x-1 text-sm text-gray-600 hover:text-gray-900"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Tab Navigation */}
        <div className="mb-8">
          <div className="border-b border-gray-200">
            <nav className="-mb-px flex space-x-8">
              <button
                onClick={() => setActiveTab('profiles')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'profiles'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <User className="w-4 h-4" />
                  <span>Profiles</span>
                </div>
              </button>
              <button
                onClick={() => setActiveTab('generator')}
                className={`py-2 px-1 border-b-2 font-medium text-sm ${
                  activeTab === 'generator'
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  <FileText className="w-4 h-4" />
                  <span>Generate Resume</span>
                </div>
              </button>
            </nav>
          </div>
        </div>

        {/* Content */}
        {activeTab === 'profiles' && (
          <div className="space-y-6">
            {/* Profiles Header */}
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold text-gray-900">Your Profiles</h2>
                <p className="text-gray-600">Manage your professional profiles</p>
              </div>
              <button
                onClick={() => setShowProfileForm(true)}
                className="flex items-center space-x-2 px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
              >
                <Plus className="w-4 h-4" />
                <span>New Profile</span>
              </button>
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
                  Create your first profile to start generating AI-powered resumes.
                </p>
                <button
                  onClick={() => setShowProfileForm(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-primary-600 hover:bg-primary-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Create Profile
                </button>
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
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleEditProfile(profile)}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <Settings className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
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
                      <button
                        onClick={() => {
                          setActiveTab('generator');
                          // You could pass the profile ID to the generator
                        }}
                        className="flex-1 px-3 py-2 text-sm font-medium text-primary-600 bg-primary-50 rounded-md hover:bg-primary-100"
                      >
                        Generate Resume
                      </button>
                      <button
                        onClick={() => handleDeleteProfile(profile.id)}
                        className="px-3 py-2 text-sm font-medium text-red-600 hover:text-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'generator' && (
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-2">
                Generate AI Resume
              </h2>
              <p className="text-sm text-gray-600">
                Select a profile and add a job description to generate a tailored resume
              </p>
            </div>
            <ResumeGenerator />
          </div>
        )}
      </main>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
};

export default App;
