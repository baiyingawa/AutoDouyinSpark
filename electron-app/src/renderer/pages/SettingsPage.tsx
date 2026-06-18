import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Mail, Sliders } from 'lucide-react';
import EmailConfigForm from '../components/EmailConfigForm';
import AppConfigForm from '../components/AppConfigForm';

type SettingsTab = 'email' | 'app';

const SettingsPage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('email');
  const [emailConfig, setEmailConfig] = useState<any>(null);
  const [appConfig, setAppConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // 加载配置
  useEffect(() => {
    const loadSettings = async () => {
      setLoading(true);
      try {
        const [emailResult, appResult] = await Promise.all([
          window.electronAPI.settingsLoadEmail(),
          window.electronAPI.settingsLoadApp(),
        ]);
        if (emailResult.success) setEmailConfig(emailResult.config);
        if (appResult.success) setAppConfig(appResult.config);
      } catch {
        // 忽略
      }
      setLoading(false);
    };
    loadSettings();
  }, []);

  // 保存邮箱配置
  const handleSaveEmail = useCallback(async (config: any): Promise<boolean> => {
    try {
      const result = await window.electronAPI.settingsSaveEmail(config);
      return result.success;
    } catch {
      return false;
    }
  }, []);

  // 保存应用配置
  const handleSaveApp = useCallback(async (config: any): Promise<boolean> => {
    try {
      // 先保存 spark_config.json
      const saveResult = await window.electronAPI.settingsSaveApp(config);
      if (!saveResult.success) return false;
      // 再设置开机自启
      const autoStartResult = await window.electronAPI.settingsSetAutoStart(!!config.autoStart);
      return autoStartResult.success;
    } catch {
      return false;
    }
  }, []);

  const tabs = [
    { id: 'email' as SettingsTab, icon: Mail, label: '邮箱配置' },
    { id: 'app' as SettingsTab, icon: Sliders, label: '应用配置' },
  ];

  return (
    <div className="w-full space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <Settings size={24} style={{ color: 'var(--accent)' }} />
        <h1 className="text-2xl font-bold text-white">设置</h1>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 p-1 rounded-lg border border-gray-700/50 inline-flex"
        style={{ backgroundColor: 'var(--bg-secondary)' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
            style={activeTab === tab.id ? { backgroundColor: 'var(--accent)' } : {}}
            onClick={() => setActiveTab(tab.id)}
          >
            <tab.icon size={16} />
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 内容 */}
      <div
        className="p-6 rounded-lg border border-gray-700/50"
        style={{ backgroundColor: 'var(--bg-secondary)' }}
      >
        {loading ? (
          <div className="text-center py-8">
            <p className="text-gray-500">加载中...</p>
          </div>
        ) : (
          <>
            {activeTab === 'email' && (
              <EmailConfigForm
                initialConfig={emailConfig}
                onSave={handleSaveEmail}
              />
            )}
            {activeTab === 'app' && (
              <AppConfigForm
                initialConfig={appConfig}
                onSave={handleSaveApp}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default SettingsPage;
