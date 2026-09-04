/**
 * 多账户数据目录管理。
 * 根目录只保存账户索引；每个账户目录独立保存 Cookie、好友、历史、截图和火花状态。
 */
import fs from 'fs';
import path from 'path';

export interface LocalProfile {
  id: string;
  name: string;
  note: string;
  douyinId?: string;
  avatarFile?: string;
  hidden?: boolean;
  paused?: boolean;
  createdAt: string;
  active: boolean;
  hasCookie: boolean;
}

const appData = process.env.APPDATA || '';
const DATA_ROOT = path.join(appData, 'AutoDouyinSpark', 'data');
const PROFILES_DIR = path.join(DATA_ROOT, 'users');
const ACTIVE_PROFILE_FILE = path.join(DATA_ROOT, '.active_profile');
const DEFAULT_PROFILE_ID = 'default';
const LEGACY_ITEMS = [
  'spark_config.json', 'cookie_export.json', 'email_config.json',
  '.spark_state', '.spark_streak', '.spark_log', '.spark_days_cache',
  '.spark_days_history', '.spark_send_history', '.spark_failed_users',
  '.spark_confirm', '.spark_login_check', '.spark_avatars',
  'avatars', 'screenshots', 'history_backups',
];

function isValidProfileId(id: string): boolean {
  return /^[a-zA-Z0-9_-]{1,64}$/.test(id);
}

function ensureStorage(): void {
  fs.mkdirSync(PROFILES_DIR, { recursive: true });
  let activeId = '';
  try { activeId = fs.readFileSync(ACTIVE_PROFILE_FILE, 'utf8').trim(); } catch {}

  const profileDirs = fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidProfileId(entry.name))
    .map((entry) => entry.name);

  if (!profileDirs.length) {
    const defaultDir = path.join(PROFILES_DIR, DEFAULT_PROFILE_ID);
    fs.mkdirSync(defaultDir, { recursive: true });
    // 首次升级时复制旧版共享目录到默认账户，保留原文件作为迁移来源。
    for (const item of LEGACY_ITEMS) {
      const source = path.join(DATA_ROOT, item);
      const target = path.join(defaultDir, item);
      if (!fs.existsSync(source) || fs.existsSync(target)) continue;
      try {
        fs.cpSync(source, target, { recursive: true });
      } catch (error) {
        console.error('[Profiles] 迁移旧数据失败:', item, error);
      }
    }
    writeProfileMeta(DEFAULT_PROFILE_ID, '默认账户');
    activeId = DEFAULT_PROFILE_ID;
  } else if (!isValidProfileId(activeId) || !profileDirs.includes(activeId)) {
    activeId = profileDirs[0];
  }
  fs.writeFileSync(ACTIVE_PROFILE_FILE, `${activeId}\n`, 'utf8');
}

function readProfileMeta(id: string): { name: string; note: string; createdAt: string; douyinId?: string; avatarFile?: string; hidden?: boolean; paused?: boolean } {
  const metaPath = path.join(PROFILES_DIR, id, 'profile.json');
  try {
    const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    return {
      name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : id,
      note: typeof raw.note === 'string' ? raw.note : '',
      douyinId: typeof raw.douyinId === 'string' ? raw.douyinId : undefined,
      avatarFile: typeof raw.avatarFile === 'string' ? raw.avatarFile : undefined,
      hidden: raw.hidden === true,
      paused: raw.paused === true,
      createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : new Date().toISOString(),
    };
  } catch {
    return { name: id === DEFAULT_PROFILE_ID ? '默认账户' : id, note: '', createdAt: new Date().toISOString() };
  }
}

function writeProfileMeta(id: string, name: string): void {
  const profileDir = path.join(PROFILES_DIR, id);
  fs.mkdirSync(profileDir, { recursive: true });
  const metaPath = path.join(profileDir, 'profile.json');
  if (fs.existsSync(metaPath)) return;
  fs.writeFileSync(metaPath, JSON.stringify({ id, name, createdAt: new Date().toISOString() }, null, 2), 'utf8');
}

export function getDataRootDir(): string {
  ensureStorage();
  return DATA_ROOT;
}

export function getActiveProfileId(): string {
  ensureStorage();
  const id = fs.readFileSync(ACTIVE_PROFILE_FILE, 'utf8').trim();
  return isValidProfileId(id) ? id : DEFAULT_PROFILE_ID;
}

export function getSharedDataDir(): string {
  return path.join(getDataRootDir(), 'users', getActiveProfileId());
}

export function listProfiles(): LocalProfile[] {
  ensureStorage();
  const activeId = getActiveProfileId();
  return fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidProfileId(entry.name))
    .map((entry) => {
      const id = entry.name;
      const meta = readProfileMeta(id);
      writeProfileMeta(id, meta.name);
      return {
        id,
        name: meta.name,
        note: meta.note,
        douyinId: meta.douyinId,
        avatarFile: meta.avatarFile,
        hidden: meta.hidden,
        paused: meta.paused,
        createdAt: meta.createdAt,
        active: id === activeId,
        hasCookie: fs.existsSync(path.join(PROFILES_DIR, id, 'cookie_export.json')),
      };
    })
    .filter((profile) => !profile.hidden)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function createProfile(name: string): LocalProfile {
  ensureStorage();
  const displayName = name.trim() || `账户 ${listProfiles().length + 1}`;
  const id = `profile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  writeProfileMeta(id, displayName);
  return listProfiles().find((profile) => profile.id === id)!;
}

export function switchProfile(id: string): LocalProfile {
  ensureStorage();
  if (!isValidProfileId(id) || !fs.existsSync(path.join(PROFILES_DIR, id))) {
    throw new Error('账户不存在');
  }
  fs.writeFileSync(ACTIVE_PROFILE_FILE, `${id}\n`, 'utf8');
  return listProfiles().find((profile) => profile.id === id)!;
}

export function updateProfile(id: string, name: string, note: string): LocalProfile {
  ensureStorage();
  if (!isValidProfileId(id) || !fs.existsSync(path.join(PROFILES_DIR, id))) {
    throw new Error('账户不存在');
  }
  const current = readProfileMeta(id);
  const nextName = name.trim().slice(0, 80) || current.name;
  const nextNote = note.trim().slice(0, 200);
  fs.writeFileSync(path.join(PROFILES_DIR, id, 'profile.json'), JSON.stringify({
    id, name: nextName, note: nextNote, createdAt: current.createdAt,
    douyinId: current.douyinId, avatarFile: current.avatarFile,
    paused: current.paused,
  }, null, 2), 'utf8');
  return listProfiles().find((profile) => profile.id === id)!;
}

export function updateProfileIdentity(id: string, identity: { name?: string; douyinId?: string; avatarFile?: string }): LocalProfile {
  ensureStorage();
  if (!isValidProfileId(id) || !fs.existsSync(path.join(PROFILES_DIR, id))) throw new Error('账户不存在');
  const current = readProfileMeta(id);
  const nextName = identity.name?.trim().slice(0, 80) || current.name;
  fs.writeFileSync(path.join(PROFILES_DIR, id, 'profile.json'), JSON.stringify({
    id, name: nextName, note: current.note || nextName, createdAt: current.createdAt,
    douyinId: identity.douyinId || current.douyinId, avatarFile: identity.avatarFile || current.avatarFile,
    paused: current.paused,
  }, null, 2), 'utf8');
  return listProfiles().find((profile) => profile.id === id)!;
}

export function deleteProfile(id: string): LocalProfile {
  ensureStorage();
  const profiles = listProfiles();
  if (!isValidProfileId(id) || !profiles.some((profile) => profile.id === id)) {
    throw new Error('账户不存在');
  }
  if (profiles.length <= 1) throw new Error('至少保留一个账户');
  const wasActive = getActiveProfileId() === id;
  const profileDir = path.join(PROFILES_DIR, id);
  // 删除账户只移除登录凭据并隐藏账户，好友/历史/火花数据留在原目录，便于同一抖音号重新导入后恢复。
  try { fs.rmSync(path.join(profileDir, 'cookie_export.json'), { force: true }); } catch {}
  const current = readProfileMeta(id);
  fs.writeFileSync(path.join(profileDir, 'profile.json'), JSON.stringify({
    id, name: current.name, note: current.note, createdAt: current.createdAt,
    douyinId: current.douyinId, avatarFile: current.avatarFile, hidden: true,
    paused: current.paused,
  }, null, 2), 'utf8');
  if (wasActive) {
    const next = listProfiles()[0];
    fs.writeFileSync(ACTIVE_PROFILE_FILE, `${next.id}\n`, 'utf8');
    return listProfiles().find((profile) => profile.id === next.id)!;
  }
  return listProfiles().find((profile) => profile.active)!;
}

export function restoreProfileByDouyinId(douyinId: string, name?: string, avatarFile?: string): LocalProfile | null {
  ensureStorage();
  const match = fs.readdirSync(PROFILES_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && isValidProfileId(entry.name))
    .map((entry) => ({ id: entry.name, meta: readProfileMeta(entry.name) }))
    .find(({ meta }) => meta.hidden === true && meta.douyinId === douyinId);
  if (!match) return null;
  const activeId = getActiveProfileId();
  const sourceCookie = path.join(PROFILES_DIR, activeId, 'cookie_export.json');
  const targetDir = path.join(PROFILES_DIR, match.id);
  if (fs.existsSync(sourceCookie) && activeId !== match.id) fs.copyFileSync(sourceCookie, path.join(targetDir, 'cookie_export.json'));
  if (activeId !== match.id) {
    try { fs.rmSync(sourceCookie, { force: true }); } catch {}
  }
  const meta = match.meta;
  fs.writeFileSync(path.join(targetDir, 'profile.json'), JSON.stringify({
    id: match.id, name: name?.trim().slice(0, 80) || meta.name, note: meta.note || name || meta.name,
    createdAt: meta.createdAt, douyinId, avatarFile: avatarFile || meta.avatarFile, hidden: false, paused: false,
  }, null, 2), 'utf8');
  fs.writeFileSync(ACTIVE_PROFILE_FILE, `${match.id}\n`, 'utf8');
  return listProfiles().find((profile) => profile.id === match.id) || null;
}

export function setProfilePaused(id: string, paused: boolean): LocalProfile {
  ensureStorage();
  if (!isValidProfileId(id) || !fs.existsSync(path.join(PROFILES_DIR, id))) throw new Error('账户不存在');
  const current = readProfileMeta(id);
  fs.writeFileSync(path.join(PROFILES_DIR, id, 'profile.json'), JSON.stringify({
    id, name: current.name, note: current.note, createdAt: current.createdAt,
    douyinId: current.douyinId, avatarFile: current.avatarFile, hidden: current.hidden === true, paused: Boolean(paused),
  }, null, 2), 'utf8');
  return listProfiles().find((profile) => profile.id === id)!;
}

export function getProfileDir(id: string): string {
  ensureStorage();
  if (!isValidProfileId(id) || !fs.existsSync(path.join(PROFILES_DIR, id))) {
    throw new Error('账户不存在');
  }
  return path.join(PROFILES_DIR, id);
}

/** 兼容旧调用方：返回当前账户目录，不再返回所有账户共用目录。 */
export function getSharedDataRootDir(): string {
  return getDataRootDir();
}
