import React, { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import TitleBar from './components/TitleBar';
import StatusBar from './components/StatusBar';
import LogPanel from './components/LogPanel';
import ProtectedRoute from './components/ProtectedRoute';
import AutoStartPrompt from './components/AutoStartPrompt';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import FriendsPage from './pages/FriendsPage';
import HistoryPage from './pages/HistoryPage';
import SettingsPage from './pages/SettingsPage';

const App: React.FC = () => {
  const [showAutoStartPrompt, setShowAutoStartPrompt] = useState(false);

  useEffect(() => {
    // 监听主进程发来的开机自启弹窗事件
    const cleanup = window.electronAPI.onPromptAutoStart(() => {
      setShowAutoStartPrompt(true);
    });
    return cleanup;
  }, []);

  return (
    <HashRouter>
      <div className="flex flex-col h-screen">
        <TitleBar />
        <div className="flex flex-1 overflow-hidden">
          <Routes>
            <Route element={<Layout />}>
              <Route
                path="/"
                element={
                  <ProtectedRoute>
                    <DashboardPage />
                  </ProtectedRoute>
                }
              />
              <Route path="/login" element={<LoginPage />} />
              <Route
                path="/friends"
                element={
                  <ProtectedRoute>
                    <FriendsPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/history"
                element={
                  <ProtectedRoute>
                    <HistoryPage />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/settings"
                element={
                  <ProtectedRoute>
                    <SettingsPage />
                  </ProtectedRoute>
                }
              />
            </Route>
          </Routes>
        </div>
        <LogPanel />
        <StatusBar />

        {showAutoStartPrompt && (
          <AutoStartPrompt onClose={() => setShowAutoStartPrompt(false)} />
        )}
      </div>
    </HashRouter>
  );
};

export default App;
