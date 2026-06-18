import React, { useState, useCallback } from 'react';
import { Mail, Send, AlertCircle, CheckCircle, Loader } from 'lucide-react';

interface EmailConfig {
  email: string;
  auth_code: string;
  smtp_host: string;
  smtp_port: number;
  smtp_use_ssl: boolean;
  alert_recipients: string[];
}

interface EmailConfigFormProps {
  initialConfig?: EmailConfig | null;
  onSave: (config: EmailConfig) => Promise<boolean>;
}

const defaultConfig: EmailConfig = {
  email: '',
  auth_code: '',
  smtp_host: 'smtp.qq.com',
  smtp_port: 465,
  smtp_use_ssl: true,
  alert_recipients: [],
};

const EmailConfigForm: React.FC<EmailConfigFormProps> = ({ initialConfig, onSave }) => {
  const [config, setConfig] = useState<EmailConfig>(initialConfig || defaultConfig);
  const [recipientInput, setRecipientInput] = useState(
    initialConfig?.alert_recipients?.join(', ') || ''
  );
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleChange = (field: keyof EmailConfig, value: any) => {
    setConfig((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = useCallback(async () => {
    setSaving(true);
    setMessage(null);
    const updatedConfig = {
      ...config,
      alert_recipients: recipientInput.split(',').map((s) => s.trim()).filter(Boolean),
    };
    try {
      const ok = await onSave(updatedConfig);
      if (ok) {
        setMessage({ type: 'success', text: '配置已保存' });
        setConfig(updatedConfig);
      } else {
        setMessage({ type: 'error', text: '保存失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    }
    setSaving(false);
  }, [config, recipientInput, onSave]);

  const handleTest = useCallback(async () => {
    setTesting(true);
    setMessage(null);
    try {
      const testConfig = {
        ...config,
        alert_recipients: recipientInput.split(',').map((s) => s.trim()).filter(Boolean),
        test_subject: 'AutoDouyinSpark 测试邮件',
        test_body: `这是一封测试邮件，发送时间: ${new Date().toLocaleString()}`,
      };
      // 通过 IPC 调用 Python email-test
      const result = await window.electronAPI.sendTestEmail(JSON.stringify(testConfig));
      if (result?.success) {
        setMessage({ type: 'success', text: '测试邮件发送成功' });
      } else {
        setMessage({ type: 'error', text: result?.error || '测试邮件发送失败' });
      }
    } catch (err) {
      setMessage({ type: 'error', text: String(err) });
    }
    setTesting(false);
  }, [config, recipientInput]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Mail size={20} style={{ color: 'var(--accent)' }} />
        <h3 className="text-lg font-semibold text-white">邮箱配置</h3>
      </div>

      {/* SMTP 服务器 */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">SMTP 服务器</label>
        <input
          type="text"
          className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
          value={config.smtp_host}
          onChange={(e) => handleChange('smtp_host', e.target.value)}
          placeholder="smtp.qq.com"
        />
      </div>

      {/* SMTP 端口 */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">SMTP 端口</label>
        <input
          type="number"
          className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
          value={config.smtp_port}
          onChange={(e) => handleChange('smtp_port', parseInt(e.target.value) || 465)}
        />
      </div>

      {/* SSL */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="smtp_use_ssl"
          className="rounded border-gray-700 bg-gray-900 text-blue-500 focus:ring-blue-500"
          checked={config.smtp_use_ssl}
          onChange={(e) => handleChange('smtp_use_ssl', e.target.checked)}
        />
        <label htmlFor="smtp_use_ssl" className="text-sm text-gray-400">
          使用 SSL 连接
        </label>
      </div>

      {/* 邮箱地址 */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">发件邮箱</label>
        <input
          type="email"
          className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
          value={config.email}
          onChange={(e) => handleChange('email', e.target.value)}
          placeholder="your@email.com"
        />
      </div>

      {/* 授权码 */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">授权码</label>
        <input
          type="password"
          className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
          value={config.auth_code}
          onChange={(e) => handleChange('auth_code', e.target.value)}
          placeholder="SMTP 授权码"
        />
      </div>

      {/* 收件人 */}
      <div>
        <label className="block text-sm text-gray-400 mb-1">收件人（多个用逗号分隔）</label>
        <input
          type="text"
          className="w-full px-3 py-2 rounded-lg border border-gray-700 bg-gray-900 text-gray-200 text-sm focus:outline-none focus:border-blue-500"
          value={recipientInput}
          onChange={(e) => setRecipientInput(e.target.value)}
          placeholder="user1@email.com, user2@email.com"
        />
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

      {/* 按钮 */}
      <div className="flex gap-3">
        <button
          className="flex-1 px-4 py-2 rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
          style={{ backgroundColor: 'var(--accent)' }}
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? <Loader size={16} className="animate-spin" /> : null}
          {saving ? '保存中...' : '保存配置'}
        </button>
        <button
          className="px-4 py-2 rounded-lg text-sm text-gray-300 border border-gray-700 hover:bg-gray-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          onClick={handleTest}
          disabled={testing || !config.email}
        >
          {testing ? <Loader size={16} className="animate-spin" /> : <Send size={16} />}
          {testing ? '发送中...' : '测试邮件'}
        </button>
      </div>
    </div>
  );
};

export default EmailConfigForm;
