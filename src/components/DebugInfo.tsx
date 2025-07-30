import React from 'react';
import { useUser } from '../contexts/UserContext';

const DebugInfo: React.FC = () => {
  const { user, role } = useUser();

  return (
    <div className="mb-4 p-4 bg-gray-100 rounded-lg text-xs">
      <h3 className="font-bold mb-2">Debug Info:</h3>
      <div className="space-y-1">
        <div><strong>User:</strong> {user ? `${user.email} (${user.id.slice(0, 8)}...)` : 'null'}</div>
        <div><strong>Role:</strong> {role || 'null'}</div>
        <div><strong>URL:</strong> {window.location.href}</div>
        <div><strong>Pathname:</strong> {window.location.pathname}</div>
        <div><strong>Hash:</strong> {window.location.hash}</div>
      </div>
    </div>
  );
};

export default DebugInfo; 