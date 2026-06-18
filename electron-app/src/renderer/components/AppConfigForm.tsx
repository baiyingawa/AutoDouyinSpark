import React, { useState, useCallback } from 'react';
import { Settings, Clock, MessageSquare, Save, AlertCircle, CheckCircle } from 'lucide-react';

export interface AppConfigFormData {
  morningStart: number;
  morningEnd: number;
  eveningStart: number;
  eveningEnd: number;
  messageTemplate: string;
  autoStart: boolean;
  hideBrowser?: boolean;
}

interface AppConfigFormProps {
  initialConfig?: AppConfigFormData | null;
  onSave: (config: AppConfigFormData) => Promise<boolean>;
}

const defaultConfig: AppConfigFormData = {
  morningStart: 1,
  morningEnd: 7,
  eveningStart: 17,
  eveningEnd: 19,
  messageTemplate: '[Auto]火花火花！{time}',
  autoStart: false,
  hideBrowser: true,
};

const AppConfigForm: React.FC<AppConfigFormProps> = ({ initialConfig, onSave }) => {
  const [config, setConfig] = useState<AppConfigFormData>(initialConfig || defaultConfig);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (field: keyof AppConfigFormData, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    try {
      const ok = await onSave(config);
      if (ok) {
        setMessage({ type: 'success', text: '配置已保存' });
      } else {
        setMessage({ type: 'error', text: '保存失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    }
    setSaving(false);
  }, [config, onSave]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Settings size={20} style={{ color: 'var(--accent)' }} />
        <h3 className="text-lg font-semibold text-white">应用配置</h3>
      </div>

      {/* 时间窗口 */}
      <div>
        <label className="block text-sm text-gray-400 mb-2">
          <Clock size={14} className="inline mr-1" />
          早间窗口
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={23}
            className="w-20 px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            value={config.morningStart}
            onChange={(e) => handleChange('morningStart', parseInt(e.target.value) || 1)}
          />
          <span className="text-gray-500">:00 ~</span>
          <input
            type="number"
            min={0}
            max={23}
            className="w-20 px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            value={config.morningEnd}
            onChange={(e) => handleChange('morningEnd', parseInt(e.target.value) || 7)}
          />
          <span className="text-gray-500">:00</span>
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-400 mb-2">
          <Clock size={14} className="inline mr-1" />
          傍晚窗口
        </label>
        <div className="flex items-center gap-3">
          <input
            type="number"
            min={0}
            max={23}
            className="w-20 px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            value={config.eveningStart}
            onChange={(e) => handleChange('eveningStart', parseInt(e.target.value) || 17)}
          />
          <span className="text-gray-500">:00 ~</span>
          <input
            type="number"
            min={0}
            max={23}
            className="w-20 px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
            value={config.eveningEnd}
            onChange={(e) => handleChange('eveningEnd', parseInt(e.target.value) || 19)}
          />
          <span className="text-gray-500">:00</span>
        </div>
      </div>

      {/* 消息模板 */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">
          <MessageSquare size={14} className="inline mr-1" />
          消息模板
        </label>
        <input
          type="text"
          className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
          value={config.messageTemplate}
          onChange={(e) => handleChange('messageTemplate', e.target.value)}
          placeholder="[Auto]火花火花！{time}"
        />
        <p className="mt-1 text-xs text-gray-500">
          使用 {`{time}`} 作为时间占位符，将被替换为当前时间
        </p>
      </div>

      {/* 开机自启 */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="autoStart"
          className="rounded border-gray-700 bg-gray-900 text-blue-500 focus:ring-blue-500"
          checked={config.autoStart}
          onChange={(e) => handleChange('autoStart', e.target.checked)}
        />
        <label htmlFor="autoStart" className="text-sm text-gray-400">
          开机自启
        </label>
      </div>

      {/* 隐藏浏览器 */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="hideBrowser"
          className="rounded border-gray-700 bg-gray-900 text-blue-500 focus:ring-blue-500"
          checked={config.hideBrowser || false}
          onChange={(e) => handleChange('hideBrowser', e.target.checked)}
        />
        <label htmlFor="hideBrowser" className="text-sm text-gray-400">
          隐藏自动浏览器操作（续火花、刷新天数）
        </label>
      </div>

      {/* 消息 */}
      {message && (
        <div className={`p-3 rounded-lg flex items-start gap-2 ${
          message.type === 'success' ? 'bg-green-900/30 border border-green-800/50' : 'bg-red-900/30 border border-red-800/50'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle size={16} className="text-green-400 mt-0.5 shrink-0" />
          ) : (
            <AlertCircle size={16} className="text-red-400 mt-0.5 shrink-0" />
          )}
          <span className={`text-sm ${message.type === 'success' ? 'text-green-300' : 'text-red-300'}`}>
            {message.text}
          </span>
        </div>
      )}

      <button
        className="w-full px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
        style={{ backgroundColor: 'var(--accent)' }}
        onClick={handleSave}
        disabled={saving}
      >
        <Save size={16} />
        {saving ? '保存中...' : '保存配置'}
      </button>
    </div>
  );
};

export default AppConfigForm;
