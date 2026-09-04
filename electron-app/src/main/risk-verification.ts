import { dialog } from 'electron';
import { pythonEngine } from './python-engine';

let verificationInProgress: Promise<boolean> | null = null;

/** 检测到验证码中转页时统一提醒；确认后打开可见浏览器等待页面恢复。 */
export async function promptRiskVerification(dataDir?: string): Promise<boolean> {
  if (verificationInProgress) return verificationInProgress;
  verificationInProgress = (async () => {
    const prompt = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['确定'],
      defaultId: 0,
      title: '需要完成验证',
      message: '检测到验证码中转页，请点击“确定”打开抖音浏览器完成验证。',
      detail: '验证页面恢复正常后，浏览器会自动关闭。',
    });
    if (prompt.response !== 0) return false;
    const result = await pythonEngine.riskVerify(dataDir);
    return result?.success === true && result?.verified === true;
  })().finally(() => {
    verificationInProgress = null;
  });
  return verificationInProgress;
}
