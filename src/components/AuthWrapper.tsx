import React from 'react';
import { useAuth } from '../contexts/AuthContext';
import Auth from './Auth';

interface AuthWrapperProps {
  children: React.ReactNode;
}

const AuthWrapper: React.FC<AuthWrapperProps> = ({ children }) => {
  const { isAuthenticated } = useAuth();

  if (!isAuthenticated) {
    return <Auth />;
  }

  return <>{children}</>;
};

export default AuthWrapper; 