import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const DebugInfo: React.FC = () => {
  const { user, session, loading, userRole, isAdmin, isManager, isBidder } = useAuth();

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <h3 className="text-sm font-medium text-yellow-800 mb-2">Debug Information</h3>
      <div className="text-xs text-yellow-700 space-y-1">
        <div><strong>Loading:</strong> {loading ? 'true' : 'false'}</div>
        <div><strong>User:</strong> {user ? user.email : 'null'}</div>
        <div><strong>User ID:</strong> {user?.id || 'null'}</div>
        <div><strong>Session:</strong> {session ? 'exists' : 'null'}</div>
        <div><strong>User Role:</strong> {userRole || 'null'}</div>
        <div><strong>Is Admin:</strong> {isAdmin ? 'true' : 'false'}</div>
        <div><strong>Is Manager:</strong> {isManager ? 'true' : 'false'}</div>
        <div><strong>Is Bidder:</strong> {isBidder ? 'true' : 'false'}</div>
      </div>
    </div>
  );
};

export default DebugInfo; 