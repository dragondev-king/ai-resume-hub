import React from 'react';
import { AlertTriangle, CheckCircle, XCircle } from 'lucide-react';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  isLoading?: boolean;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Yes',
  cancelText = 'No',
  type = 'warning',
  isLoading = false,
}) => {
  if (!isOpen) return null;

  const getIcon = () => {
    switch (type) {
      case 'danger':
        return <XCircle className="w-6 h-6 text-red-600" />;
      case 'warning':
        return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
      case 'info':
        return <CheckCircle className="w-6 h-6 text-blue-600" />;
      default:
        return <AlertTriangle className="w-6 h-6 text-yellow-600" />;
    }
  };

  const getButtonStyles = () => {
    switch (type) {
      case 'danger':
        return {
          confirm: 'bg-red-600 hover:bg-red-700 focus:ring-red-500',
          cancel: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
        };
      case 'warning':
        return {
          confirm: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
          cancel: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
        };
      case 'info':
        return {
          confirm: 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500',
          cancel: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
        };
      default:
        return {
          confirm: 'bg-yellow-600 hover:bg-yellow-700 focus:ring-yellow-500',
          cancel: 'bg-gray-100 text-gray-700 hover:bg-gray-200 focus:ring-gray-500',
        };
    }
  };

  const buttonStyles = getButtonStyles();

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-md w-full">
        <div className="p-6">
          {/* Header */}
          <div className="flex items-center space-x-3 mb-4">
            {getIcon()}
            <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          </div>

          {/* Message */}
          <div className="mb-6">
            <p className="text-gray-600">{message}</p>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end space-x-3">
            <button
              onClick={onClose}
              disabled={isLoading}
              className={`px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonStyles.cancel} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {cancelText}
            </button>
            <button
              onClick={onConfirm}
              disabled={isLoading}
              className={`px-4 py-2 text-sm font-medium text-white rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${buttonStyles.confirm} disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isLoading ? (
                <div className="flex items-center space-x-2">
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Loading...</span>
                </div>
              ) : (
                confirmText
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal; 