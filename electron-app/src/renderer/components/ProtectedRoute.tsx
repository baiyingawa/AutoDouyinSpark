import React, { useState, useEffect } from 'react';
import { Navigate } from 'react-router-dom';
import LoadingSpinner from './LoadingSpinner';

interface ProtectedRouteProps {
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

/**
 * 检查登录状态，未登录时重定向到 /login
 */
const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, fallback }) => {
  const [checking, setChecking] = useState(true);
  const [valid, setValid] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const result = await window.electronAPI.authCheckStatus();
        if (!cancelled) {
          setValid(result.valid === true);
        }
      } catch {
        if (!cancelled) setValid(false);
      }
      if (!cancelled) setChecking(false);
    };
    check();
    return () => { cancelled = true; };
  }, []);

  if (checking) {
    return fallback ? <>{fallback}</> : (
      <div className="flex items-center justify-center h-full">
        <LoadingSpinner message="检查登录状态..." />
      </div>
    );
  }

  if (!valid) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;
