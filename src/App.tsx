import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './contexts/AuthContext';
import UserProvider from './contexts/UserContext';
import AuthWrapper from './components/AuthWrapper';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import ProfilesPage from './pages/ProfilesPage';
import GeneratorPage from './pages/GeneratorPage';
import ApplicationsPage from './pages/ApplicationsPage';
import AssignmentsPage from './pages/AssignmentsPage';
import UsersPage from './pages/UsersPage';

const AppContent: React.FC = () => {
  return (
    <AuthWrapper>
      <UserProvider>
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
      </UserProvider>
    </AuthWrapper>
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
