import { readdir, readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';

export const avatarDirectory = 'public/images/friends';
const extensions = ['.webp', '.avif', '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.bmp'];

/** Shared by the page and the advisory build report. No network requests. */
export async function scanFriendAvatars(root) {
  let entries;
  try { entries = await readdir(join(root, avatarDirectory), { withFileTypes: true }); }
  catch (error) { if (error.code === 'ENOENT') return new Map(); throw error; }
  const avatars = new Map();
  for (const entry of entries.filter(entry => entry.isFile()).sort((a, b) => {
    const rank = extensions.indexOf(extname(a.name).toLowerCase()) - extensions.indexOf(extname(b.name).toLowerCase());
    return rank || a.name.localeCompare(b.name, 'en');
  })) {
    const extension = extname(entry.name);
    if (!extensions.includes(extension.toLowerCase())) continue;
    const name = entry.name.slice(0, -extension.length);
    const files = avatars.get(name) || [];
    files.push(entry.name);
    avatars.set(name, files);
  }
  return avatars;
}

export function resolveFriendAvatar(friend, avatars) {
  const file = avatars.get(friend.name)?.[0];
  return file ? `/images/friends/${encodeURIComponent(file)}` : friend.avatar;
}

export async function reportFriendAvatars(root, log = console) {
  try {
    const friends = JSON.parse(await readFile(join(root, 'public/data/friends.json'), 'utf8'));
    const avatars = await scanFriendAvatars(root);
    const missing = friends.filter(friend => !avatars.has(friend.name));
    if (missing.length) {
      log.warn(`[友链头像] ${missing.length} 个缺少本地头像，页面将使用原链接；不影响构建或部署。`);
      for (const friend of missing) log.warn(`  请添加：${avatarDirectory}/${friend.name}.png（也支持 jpg、webp、svg 等）`);
    } else log.info(`[友链头像] ${friends.length} 个友链均已有本地头像。`);
    for (const friend of friends) {
      const files = avatars.get(friend.name);
      if (files?.length > 1) log.warn(`[友链头像] ${friend.name} 有多个文件，使用 ${files[0]}；建议每个 name 只保留一个。`);
    }
  } catch (error) {
    log.warn(`[友链头像] 无法完成提醒检查：${error.message}；继续后续流程。`);
  }
}
