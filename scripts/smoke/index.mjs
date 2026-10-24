// 端到端冒烟测试：自动启动带插件的 Chrome（全新 profile），验证
// 共享需求库、弹窗 Tab 记忆、系统/需求管理、筛选、DNR 同步与旧配置重置备份。
// 用法：node scripts/smoke/index.mjs   （自动探测系统 Chrome，可用 CHROME_PATH 覆盖）
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import {
  extensionId,
  launchChrome,
  openPage,
  resolveChromePath,
  sleep,
  waitUntilUp,
} from '../lib/browser.mjs';
import * as popup from './popup.mjs';
import * as options from './options.mjs';
import * as imports from './imports.mjs';
import * as manage from './manage.mjs';

const PORT = Number(process.env.SMOKE_PORT ?? 9333);
const CHROME = resolveChromePath();
const EXT_DIR = resolve(import.meta.dirname, '../../.output/chrome-mv3');
const EXT_ID = extensionId(EXT_DIR.replace(/\//g, '\\'));

async function main() {
  console.log('浏览器:', CHROME);
  console.log('插件 ID:', EXT_ID);

  const profile = mkdtempSync(join(tmpdir(), 'lane-smoke-'));
  const chromeProc = launchChrome({ chromePath: CHROME, port: PORT, extDir: EXT_DIR, profile });

  try {
    await waitUntilUp(PORT);
    await sleep(1500);

    const ctx = { open: (path) => openPage(PORT, EXT_ID, path) };
    await popup.run(ctx);
    const optionsConn = await options.run(ctx);
    await imports.run({ options: optionsConn });
    await manage.run({ open: ctx.open, options: optionsConn });

    console.log('全部通过 ✅');
  } finally {
    chromeProc.kill();
    await sleep(500);
    try {
      rmSync(profile, { recursive: true, force: true });
    } catch {
      /* Windows 上进程未完全退出时可能删不掉，忽略 */
    }
  }
}

main().catch((e) => {
  console.error('❌', e.message);
  process.exit(1);
});
