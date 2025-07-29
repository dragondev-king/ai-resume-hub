import React from 'react';
import { useAuth } from '../contexts/AuthContext';

const DebugInfo: React.FC = () => {
  const { user, loading, userRole, isAdmin, isManager, isBidder } = useAuth();

  return (
    <div className="mb-4 p-4 bg-gray-100 rounded-lg text-xs">
      <h3 className="font-bold mb-2">Debug Info:</h3>
      <div className="space-y-1">
        <div><strong>Loading:</strong> {loading ? 'true' : 'false'}</div>
        <div><strong>User:</strong> {user ? `${user.email} (${user.id.slice(0, 8)}...)` : 'null'}</div>
        <div><strong>Role:</strong> {userRole || 'null'}</div>
        <div><strong>isAdmin:</strong> {isAdmin ? 'true' : 'false'}</div>
        <div><strong>isManager:</strong> {isManager ? 'true' : 'false'}</div>
        <div><strong>isBidder:</strong> {isBidder ? 'true' : 'false'}</div>
        <div><strong>URL:</strong> {window.location.href}</div>
        <div><strong>Pathname:</strong> {window.location.pathname}</div>
        <div><strong>Hash:</strong> {window.location.hash}</div>
      </div>
    </div>
  );
};

export default DebugInfo; 