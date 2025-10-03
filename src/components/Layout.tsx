import React from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../contexts/UserContext';
import { toast } from 'react-hot-toast';

interface LayoutProps {
  children: React.ReactNode;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { signOut, setIsAuthenticated } = useAuth();
  const { user, role } = useUser();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsAuthenticated(false)
      navigate('/auth');
      toast.success('Signed out successfully');
    } catch (error) {
      navigate('/auth');
      setIsAuthenticated(false)
    }
  };

  const getRoleIcon = (role: string) => {
    switch (role) {
      case 'admin':
        return '👑';
      case 'manager':
        return '🛡️';
      case 'bidder':
        return '👥';
      default:
        return '👤';
    }
  };

  const getRoleBadge = (role: string) => {
    const colors = {
      admin: 'bg-red-100 text-red-800',
      manager: 'bg-blue-100 text-blue-800',
      bidder: 'bg-green-100 text-green-800',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[role as keyof typeof colors] || colors.bidder}`}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

  const isActiveRoute = (path: string) => {
    return location.pathname === path;
  };

  const getNavLinkClass = (path: string) => {
    const baseClass = "px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200";
    const activeClass = "text-primary-600 bg-primary-50 border border-primary-200";
    const inactiveClass = "text-gray-700 hover:text-primary-600 hover:bg-gray-50";

    return `${baseClass} ${isActiveRoute(path) ? activeClass : inactiveClass}`;
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            {/* Logo and Title */}
            <div className="flex items-center">
              <Link to="/home" className="text-xl font-bold text-primary-600">
                AI Resume Hub
              </Link>
            </div>

            {/* Navigation */}
            <nav className="hidden md:flex space-x-8">
              <Link
                to="/home"
                className={getNavLinkClass('/home')}
              >
                Home
              </Link>
              <Link
                to="/profiles"
                className={getNavLinkClass('/profiles')}
              >
                Profiles
              </Link>
              <Link
                to="/generator"
                className={getNavLinkClass('/generator')}
              >
                Generator
              </Link>
              <Link
                to="/applications"
                className={getNavLinkClass('/applications')}
              >
                Applications
              </Link>
              {(role === 'manager' || role === 'admin') && (
                <Link
                  to="/assignments"
                  className={getNavLinkClass('/assignments')}
                >
                  Assignments
                </Link>
              )}
              {role === 'admin' && (
                <Link
                  to="/users"
                  className={getNavLinkClass('/users')}
                >
                  Users
                </Link>
              )}
            </nav>

            {/* User Info and Sign Out */}
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <span className="text-2xl">{getRoleIcon(role)}</span>
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-gray-900">
                    {user?.first_name} {user?.last_name}
                  </span>
                  <div className="flex items-center space-x-1">
                    {getRoleBadge(role)}
                    <span className="text-xs text-gray-500">({user?.email})</span>
                  </div>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center space-x-1 text-gray-700 hover:text-red-600 px-3 py-2 rounded-md text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout; 