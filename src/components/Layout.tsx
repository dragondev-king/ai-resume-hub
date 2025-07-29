import React from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { FileText, Sparkles, User, LogOut, Calendar, Users, Crown } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { toast } from 'react-hot-toast';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { user, signOut, isAdmin, isManager, isBidder } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    try {
      await signOut();
      toast.success('Signed out successfully');
      navigate('/auth');
    } catch (error) {
      toast.error('Failed to sign out');
    }
  };

  const getAvailableTabs = () => {
    const tabs: { id: string; label: string; icon: React.ReactNode; path: string; show: boolean }[] = [
      {
        id: 'profiles',
        label: 'Profiles',
        icon: <User className="w-4 h-4" />,
        path: '/profiles',
        show: !isBidder, // Bidders can't manage profiles
      },
      {
        id: 'generator',
        label: 'Generate Resume',
        icon: <FileText className="w-4 h-4" />,
        path: '/generator',
        show: true, // All users can generate resumes
      },
      {
        id: 'applications',
        label: 'Applications',
        icon: <Calendar className="w-4 h-4" />,
        path: '/applications',
        show: true, // All users can view applications (filtered by role)
      },
      {
        id: 'assignments',
        label: 'Assignments',
        icon: <Users className="w-4 h-4" />,
        path: '/assignments',
        show: isAdmin || isManager, // Only admins and managers can manage assignments
      },
      {
        id: 'users',
        label: 'Users',
        icon: <Crown className="w-4 h-4" />,
        path: '/users',
        show: isAdmin, // Only admins can manage users
      },
    ];

    return tabs.filter(tab => tab.show);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center space-x-4">
              <Link to="/profiles" className="flex items-center space-x-2">
                <Sparkles className="w-8 h-8 text-primary-600" />
                <span className="text-xl font-bold text-gray-900">AI Resume Generator</span>
              </Link>
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                <span className="text-sm font-medium text-gray-700">AI-Powered</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">{user?.email}</span>
                <span className="px-2 py-1 text-xs font-medium bg-primary-100 text-primary-800 rounded-full">
                  {isAdmin ? 'Admin' : isManager ? 'Manager' : 'Bidder'}
                </span>
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

      {/* Navigation */}
      <nav className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex space-x-8">
            {getAvailableTabs().map((tab) => (
              <Link
                key={tab.id}
                to={tab.path}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  location.pathname === tab.path
                    ? 'border-primary-500 text-primary-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                <div className="flex items-center space-x-2">
                  {tab.icon}
                  <span>{tab.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout; 