/**
 * AutoDouyinSpark GitHub Release 加速下载代理服务器
 *
 * 部署到 www.uu233.xyz 使用：
 *   pm2 start proxy-server.js --name autospark-proxy
 *
 * 功能：
 *   1. /api/check-update    → 返回最新版本信息
 *   2. /api/download-latest → 返回 .exe 安装包（从 GitHub 缓存）
 */

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

const PORT = process.env.PORT || 3000;
const GITHUB_REPO = 'baiyingawa/AutoDouyinSpark';
const CACHE_DIR = path.join(__dirname, 'cache');
const METADATA_FILE = path.join(CACHE_DIR, 'release.json');
const GITHUB_TOKEN = process.env.GITHUB_TOKEN || '';  // 可选，提高 API 限流

// 确保缓存目录存在
fs.mkdirSync(CACHE_DIR, { recursive: true });

const app = express();

// ============ 工具函数 ============

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const opts = { headers: { 'User-Agent': 'AutoDouyinSpark-Proxy/1.0' } };
    if (GITHUB_TOKEN) opts.headers['Authorization'] = `Bearer ${GITHUB_TOKEN}`;
    https.get(url, opts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { reject(new Error(`JSON parse failed: ${data.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

/** 从 GitHub 获取最新 release 信息 */
async function getLatestRelease() {
  const release = await fetchJSON(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`);
  const asset = (release.assets || []).find(a => a.name.endsWith('.exe'));
  return {
    tag: release.tag_name,
    published_at: release.published_at,  // ISO 8601
    exe_name: asset ? asset.name : null,
    exe_url: asset ? asset.browser_download_url : null,
    exe_size: asset ? asset.size : 0,
    download_count: asset ? asset.download_count : 0,
  };
}

/** 本地已缓存的元数据 */
function getCachedMeta() {
  try {
    if (fs.existsSync(METADATA_FILE)) {
      return JSON.parse(fs.readFileSync(METADATA_FILE, 'utf-8'));
    }
  } catch {}
  return null;
}

/** 下载文件并缓存 */
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath);
    https.get(url, { headers: { 'User-Agent': 'AutoDouyinSpark-Proxy/1.0' } }, (res) => {
      res.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      fs.unlink(destPath, () => {});
      reject(err);
    });
  });
}

/** 确保本地缓存是最新版本 */
async function ensureLatest() {
  const remote = await getLatestRelease();
  const cached = getCachedMeta();

  const localPath = path.join(CACHE_DIR, remote.exe_name || 'AutoDouyinSpark.Setup.exe');

  // 比较版本 tag，如果一致且文件存在则跳过下载
  if (cached && cached.tag === remote.tag && fs.existsSync(localPath)) {
    console.log(`[proxy] 已是最新: ${remote.tag}`);
    return { ...remote, local_path: localPath, cached: true };
  }

  // 需要下载
  console.log(`[proxy] 下载最新: ${remote.tag} (${remote.exe_name})`);
  await downloadFile(remote.exe_url, localPath);

  // 写入元数据
  const meta = { tag: remote.tag, published_at: remote.published_at, exe_name: remote.exe_name, downloaded_at: new Date().toISOString() };
  fs.writeFileSync(METADATA_FILE, JSON.stringify(meta, null, 2));

  console.log(`[proxy] 下载完成: ${localPath}`);
  return { ...remote, local_path: localPath, cached: false };
}

// ============ API 路由 ============

/** 健康检查 */
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', repo: GITHUB_REPO });
});

/** 检查更新：返回最新版本信息和本地缓存状态 */
app.get('/api/check-update', async (req, res) => {
  try {
    const remote = await getLatestRelease();
    const cached = getCachedMeta();
    const localPath = path.join(CACHE_DIR, remote.exe_name || 'AutoDouyinSpark.Setup.exe');
    const serverHas = cached && cached.tag === remote.tag && fs.existsSync(localPath);

    res.json({
      latest_version: remote.tag,
      published_at: remote.published_at,
      exe_name: remote.exe_name,
      exe_size: remote.exe_size,
      download_count: remote.download_count,
      server_has: !!serverHas,
      server_cached_at: cached ? cached.downloaded_at : null,
    });
  } catch (err) {
    console.error('[proxy] check-update error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/** 加速下载最新版本（自动从 GitHub 同步） */
app.get('/api/download-latest', async (req, res) => {
  try {
    const result = await ensureLatest();
    const exePath = result.local_path;

    if (!fs.existsSync(exePath)) {
      return res.status(404).json({ error: '文件未就绪' });
    }

    const stat = fs.statSync(exePath);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${result.exe_name}"`);
    res.setHeader('Content-Length', stat.size);
    res.setHeader('X-Release-Tag', result.tag);
    res.setHeader('X-Cached', String(result.cached));

    const stream = fs.createReadStream(exePath);
    stream.pipe(res);

    stream.on('error', () => {
      if (!res.headersSent) res.status(500).end();
    });
  } catch (err) {
    console.error('[proxy] download-latest error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ============ 启动 ============

app.listen(PORT, () => {
  console.log(`[AutoSparkProxy] 启动: http://0.0.0.0:${PORT}`);
  console.log(`  check-update    → GET /api/check-update`);
  console.log(`  download-latest → GET /api/download-latest`);
});
