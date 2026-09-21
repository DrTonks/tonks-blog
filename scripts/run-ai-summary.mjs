import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { parseArgs, runSummaries } from './ai-summary.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
try {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log('pnpm ai:summary [--slug <文章标识>] [--force]\n默认仅补全非 draft、非加密文章的缺失摘要。--force 仅针对指定文章，允许草稿/加密文章并覆盖已有摘要。');
  } else {
    // Explicit environment wins, .env.local overrides .env. Never PUBLIC_ keys.
    const original = { ...process.env };
    for (const name of ['.env.local', '.env']) if (existsSync(join(root, name))) process.loadEnvFile(join(root, name));
    Object.assign(process.env, original);
    await runSummaries(root, options);
  }
} catch (error) {
  console.error(`[ai:summary] ${error.message}`);
  process.exitCode = 1;
}
