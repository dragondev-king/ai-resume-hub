import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useUser } from '../contexts/UserContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: 'admin' | 'manager' | 'bidder';
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredRole }) => {
  const { isAuthenticated } = useAuth();
  const { role } = useUser();

  // Check if user is authenticated
  if (!isAuthenticated) {
    return <Navigate to="/auth" replace />;
  }

  // Check role-based access if required
  if (requiredRole) {
    const roleHierarchy = {
      bidder: 1,
      manager: 2,
      admin: 3,
    };

    const userRoleLevel = roleHierarchy[role as keyof typeof roleHierarchy] || 0;
    const requiredRoleLevel = roleHierarchy[requiredRole];

    if (userRoleLevel < requiredRoleLevel) {
      // Redirect to applications page if user doesn't have required role
      return <Navigate to="/applications" replace />;
    }
  }

  return <>{children}</>;
};

export default ProtectedRoute; 