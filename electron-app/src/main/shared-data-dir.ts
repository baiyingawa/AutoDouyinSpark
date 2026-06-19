/**
 * shared-data-dir.ts - 统一状态文件路径
 *
 * 所有实例（计划任务/开发版/发行版）共用同一个数据目录：
 * %APPDATA%\AutoDouyinSpark\data\
 *
 * 这样无论哪个实例发送了火花，别的实例都知道"今天已经发了"，
 * 不会重复发送。
 */
import path from 'path';

export function getSharedDataDir(): string {
  const appData = process.env.APPDATA || '';
  return path.join(appData, 'AutoDouyinSpark', 'data');
}
