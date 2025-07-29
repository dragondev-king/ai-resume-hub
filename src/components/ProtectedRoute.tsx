import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'manager' | 'bidder';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { user, loading, isAdmin, isManager, isBidder } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth" state={{ from: location }} replace />;
  }

  if (requiredRole) {
    const hasRequiredRole = 
      (requiredRole === 'admin' && isAdmin) ||
      (requiredRole === 'manager' && (isManager || isAdmin)) ||
      (requiredRole === 'bidder' && (isBidder || isManager || isAdmin));

    if (!hasRequiredRole) {
      return <Navigate to="/profiles" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute; 