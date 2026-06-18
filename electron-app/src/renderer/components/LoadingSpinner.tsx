import React from 'react';
import { Sparkles } from 'lucide-react';

interface LoadingSpinnerProps {
  size?: number;
  message?: string;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 32, message }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-8">
      <Sparkles
        size={size}
        className="animate-pulse"
        style={{ color: 'var(--accent)' }}
      />
      {message && (
        <p className="text-sm text-gray-500">{message}</p>
      )}
    </div>
  );
};

export default LoadingSpinner;
