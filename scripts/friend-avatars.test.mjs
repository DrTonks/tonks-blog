import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { scanFriendAvatars, resolveFriendAvatar, reportFriendAvatars } from './friend-avatars.mjs';

async function fixture(fn) {
  const root = await mkdtemp(join(tmpdir(), 'friend-avatars-'));
  try { await fn(root); } finally { await rm(root, { recursive: true, force: true }); }
}

test('missing directory retains remote URL and only warns', () => fixture(async root => {
  const friend = { name: '新增友链', avatar: 'https://example.com/avatar.png' };
  const avatars = await scanFriendAvatars(root);
  assert.equal(resolveFriendAvatar(friend, avatars), friend.avatar);
  await mkdir(join(root, 'src/data'), { recursive: true });
  await writeFile(join(root, 'src/data/friends.ts'), 'export const friendsData = ' + JSON.stringify([friend]));
  const messages = [];
  await reportFriendAvatars(root, { warn: message => messages.push(message), info: message => messages.push(message) });
  assert.ok(messages.some(message => message.includes('新增友链.png')));
}));

test('exact names, mixed extensions and URL encoding share the same resolution', () => fixture(async root => {
  const dir = join(root, 'public/images/friends');
  await mkdir(dir, { recursive: true });
  for (const name of ['中文 #头像.PNG', 'Tonks Home.jpg', 'not-an-image.txt', 'Other.webp']) await writeFile(join(dir, name), 'fixture');
  await mkdir(join(dir, 'Fake.png'));
  const avatars = await scanFriendAvatars(root);
  assert.equal(avatars.size, 3);
  assert.equal(resolveFriendAvatar({ name: '中文 #头像', avatar: 'remote' }, avatars), '/images/friends/' + encodeURIComponent('中文 #头像.PNG'));
  assert.equal(resolveFriendAvatar({ name: 'Tonks Home', avatar: 'remote' }, avatars), '/images/friends/Tonks%20Home.jpg');
  assert.equal(resolveFriendAvatar({ name: 'tonks home', avatar: 'remote' }, avatars), 'remote');
}));

test('duplicate formats select a stable priority and emit an advisory', () => fixture(async root => {
  const dir = join(root, 'public/images/friends');
  await mkdir(dir, { recursive: true });
  await mkdir(join(root, 'src/data'), { recursive: true });
  for (const name of ['Name.jpg', 'Name.webp']) await writeFile(join(dir, name), 'fixture');
  await writeFile(join(root, 'src/data/friends.ts'), 'export const friendsData = ' + JSON.stringify([{name:'Name',avatar:'remote'}]));
  const avatars = await scanFriendAvatars(root);
  assert.equal(resolveFriendAvatar({name:'Name'}, avatars), '/images/friends/Name.webp');
  const messages=[];
  await reportFriendAvatars(root,{warn: m => messages.push(m), info: m => messages.push(m)});
  assert.ok(messages.some(m => m.includes('多个文件')));
}));

test('advisory read failures do not reject or set a failing exit code', () => fixture(async root => {
  const exitCode = process.exitCode;
  const messages=[];
  await reportFriendAvatars(root,{warn: m => messages.push(m)});
  assert.equal(process.exitCode, exitCode);
  assert.ok(messages.some(m => m.includes('继续后续流程')));
}));
