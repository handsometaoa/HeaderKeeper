// 真实网络注入验证：配置一个匹配 httpbin.org 的系统（ACTIVE 方案 X-Lane），
// 真实访问 https://httpbin.org/headers，确认服务端收到了注入的 Header。
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import crypto from 'node:crypto';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const EXT_DIR = resolve(import.meta.dirname, '../.output/chrome-mv3');
const hash = crypto
  .createHash('sha256')
  .update(Buffer.from(EXT_DIR.replace(/\//g, '\\'), 'utf16le'))
  .digest('hex');
const EXT_ID = [...hash.slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');

function cdp(wsUrl) {
  let i = 0;
  const p = new Map();
  const ws = new WebSocket(wsUrl);
  const ready = new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error('ws fail'));
  });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && p.has(m.id)) {
      p.get(m.id)(m);
      p.delete(m.id);
    }
  };
  const send = async (method, params = {}) => {
    await ready;
    return new Promise((res) => {
      const id = ++i;
      p.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  return {
    send,
    close: () => ws.close(),
    async eval(expression) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (r.result?.exceptionDetails) return 'ERR:' + JSON.stringify(r.result.exceptionDetails).slice(0, 300);
      return r.result?.result?.value;
    },
  };
}

const PORT = 9452;
const VALUE = `e2e-${Date.now().toString(36)}`;
const config = {
  globalEnabled: true,
  systems: [
    {
      id: 's1',
      name: 'HTTPBIN 验证',
      domains: ['httpbin.org'],
      activeSchemeId: 'sc1',
      schemes: [
        { id: 'sc1', name: '需求1', description: 'e2e 验证', headers: [{ id: 'p1', key: 'X-Lane', value: VALUE }] },
      ],
    },
  ],
};

const profile = mkdtempSync(join(tmpdir(), 'e2e-net-'));
const proc = spawn(
  'C:/Users/Wgoto/AppData/Local/ChromeForTesting/chrome.exe',
  ['--headless=new', '--no-sandbox', '--disable-gpu', '--no-first-run', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--load-extension=${EXT_DIR}`, 'about:blank'],
  { stdio: 'ignore' },
);

try {
  for (let i = 0; i < 30; i++) {
    try {
      await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      break;
    } catch {
      await sleep(500);
    }
  }
  await sleep(2000);

  // 1. 写入配置并触发 DNR 同步
  const setup = await open(`chrome-extension://${EXT_ID}/options.html`);
  console.log('写入配置:', await setup.eval(
    `chrome.storage.local.set({laneConfig: ${JSON.stringify(config)}}).then(() => 'ok')`,
  ));
  console.log('触发同步:', await setup.eval(
    `browser.runtime.sendMessage({type:'sync-dnr'}).then(() => 'ok').catch(String)`,
  ));
  await sleep(1500);
  console.log('DNR 规则:', await setup.eval(
    `new Promise(res => chrome.declarativeNetRequest.getDynamicRules(r => res(JSON.stringify(r[0]?.action?.requestHeaders ?? []))))`,
  ));
  setup.close();

  // 2. 真实访问 httpbin.org/headers
  const page = await open('https://httpbin.org/headers');
  for (let i = 0; i < 20; i++) {
    const ready = await page.eval(`document.readyState`);
    if (ready === 'complete') break;
    await sleep(500);
  }
  await sleep(1000);
  const body = await page.eval(`document.body.innerText`);
  let headers;
  try {
    headers = JSON.parse(body).headers;
  } catch {
    console.log('响应内容(前300字):', String(body).slice(0, 300));
    throw new Error('httpbin 响应解析失败');
  }
  console.log('服务端收到的 X-Lane:', headers['X-Lane'] ?? '(不存在)');
  console.log('期望值:', VALUE);
  console.log(headers['X-Lane'] === VALUE ? '真实请求注入验证通过 ✅' : '注入验证失败 ❌');
  page.close();

  async function open(url) {
    const t0 = await (
      await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, { method: 'PUT' })
    ).json();
    const c = cdp(t0.webSocketDebuggerUrl);
    await c.send('Page.enable');
    await c.send('Page.navigate', { url });
    await sleep(1500);
    return c;
  }
} finally {
  proc.kill();
  await sleep(400);
  try {
    rmSync(profile, { recursive: true, force: true });
  } catch {}
}
