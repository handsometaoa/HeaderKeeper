// 冒烟测试共用的浏览器控制工具：启动 Chrome、CDP 封装与页面操作
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import crypto from 'node:crypto';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 未打包插件的 ID = 路径(UTF-16LE) SHA256 前 16 字节，hex 0-f 映射为 a-p
export function extensionId(absPath) {
  const hash = crypto.createHash('sha256').update(Buffer.from(absPath, 'utf16le')).digest('hex');
  return [...hash.slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

export function launchChrome({ chromePath, port, extDir, profile, windowSize = '1280,900' }) {
  return spawn(
    chromePath,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      `--window-size=${windowSize}`,
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      `--load-extension=${extDir}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
}

/** 等待调试端口就绪；返回浏览器版本号，超时抛错 */
export async function waitUntilUp(port) {
  for (let i = 0; i < 30; i++) {
    try {
      const v = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
      if (v.Browser) {
        console.log('已启动:', v.Browser);
        return v.Browser;
      }
    } catch {
      /* 未就绪继续等 */
    }
    await sleep(500);
  }
  throw new Error('浏览器启动超时');
}

export function cdp(wsUrl) {
  let msgId = 0;
  const pending = new Map();
  const ws = new WebSocket(wsUrl);
  const ready = new Promise((res, rej) => {
    ws.onopen = res;
    ws.onerror = () => rej(new Error(`WS 连接失败: ${wsUrl}`));
  });
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.id && pending.has(m.id)) {
      pending.get(m.id)(m);
      pending.delete(m.id);
    }
  };
  const send = async (method, params = {}) => {
    await ready;
    return new Promise((res) => {
      const id = ++msgId;
      pending.set(id, res);
      ws.send(JSON.stringify({ id, method, params }));
    });
  };
  return {
    send,
    close: () => ws.close(),
    async eval(expression) {
      const r = await send('Runtime.evaluate', {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.result?.exceptionDetails) {
        throw new Error(`eval 失败: ${JSON.stringify(r.result.exceptionDetails).slice(0, 2000)}`);
      }
      return r.result?.result?.value;
    },
  };
}

export async function openPage(port, extId, path) {
  const res = await fetch(`http://127.0.0.1:${port}/json/new?url=about:blank`, { method: 'PUT' });
  const t = await res.json();
  const c = cdp(t.webSocketDebuggerUrl);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  const url = /^[\w-]+:\/\//.test(path) ? path : `chrome-extension://${extId}/${path}`;
  await c.send('Page.navigate', { url });
  await sleep(1000);
  return c;
}

export async function screenshot(c, file) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
}

/** 用真实鼠标事件点击元素（模拟真实用户，避免合成 click 的怪癖） */
export async function realClick(c, selector, index = 0) {
  const rect = await c.eval(
    `(() => { const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
       if (!el) return null;
       el.scrollIntoView({ block: 'center' });
       const r = el.getBoundingClientRect();
       return JSON.stringify({x: Math.round(r.x + r.width / 2), y: Math.round(r.y + r.height / 2)});
     })()`,
  ).then((s) => (s ? JSON.parse(s) : null));
  if (!rect) throw new Error(`未找到元素: ${selector}[${index}]`);
  for (const type of ['mousePressed', 'mouseReleased']) {
    await c.send('Input.dispatchMouseEvent', {
      type,
      x: rect.x,
      y: rect.y,
      button: 'left',
      clickCount: 1,
    });
  }
}

/** 点击后轮询校验 DOM 状态，未生效则重试（无头渲染时序可能导致个别点击丢失） */
export async function clickUntil(c, selector, predicate, attempts = 5) {
  for (let i = 0; i < attempts; i++) {
    await realClick(c, selector);
    for (let j = 0; j < 4; j++) {
      await sleep(250);
      if (await c.eval(predicate)) return;
    }
  }
  throw new Error(`点击未生效: ${selector} (predicate: ${predicate})`);
}

/** React 受控输入框赋值（触发 input/change 事件） */
export async function setInput(c, selector, value, index = 0) {
  const result = await c.eval(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return 'missing';
    el.focus();
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  if (result !== 'ok') throw new Error(`未找到输入框: ${selector}[${index}]`);
}

export async function blur(c, selector, index = 0) {
  await c.eval(`document.querySelectorAll(${JSON.stringify(selector)})[${index}]?.blur()`);
}

export async function setSelect(c, selector, value, index = 0) {
  const result = await c.eval(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return 'missing';
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(el, ${JSON.stringify(value)});
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  if (result !== 'ok') throw new Error(`未找到下拉框: ${selector}[${index}]`);
}

export async function getConfig(c) {
  return JSON.parse(
    await c.eval(
      `chrome.storage.local.get('laneConfig').then(({laneConfig}) => JSON.stringify(laneConfig))`,
    ),
  );
}

/** 轮询等待 DNR 规则数量达到期望值 */
export async function waitDnrCount(c, expected, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let count = -1;
  while (Date.now() < deadline) {
    count = await c.eval(
      `new Promise(res => chrome.declarativeNetRequest.getDynamicRules(r => res(r.length)))`,
    );
    if (count === expected) return count;
    await sleep(400);
  }
  return count;
}

/** 轮询等待角标文本达到期望值 */
export async function waitBadge(c, expected, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let text = null;
  while (Date.now() < deadline) {
    text = await c.eval(`chrome.action.getBadgeText({})`);
    if (text === expected) return text;
    await sleep(400);
  }
  return text;
}

export async function sync(c) {
  await c.eval(`browser.runtime.sendMessage({type:'sync-dnr'}).then(() => 'ok').catch(String)`);
}

export async function waitFor(c, expression, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await c.eval(expression)) return true;
    await sleep(200);
  }
  return false;
}

export async function waitImportParsed(c) {
  const done = await waitFor(
    c,
    `!!document.querySelector('.import-preview') || !!document.querySelector('.import-error')`,
  );
  if (!done) throw new Error('需求导入解析超时');
  const error = await c.eval(`document.querySelector('.import-error')?.textContent ?? ''`);
  if (error) throw new Error(`需求导入解析失败: ${error}`);
}

export async function reload(c) {
  await c.send('Page.reload');
  await sleep(1300);
}
