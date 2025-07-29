import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Auth from './components/Auth';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ProfilesPage from './pages/ProfilesPage';
import GeneratorPage from './pages/GeneratorPage';
import ApplicationsPage from './pages/ApplicationsPage';
import AssignmentsPage from './pages/AssignmentsPage';
import UsersPage from './pages/UsersPage';

const AppContent: React.FC = () => {
  const { user, loading } = useAuth();

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
    <Layout>
      <Routes>
        <Route path="/" element={<Navigate to="/profiles" replace />} />
        <Route path="/profiles" element={<ProfilesPage />} />
        <Route path="/generator" element={<GeneratorPage />} />
        <Route path="/applications" element={<ApplicationsPage />} />
        <Route 
          path="/assignments" 
          element={
            <ProtectedRoute requiredRole="manager">
              <AssignmentsPage />
            </ProtectedRoute>
          } 
        />
        <Route 
          path="/users" 
          element={
            <ProtectedRoute requiredRole="admin">
              <UsersPage />
            </ProtectedRoute>
          } 
        />
        <Route path="*" element={<Navigate to="/profiles" replace />} />
      </Routes>
    </Layout>
  );
};

const App: React.FC = () => {
  return (
    <Router>
      <AuthProvider>
        <AppContent />
        <Toaster position="top-right" />
      </AuthProvider>
    </Router>
  );
};

export default App;
