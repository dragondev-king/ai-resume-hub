import React, { useEffect, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../contexts/UserContext';
import { toast } from 'react-hot-toast';

interface LayoutProps {
  children: React.ReactNode;
}

interface NavItem {
  path: string;
  label: string;
  shortLabel?: string;
}

const Layout: React.FC<LayoutProps> = ({ children }) => {
  const { signOut, setIsAuthenticated } = useAuth();
  const { user, role } = useUser();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    try {
      await signOut();
      setIsAuthenticated(false);
      navigate('/auth');
      toast.success('Signed out successfully');
    } catch (error) {
      navigate('/auth');
      setIsAuthenticated(false);
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
      <span className={`px-2 py-0.5 text-xs font-medium rounded-full whitespace-nowrap ${colors[role as keyof typeof colors] || colors.bidder}`}>
        {role.charAt(0).toUpperCase() + role.slice(1)}
      </span>
    );
  };

  const isActiveRoute = (path: string) => {
    return location.pathname === path;
  };

  const getNavLinkClass = (path: string, compact = false) => {
    const baseClass = compact
      ? 'px-2.5 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors duration-200'
      : 'block px-3 py-2 rounded-md text-sm font-medium transition-colors duration-200';
    const activeClass = 'text-primary-600 bg-primary-50 border border-primary-200';
    const inactiveClass = 'text-gray-700 hover:text-primary-600 hover:bg-gray-50 border border-transparent';

    return `${baseClass} ${isActiveRoute(path) ? activeClass : inactiveClass}`;
  };

  const navItems: NavItem[] = [
    { path: '/home', label: 'Home' },
    { path: '/profiles', label: 'Profiles' },
    { path: '/generator', label: 'Generator' },
    { path: '/applications', label: 'Applications' },
    { path: '/available-jobs', label: 'Available Jobs', shortLabel: 'Jobs' },
  ];

  if (role === 'manager' || role === 'admin') {
    navItems.push({ path: '/assignments', label: 'Assignments' });
  }

  if (role === 'admin') {
    navItems.push({ path: '/users', label: 'Users' });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="sticky top-0 z-40 bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center flex-nowrap gap-3 h-16">
            <Link
              to="/home"
              className="shrink-0 whitespace-nowrap text-lg sm:text-xl font-bold text-primary-600"
            >
              AI Resume Hub
            </Link>

            <nav className="hidden lg:flex flex-1 items-center justify-center gap-1 min-w-0 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={getNavLinkClass(item.path, true)}
                >
                  {item.shortLabel ? (
                    <>
                      <span className="xl:hidden">{item.shortLabel}</span>
                      <span className="hidden xl:inline">{item.label}</span>
                    </>
                  ) : (
                    item.label
                  )}
                </Link>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-2 sm:gap-3 shrink-0">
              <div className="hidden sm:flex items-center gap-2 min-w-0">
                <span className="text-xl leading-none" aria-hidden="true">
                  {getRoleIcon(role)}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate max-w-[9rem] xl:max-w-[14rem]">
                    {user?.first_name} {user?.last_name}
                  </span>
                  <div className="flex items-center gap-1">
                    {getRoleBadge(role)}
                    {user?.email && (
                      <span className="hidden xl:inline text-xs text-gray-500 truncate max-w-[12rem]">
                        ({user.email})
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1 text-gray-700 hover:text-red-600 px-2 sm:px-3 py-2 rounded-md text-sm font-medium"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
              <button
                type="button"
                className="lg:hidden inline-flex items-center justify-center p-2 rounded-md text-gray-700 hover:text-primary-600 hover:bg-gray-50"
                aria-expanded={mobileMenuOpen}
                aria-label={mobileMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
                onClick={() => setMobileMenuOpen((open) => !open)}
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 bg-white">
            <nav className="max-w-[1440px] mx-auto px-4 sm:px-6 py-3 space-y-1">
              <div className="sm:hidden flex items-center gap-2 px-3 py-2 mb-2 rounded-md bg-gray-50">
                <span className="text-xl leading-none" aria-hidden="true">
                  {getRoleIcon(role)}
                </span>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-gray-900 truncate">
                    {user?.first_name} {user?.last_name}
                  </span>
                  <div className="flex items-center gap-1">
                    {getRoleBadge(role)}
                    {user?.email && (
                      <span className="text-xs text-gray-500 truncate">({user.email})</span>
                    )}
                  </div>
                </div>
              </div>
              {navItems.map((item) => (
                <Link
                  key={item.path}
                  to={item.path}
                  className={getNavLinkClass(item.path)}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>

      <main className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};

export default Layout;
