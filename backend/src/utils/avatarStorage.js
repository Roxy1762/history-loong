const fs = require('fs');
const os = require('os');
const path = require('path');

function ensureWritableDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return dir;
  } catch {
    return null;
  }
}

function resolveAvatarsDir(defaultDir = path.join(__dirname, '../../../data/avatars')) {
  const configured = process.env.AVATARS_DIR || defaultDir;
  const fallback = path.join(os.tmpdir(), 'history-loong', 'avatars');

  const resolved = ensureWritableDir(configured) || ensureWritableDir(fallback);
  if (!resolved) {
    console.error('[Avatar] 无法创建可写头像目录，头像上传功能将不可用');
    return null;
  }

  if (resolved !== configured) {
    console.warn(`[Avatar] 头像目录不可写，已降级到临时目录: ${resolved}`);
  }

  return resolved;
}

module.exports = { resolveAvatarsDir };
