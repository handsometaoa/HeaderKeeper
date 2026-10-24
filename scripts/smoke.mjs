// 端到端冒烟测试：自动启动带插件的 Chrome for Testing（全新 profile），验证
// 共享需求库、弹窗 Tab 记忆、系统/需求管理、筛选、DNR 同步与旧配置重置备份。
// 用法：node scripts/smoke.mjs   （可用 CHROME_PATH 覆盖浏览器路径）
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import crypto from 'node:crypto';
import { resolve, join } from 'node:path';

const PORT = Number(process.env.SMOKE_PORT ?? 9333);
const CHROME =
  process.env.CHROME_PATH ?? 'C:/Users/Wgoto/AppData/Local/ChromeForTesting/chrome.exe';
const EXT_DIR = resolve(import.meta.dirname, '../.output/chrome-mv3');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 未打包插件的 ID = 路径(UTF-16LE) SHA256 前 16 字节，hex 0-f 映射为 a-p
function extensionId(absPath) {
  const hash = crypto.createHash('sha256').update(Buffer.from(absPath, 'utf16le')).digest('hex');
  return [...hash.slice(0, 32)].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
}

const EXT_ID = extensionId(EXT_DIR.replace(/\//g, '\\'));

function cdp(wsUrl) {
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

async function openPage(path) {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/new?url=about:blank`, { method: 'PUT' });
  const t = await res.json();
  const c = cdp(t.webSocketDebuggerUrl);
  await c.send('Page.enable');
  await c.send('Runtime.enable');
  const url = /^[\w-]+:\/\//.test(path) ? path : `chrome-extension://${EXT_ID}/${path}`;
  await c.send('Page.navigate', { url });
  await sleep(1000);
  return c;
}

async function screenshot(c, file) {
  const r = await c.send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(file, Buffer.from(r.result.data, 'base64'));
}

/** 用真实鼠标事件点击元素（模拟真实用户，避免合成 click 的怪癖） */
async function realClick(c, selector, index = 0) {
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
async function clickUntil(c, selector, predicate, attempts = 5) {
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
async function setInput(c, selector, value, index = 0) {
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

async function blur(c, selector, index = 0) {
  await c.eval(`document.querySelectorAll(${JSON.stringify(selector)})[${index}]?.blur()`);
}

async function setSelect(c, selector, value, index = 0) {
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

async function getConfig(c) {
  return JSON.parse(
    await c.eval(
      `chrome.storage.local.get('laneConfig').then(({laneConfig}) => JSON.stringify(laneConfig))`,
    ),
  );
}

/** 轮询等待 DNR 规则数量达到期望值 */
async function waitDnrCount(c, expected, timeoutMs = 8000) {
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
async function waitBadge(c, expected, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  let text = null;
  while (Date.now() < deadline) {
    text = await c.eval(`chrome.action.getBadgeText({})`);
    if (text === expected) return text;
    await sleep(400);
  }
  return text;
}

async function sync(c) {
  await c.eval(`browser.runtime.sendMessage({type:'sync-dnr'}).then(() => 'ok').catch(String)`);
}

async function waitFor(c, expression, timeoutMs = 12000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await c.eval(expression)) return true;
    await sleep(200);
  }
  return false;
}

async function waitImportParsed(c) {
  const done = await waitFor(
    c,
    `!!document.querySelector('.import-preview') || !!document.querySelector('.import-error')`,
  );
  if (!done) throw new Error('需求导入解析超时');
  const error = await c.eval(`document.querySelector('.import-error')?.textContent ?? ''`);
  if (error) throw new Error(`需求导入解析失败: ${error}`);
}

const IMPORT_STANDARD_JSON = JSON.stringify([
  {
    id: 'import-a',
    name: '导入需求A',
    description: '标准导入',
    headers: [{ key: 'X-Imported', value: 'yes' }],
  },
  { id: 'req1', name: '冲突ID' },
  { name: '需求2' },
  { name: '无ID需求', description: '自动生成 id' },
  { description: '缺少名称' },
]);

const IMPORT_CUSTOM_JSON = JSON.stringify({
  items: [{ code: 'EXT-1', title: '脚本需求', lane: 'lane-x' }],
});

const IMPORT_CUSTOM_CODE = `return data.items.map((item) => ({
  id: item.code,
  name: item.title,
  description: '来自自定义解析',
  expiresAt: null,
  headers: [{ key: 'X-Lane', value: item.lane }],
}));`;

async function reload(c) {
  await c.send('Page.reload');
  await sleep(1300);
}

const LEGACY_CONFIG = {
  globalEnabled: true,
  systems: [
    {
      id: 'legacy-sys',
      name: '旧系统',
      domains: ['old.acme.cn'],
      enabled: true,
      activeSchemeId: null,
      schemes: [
        {
          id: 'legacy-req',
          name: '旧需求',
          description: '旧结构',
          expiresAt: null,
          headers: [{ id: 'legacy-pair', key: 'X-Old', value: '1' }],
        },
      ],
    },
  ],
};

function testConfig() {
  const now = Date.now();
  return {
    version: 2,
    globalEnabled: true,
    requirements: [
      {
        id: 'req1',
        name: '需求1',
        description: '张三 - 购物车改版',
        expiresAt: null,
        createdAt: now - 3000,
        headers: [{ id: 'p1', key: 'X-Lane', value: 'feature-cart-a' }],
      },
      {
        id: 'req2',
        name: '需求2',
        description: '李四 - 结算优化',
        expiresAt: null,
        createdAt: now - 2000,
        headers: [{ id: 'p2', key: 'X-Lane', value: 'feature-cart-b' }],
      },
      {
        id: 'req3',
        name: '需求3',
        description: '共享 - 积分灰度',
        expiresAt: null,
        createdAt: now - 1000,
        headers: [{ id: 'p3', key: 'X-Points', value: 'v2' }],
      },
    ],
    systems: [
      {
        id: 'sys1',
        name: '运营后台',
        domains: ['admin.acme.cn', '*.admin.acme.cn'],
        enabled: true,
        requirementIds: ['req1', 'req2'],
        activeRequirementId: null,
      },
      {
        id: 'sys2',
        name: '会员中心',
        domains: ['admin.acme.cn'],
        enabled: true,
        requirementIds: ['req2', 'req3'],
        activeRequirementId: null,
      },
    ],
  };
}

async function main() {
  console.log('浏览器:', CHROME);
  console.log('插件 ID:', EXT_ID);

  const profile = mkdtempSync(join(tmpdir(), 'lane-smoke-'));
  const chromeProc = spawn(
    CHROME,
    [
      '--headless=new',
      '--no-sandbox',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--window-size=1280,900',
      `--remote-debugging-port=${PORT}`,
      `--user-data-dir=${profile}`,
      `--load-extension=${EXT_DIR}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );

  try {
    let up = false;
    for (let i = 0; i < 30; i++) {
      try {
        const v = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
        if (v.Browser) {
          up = true;
          console.log('已启动:', v.Browser);
          break;
        }
      } catch {
        /* 未就绪继续等 */
      }
      await sleep(500);
    }
    if (!up) throw new Error('浏览器启动超时');
    await sleep(1500);

    // 0. 旧结构配置：备份 + 重置为 v2 默认配置
    const setup = await openPage('options.html');
    await setup.eval(`chrome.storage.local.set({laneConfig: ${JSON.stringify(LEGACY_CONFIG)}})`);
    await reload(setup);
    const resetInfo = JSON.parse(
      await setup.eval(
        `Promise.all([
           chrome.storage.local.get('laneConfig'),
           chrome.storage.local.get('laneConfigLegacyBackup'),
         ]).then(([a, b]) => JSON.stringify({
           version: a.laneConfig?.version,
           systems: a.laneConfig?.systems?.length,
           requirements: a.laneConfig?.requirements?.length,
           backupSystems: b.laneConfigLegacyBackup?.systems?.length ?? 0,
         }))`,
      ),
    );
    console.log(
      `✓ 旧配置重置: v${resetInfo.version}, ${resetInfo.systems} 个系统 / ${resetInfo.requirements} 个需求, 备份系统=${resetInfo.backupSystems}`,
    );
    if (
      resetInfo.version !== 2 ||
      resetInfo.systems !== 1 ||
      resetInfo.requirements !== 2 ||
      resetInfo.backupSystems !== 1
    ) {
      throw new Error('旧配置重置/备份不符合预期');
    }
    setup.close();

    // 1. Popup 默认 Tab = 当前注入
    const popup = await openPage('popup.html?__host=admin.acme.cn');
    await sleep(400);
    const defaultTab = await popup.eval(`document.querySelector('.tab.active')?.textContent ?? ''`);
    const emptyInject = await popup.eval(
      `document.body.innerText.includes('当前没有注入任何 Header')`,
    );
    console.log(`✓ Popup 默认 Tab: "${defaultTab}", 空注入提示=${emptyInject}`);
    if (!defaultTab.includes('当前注入') || !emptyInject) {
      throw new Error('Popup 默认 Tab 不是「当前注入」');
    }

    // 2. 切到系统 Tab → 关闭重开应记住
    await realClick(popup, '.tab', 1);
    await sleep(400);
    const sysCards = await popup.eval(`document.querySelectorAll('.system-card').length`);
    const schemeRows = await popup.eval(`document.querySelectorAll('.scheme-row').length`);
    console.log(`✓ 系统 Tab: ${sysCards} 个系统, ${schemeRows} 个需求行`);
    if (sysCards !== 1 || schemeRows !== 2) throw new Error('系统 Tab 渲染不符合预期');
    popup.close();

    const popup2 = await openPage('popup.html?__host=admin.acme.cn');
    await sleep(500);
    const restoredSystems = await popup2.eval(
      `document.querySelector('.tab.active')?.textContent ?? ''`,
    );
    console.log(`✓ 重新打开记住上次 Tab: "${restoredSystems}"`);
    if (!restoredSystems.includes('系统')) throw new Error('Popup 未记住上次 Tab');

    // 3. 选择需求 → active + DNR
    await clickUntil(
      popup2,
      '.scheme-row',
      `document.querySelectorAll('.scheme-row.active').length === 1`,
    );
    await sleep(600);
    const activeInfo = JSON.parse(
      await popup2.eval(
        `chrome.storage.local.get('laneConfig').then(({laneConfig}) => JSON.stringify({
           active: laneConfig.systems[0].activeRequirementId,
           first: laneConfig.systems[0].requirementIds[0],
         }))`,
      ),
    );
    const dnrCount = await waitDnrCount(popup2, 1);
    const rule = await popup2
      .eval(
        `new Promise(res => chrome.declarativeNetRequest.getDynamicRules(r => res(JSON.stringify(r[0] ?? null))))`,
      )
      .then((s) => JSON.parse(s));
    const header = rule?.action?.requestHeaders?.[0];
    console.log(
      `✓ 选择需求: active=${activeInfo.active === activeInfo.first}, DNR ${dnrCount} 条, ${header?.header}=${header?.value}`,
    );
    if (activeInfo.active !== activeInfo.first) throw new Error('存储 activeRequirementId 不符合预期');
    if (dnrCount !== 1 || header?.header !== 'X-Lane' || header?.value !== 'feature-cart-a') {
      throw new Error('DNR 规则未正确生成');
    }

    // 角标
    const webTab = await openPage('https://admin.acme.cn/');
    const badge = await waitBadge(popup2, '1');
    console.log(`✓ 角标(admin.acme.cn 页签): "${badge}"`);
    if (badge !== '1') throw new Error('角标未按当前站点显示');

    // 4. 当前注入 Tab 内容 + 记忆
    await realClick(popup2, '.tab', 0);
    await sleep(400);
    const injectShown = await popup2.eval(
      `document.body.innerText.includes('当前注入') && document.body.innerText.includes('X-Lane') && document.body.innerText.includes('feature-cart-a') && document.body.innerText.includes('运营后台')`,
    );
    console.log(`✓ 当前注入 Tab: ${injectShown}`);
    if (!injectShown) throw new Error('当前注入汇总未展示');
    popup2.close();

    const popup3 = await openPage('popup.html?__host=admin.acme.cn');
    await sleep(500);
    const restoredInject = await popup3.eval(
      `document.querySelector('.tab.active')?.textContent ?? ''`,
    );
    console.log(`✓ 再次打开记住「当前注入」: "${restoredInject}"`);
    if (!restoredInject.includes('当前注入')) throw new Error('Popup 未记住「当前注入」Tab');
    await realClick(popup3, '.tab', 1);
    await sleep(400);

    // 真实弹窗不是标签页：角标按「目标网站标签页」刷新，这里把它设为活动页
    await popup3.eval(`chrome.tabs.query({}).then((tabs) => {
      const tab = tabs.find((x) => x.url && x.url.startsWith('https://admin.acme.cn'));
      return tab ? chrome.tabs.update(tab.id, { active: true }) : null;
    })`);
    await sleep(300);

    // 5. 总开关 / 系统开关 / 取消-恢复
    await clickUntil(
      popup3,
      '.master .switch input',
      `!document.querySelector('.master .switch input').checked`,
    );
    const offCount = await waitDnrCount(popup3, 0);
    const badgeOff = await waitBadge(popup3, '');
    console.log(`✓ 总开关关闭: DNR ${offCount} 条, 角标 "${badgeOff}"`);
    if (offCount !== 0 || badgeOff !== '') throw new Error('总开关关闭后未清理');
    await clickUntil(
      popup3,
      '.master .switch input',
      `document.querySelector('.master .switch input').checked`,
    );
    if ((await waitDnrCount(popup3, 1)) !== 1) throw new Error('总开关开启后规则未恢复');

    await clickUntil(
      popup3,
      '.system-head .switch input',
      `!document.querySelector('.system-head .switch input').checked`,
    );
    if ((await waitDnrCount(popup3, 0)) !== 0) throw new Error('系统开关关闭后未清理');
    await clickUntil(
      popup3,
      '.system-head .switch input',
      `document.querySelector('.system-head .switch input').checked`,
    );
    if ((await waitDnrCount(popup3, 1)) !== 1) throw new Error('系统开关开启后未恢复');

    await clickUntil(
      popup3,
      '.scheme-row',
      `document.querySelectorAll('.scheme-row.active').length === 0`,
    );
    if ((await waitDnrCount(popup3, 0)) !== 0) throw new Error('取消需求后未清理');
    await clickUntil(
      popup3,
      '.scheme-row',
      `document.querySelectorAll('.scheme-row.active').length === 1`,
    );
    if ((await waitDnrCount(popup3, 1)) !== 1) throw new Error('恢复需求后未注入');

    // 6. 需求过期 → 停止注入并从弹窗隐藏
    await popup3.eval(`(async () => {
      const {laneConfig} = await chrome.storage.local.get('laneConfig');
      const sys = laneConfig.systems[0];
      const req = laneConfig.requirements.find((r) => r.id === sys.activeRequirementId);
      req.expiresAt = '2020-01-01T00:00';
      await chrome.storage.local.set({laneConfig});
      await browser.runtime.sendMessage({type:'sync-dnr'});
      return 'ok';
    })()`);
    await sleep(1200);
    const expiredRows = await popup3.eval(`document.querySelectorAll('.scheme-row').length`);
    const expiredDnr = await waitDnrCount(popup3, 0);
    const expiredHidden = await popup3.eval(
      `!document.body.innerText.includes('张三 - 购物车改版') && document.body.innerText.includes('需求2')`,
    );
    console.log(`✓ 需求过期: 可见行 ${expiredRows}, DNR ${expiredDnr}, 已隐藏=${expiredHidden}`);
    if (expiredRows !== 1 || expiredDnr !== 0 || !expiredHidden) {
      throw new Error('过期逻辑不符合预期');
    }
    await popup3.eval(`(async () => {
      const {laneConfig} = await chrome.storage.local.get('laneConfig');
      for (const r of laneConfig.requirements) r.expiresAt = null;
      await chrome.storage.local.set({laneConfig});
      await browser.runtime.sendMessage({type:'sync-dnr'});
      return 'ok';
    })()`);
    await sleep(800);
    await screenshot(popup3, 'smoke-popup.png');
    popup3.close();

    // 7. 未匹配域名 → 快捷创建系统
    const popup4 = await openPage('popup.html?__host=unknown.acme.test');
    await sleep(500);
    const noMatch = await popup4.eval(`document.body.innerText.includes('未匹配到系统')`);
    if (!noMatch) throw new Error('未匹配提示未出现');
    await setInput(popup4, '.qc-name', '数据平台');
    await realClick(popup4, '.qc-create');
    await sleep(900);
    const qcConfig = await getConfig(popup4);
    const qcVisible = await popup4.eval(`document.querySelectorAll('.system-card').length`);
    console.log(`✓ 快捷创建: ${qcConfig.systems.length} 个系统, 页面显示 ${qcVisible} 张卡片`);
    if (qcConfig.systems.length !== 2 || qcVisible !== 1) throw new Error('快捷创建未生效');
    popup4.close();

    // 8. 冲突检测（两个系统注入同一 Header Key）
    const popup5 = await openPage('popup.html?__host=admin.acme.cn');
    await popup5.eval(`(async () => {
      const {laneConfig} = await chrome.storage.local.get('laneConfig');
      const sys = laneConfig.systems[1];
      sys.domains = ['admin.acme.cn'];
      laneConfig.requirements.push({
        id: 'conflict-req', name: '需求X', description: '', expiresAt: null,
        createdAt: Date.now(), headers: [{ id: 'conflict-pair', key: 'X-Lane', value: 'other-lane' }],
      });
      sys.requirementIds = ['conflict-req'];
      sys.activeRequirementId = 'conflict-req';
      await chrome.storage.local.set({laneConfig});
      await browser.runtime.sendMessage({type:'sync-dnr'});
      return 'ok';
    })()`);
    await sleep(1200);
    const conflictShown = await popup5.eval(`(() => {
      const conflict = document.querySelector('.host-row .conflict-inline');
      const host = document.querySelector('.host-row .host-value');
      if (!conflict || !host) return false;
      const h = host.getBoundingClientRect();
      const c = conflict.getBoundingClientRect();
      return conflict.textContent.includes('X-Lane') && Math.abs(h.top - c.top) < 4 && c.left >= h.right;
    })()`);
    const conflictDnr = await popup5.eval(
      `new Promise(res => chrome.declarativeNetRequest.getDynamicRules(r => res(r.length)))`,
    );
    console.log(`✓ 冲突检测: 提示=${conflictShown}, DNR ${conflictDnr} 条`);
    if (!conflictShown || conflictDnr !== 2) throw new Error('冲突检测不符合预期');
    await screenshot(popup5, 'smoke-popup-conflict.png');
    popup5.close();

    // ---------- 设置页 ----------
    const options = await openPage('options.html');
    await options.eval(
      `chrome.storage.local.set({laneConfig: ${JSON.stringify(testConfig())}}).then(() => 'ok')`,
    );
    await sync(options);
    await reload(options);
    await sleep(500);

    let sysRows = await options.eval(`document.querySelectorAll('.sys-row').length`);
    let navItems = await options.eval(`document.querySelectorAll('.nav-item').length`);
    console.log(`✓ 设置页: ${sysRows} 个系统行, ${navItems} 个导航项`);
    if (sysRows !== 2 || navItems !== 4) throw new Error('设置页渲染不符合预期');
    await screenshot(options, 'smoke-options.png');

    // 8.5 全局关闭提示：显示 3 秒后消失
    await realClick(options, '.pill-toggle .switch input');
    await sleep(300);
    const toastShown = await options.eval(`!!document.querySelector('.toast')`);
    await sleep(3200);
    const toastGone = await options.eval(`!document.querySelector('.toast')`);
    await realClick(options, '.pill-toggle .switch input');
    await sleep(500);
    console.log(`✓ 全局关闭提示: 显示=${toastShown}, 3 秒后消失=${toastGone}`);
    if (!toastShown || !toastGone) throw new Error('全局关闭提示未按预期消失');

    // 9. 系统列表：编辑弹窗改名 + 多域名；管理需求进入详情
    await realClick(options, '.sys-row-edit', 0);
    if (!(await waitFor(options, `!!document.querySelector('.system-form-modal')`))) {
      throw new Error('编辑系统弹窗未打开');
    }
    await setInput(options, '.system-form-modal input[type="text"]', '运营后台A', 0);
    await setInput(options, '.system-form-modal .domain-add input', '*.test.acme.cn', 0);
    await sleep(200);
    await realClick(options, '.system-form-modal .domain-add .btn');
    await sleep(200);
    await realClick(options, '.system-form-modal .domain-chip .domain-remove', 0);
    await sleep(200);
    await realClick(options, '.system-form-modal .btn.primary');
    await sleep(900);
    let cfg = await getConfig(options);
    if (cfg.systems[0].name !== '运营后台A') throw new Error('系统改名未生效');
    if (cfg.systems[0].domains.length !== 2) throw new Error('域名编辑未生效');
    console.log(
      `✓ 系统列表编辑: 名称=${cfg.systems[0].name}, 域名 ${cfg.systems[0].domains.join(' / ')}`,
    );

    await realClick(options, '.sys-row-toggle', 0);
    await sleep(500);
    cfg = await getConfig(options);
    const toggledOff = cfg.systems[0].enabled === false;
    const badgeShown = await options.eval(
      `!!document.querySelector('.sys-row .disabled-badge')`,
    );
    const pausedText = await options.eval(
      `document.querySelector('.sys-row-inject')?.textContent ?? ''`,
    );
    await realClick(options, '.sys-row-toggle', 0);
    await sleep(500);
    cfg = await getConfig(options);
    const toggledOn = cfg.systems[0].enabled !== false;
    const badgeGone = await options.eval(
      `!document.querySelector('.sys-row .disabled-badge')`,
    );
    const injectText = await options.eval(
      `document.querySelector('.sys-row-inject')?.textContent ?? ''`,
    );
    console.log(
      `✓ 系统停用/启用: 停用=${toggledOff}, 徽标=${badgeShown}, 停用文案="${pausedText}", 恢复=${toggledOn}, 注入文案="${injectText}"`,
    );
    if (!toggledOff || !toggledOn || !badgeShown || !badgeGone) {
      throw new Error('系统停用/启用未生效');
    }
    if (!pausedText.includes('已停用') || !injectText.includes('未选择注入需求')) {
      throw new Error('注入状态行文案不符合预期');
    }

    await realClick(options, '.sys-row-manage', 0);
    await sleep(600);
    const detailShown = await options.eval(
      `!!document.querySelector('.system-detail') && document.querySelector('.system-summary-name')?.textContent === '运营后台A'`,
    );
    if (!detailShown) throw new Error('管理需求未进入系统详情');
    const sideBySide = await options.eval(`(() => {
      const cards = [...document.querySelectorAll('.system-detail .requirement-card')];
      if (cards.length !== 2) return false;
      const a = cards[0].getBoundingClientRect();
      const b = cards[1].getBoundingClientRect();
      return Math.abs(a.top - b.top) < 2 && b.left >= a.right;
    })()`);
    console.log(`✓ 系统详情两需求左右排列: ${sideBySide}`);
    if (!sideBySide) throw new Error('系统详情两个需求未左右排列');
    await screenshot(options, 'smoke-system-detail.png');

    // 10. 新建需求（弹窗，自动关联当前系统）
    await realClick(options, '.req-toolbar-actions .btn.primary');
    if (!(await waitFor(options, `!!document.querySelector('.req-form-modal')`))) {
      throw new Error('新建需求弹窗未打开');
    }
    const reqModalHeight = await options.eval(
      `document.querySelector('.req-form-modal').offsetHeight`,
    );
    await realClick(options, '.req-form-modal .btn.primary');
    await sleep(300);
    const reqInvalid = await options.eval(`(() => {
      const modal = document.querySelector('.req-form-modal');
      return JSON.stringify({
        invalid: !!modal.querySelector('input.invalid'),
        errorText: document.querySelectorAll('.req-form-modal .form-error').length,
        height: modal.offsetHeight,
      });
    })()`).then(JSON.parse);
    if (
      !reqInvalid.invalid ||
      reqInvalid.errorText !== 0 ||
      reqInvalid.height !== reqModalHeight
    ) {
      throw new Error('新建需求名称空值描红/弹窗尺寸不符合预期');
    }
    const reqCountBeforeCreate = (await getConfig(options)).requirements.length;
    await setInput(options, '.req-form-modal input[type="text"]', '需求1', 0);
    await realClick(options, '.req-form-modal .btn.primary');
    await sleep(300);
    const dupReqInvalid = await options.eval(
      `!!document.querySelector('.req-form-modal input.invalid')`,
    );
    const dupReqError = await options.eval(
      `document.querySelector('.req-form-modal .field-error')?.textContent ?? ''`,
    );
    cfg = await getConfig(options);
    console.log(
      `✓ 新建需求重名: 描红=${dupReqInvalid}, 红字=${dupReqError}, 未创建=${cfg.requirements.length === reqCountBeforeCreate}`,
    );
    if (
      !dupReqInvalid ||
      !dupReqError.includes('已存在') ||
      cfg.requirements.length !== reqCountBeforeCreate
    ) {
      throw new Error('新建需求重名未被阻止或缺少红字提示');
    }
    await setInput(options, '.req-form-modal input[type="text"]', '新建共享需求', 0);
    await setInput(options, '.req-form-modal input[type="text"]', '测试用', 1);
    await realClick(options, '.req-form-modal .btn.primary');
    await sleep(800);
    cfg = await getConfig(options);
    const newReq = cfg.requirements.find((r) => r.name === '新建共享需求');
    const sysAfterCreate = cfg.systems.find((s) => s.id === 'sys1');
    console.log(
      `✓ 新建需求: 需求 ${cfg.requirements.length} 个, 系统引用 ${sysAfterCreate.requirementIds.length} 个, 已关联=${sysAfterCreate.requirementIds.includes(newReq?.id)}`,
    );
    if (!newReq || !sysAfterCreate.requirementIds.includes(newReq.id)) {
      throw new Error('新建需求/关联未生效');
    }

    // 11. 关联已有需求 → 过期需求不进候选 → 解除引用
    // 先把 req3 置为过期，关联弹窗应没有候选
    await options.eval(`(async () => {
      const {laneConfig} = await chrome.storage.local.get('laneConfig');
      laneConfig.requirements.find((r) => r.id === 'req3').expiresAt = '2020-01-01T00:00';
      await chrome.storage.local.set({laneConfig});
      return 'ok';
    })()`);
    await sleep(600);
    await realClick(options, '.req-toolbar-actions .btn', 0);
    await sleep(400);
    const expiredPickerItems = await options.eval(
      `document.querySelectorAll('.modal-item').length`,
    );
    if (expiredPickerItems !== 0) {
      throw new Error(`过期需求不应出现在关联弹窗: ${expiredPickerItems}`);
    }
    console.log('✓ 关联弹窗过滤过期需求');
    await realClick(options, '.modal-head .icon-btn');
    await sleep(300);
    await options.eval(`(async () => {
      const {laneConfig} = await chrome.storage.local.get('laneConfig');
      laneConfig.requirements.find((r) => r.id === 'req3').expiresAt = null;
      await chrome.storage.local.set({laneConfig});
      return 'ok';
    })()`);
    await sleep(600);
    await realClick(options, '.req-toolbar-actions .btn', 0);
    await sleep(400);
    const pickerItems = await options.eval(`document.querySelectorAll('.modal-item').length`);
    if (pickerItems !== 1) throw new Error(`关联弹窗候选数量不符合预期: ${pickerItems}`);
    await realClick(options, '.modal-item .btn', 0);
    await sleep(700);
    cfg = await getConfig(options);
    const sysAfterLink = cfg.systems.find((s) => s.id === 'sys1');
    if (!sysAfterLink.requirementIds.includes('req3')) throw new Error('关联已有需求未生效');
    console.log(`✓ 关联已有需求: 系统引用 ${sysAfterLink.requirementIds.length} 个`);

    await realClick(options, '.req-remove', 0);
    await sleep(700);
    cfg = await getConfig(options);
    const sysAfterUnlink = cfg.systems.find((s) => s.id === 'sys1');
    if (sysAfterUnlink.requirementIds.length !== sysAfterLink.requirementIds.length - 1) {
      throw new Error('移出本系统未生效');
    }
    console.log(`✓ 移出本系统: 剩余引用 ${sysAfterUnlink.requirementIds.length} 个`);

    // 12. 需求管理：数量 / 排序 / 引用 / 筛选 / 内联编辑
    await options.eval(`document.querySelectorAll('.nav-item')[2]?.click()`);
    await sleep(600);
    const reqCards = await options.eval(`document.querySelectorAll('.requirement-card').length`);
    const sharedShown = await options.eval(
      `document.body.innerText.includes('运营后台') && document.body.innerText.includes('会员中心')`,
    );
    console.log(`✓ 需求管理: ${reqCards} 张卡片, 引用系统展示=${sharedShown}`);
    if (reqCards !== 4 || !sharedShown) throw new Error('需求管理渲染不符合预期');
    await screenshot(options, 'smoke-requirements.png');

    // 名称筛选：输入后不立即生效，点击搜索才筛选
    await setInput(options, '.filters .filter-input', '需求3', 0);
    await sleep(400);
    let filtered = await options.eval(`document.querySelectorAll('.requirement-card').length`);
    if (filtered !== 4) throw new Error(`搜索前不应筛选: ${filtered}`);
    await realClick(options, '.filter-search');
    await sleep(400);
    filtered = await options.eval(`document.querySelectorAll('.requirement-card').length`);
    if (filtered !== 1) throw new Error(`名称筛选结果不符合预期: ${filtered}`);
    await realClick(options, '.filter-clear');
    await sleep(400);

    // Header 值筛选
    await setInput(options, '.filters .filter-input', 'feature-cart-b', 1);
    await sleep(300);
    await realClick(options, '.filter-search');
    await sleep(400);
    filtered = await options.eval(`document.querySelectorAll('.requirement-card').length`);
    if (filtered !== 1) throw new Error(`Header 值筛选结果不符合预期: ${filtered}`);
    await realClick(options, '.filter-clear');
    await sleep(400);

    // 过期状态筛选：把第一张卡片设为已过期，再用下拉 + 搜索
    await setInput(options, '.requirement-card .expire-input', '2020-01-01T00:00', 0);
    await sleep(700);
    await setSelect(options, '.filter-select select', 'expired');
    await sleep(200);
    await realClick(options, '.filter-search');
    await sleep(400);
    const expiredFiltered = await options.eval(
      `document.querySelectorAll('.requirement-card').length`,
    );
    await setSelect(options, '.filter-select select', 'valid');
    await sleep(200);
    await realClick(options, '.filter-search');
    await sleep(400);
    const validFiltered = await options.eval(
      `document.querySelectorAll('.requirement-card').length`,
    );
    console.log(`✓ 过期筛选: 已过期 ${expiredFiltered} 张, 未过期 ${validFiltered} 张`);
    if (expiredFiltered !== 1 || validFiltered !== 3) {
      throw new Error('过期状态筛选不符合预期');
    }
    await realClick(options, '.filter-clear');
    await sleep(400);

    // 清除筛选回到默认视图：只展示未过期（上面被置为过期的需求应被隐藏）
    const defaultCards = await options.eval(
      `document.querySelectorAll('.requirement-card').length`,
    );
    console.log(`✓ 默认视图只展示未过期: ${defaultCards} 张`);
    if (defaultCards !== 3) throw new Error(`默认视图应只展示未过期需求: ${defaultCards}`);
    // 切到「全部」继续内联编辑
    await setSelect(options, '.filter-select select', 'all');
    await realClick(options, '.filter-search');
    await sleep(400);

    // 内联改名
    await setInput(options, '.requirement-card .scheme-name', '改名需求', 0);
    await sleep(700);
    cfg = await getConfig(options);
    if (!cfg.requirements.some((r) => r.name === '改名需求')) {
      throw new Error('需求内联改名未生效');
    }
    console.log('✓ 需求内联编辑');

    // 内联编辑：同一需求内 Header Key 不可重复
    const dupCardReady = await options.eval(`(() => {
      const card = [...document.querySelectorAll('.requirement-card')].find(
        (c) => c.querySelector('.scheme-name')?.value === '需求1');
      if (!card) return false;
      card.querySelector('.pair-add')?.click();
      return true;
    })()`);
    if (!dupCardReady) throw new Error('未找到需求1卡片');
    await sleep(400);
    await options.eval(`(() => {
      const card = [...document.querySelectorAll('.requirement-card')].find(
        (c) => c.querySelector('.scheme-name')?.value === '需求1');
      const inputs = [...card.querySelectorAll('.key-input')];
      const input = inputs[inputs.length - 1];
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
      setter.call(input, 'X-Lane');
      input.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`);
    await sleep(400);
    const dupInvalid = await options.eval(`(() => {
      const card = [...document.querySelectorAll('.requirement-card')].find(
        (c) => c.querySelector('.scheme-name')?.value === '需求1');
      const inputs = [...card.querySelectorAll('.key-input')];
      return inputs[inputs.length - 1].classList.contains('invalid');
    })()`);
    cfg = await getConfig(options);
    const req1 = cfg.requirements.find((r) => r.name === '需求1');
    const lastHeader = req1.headers[req1.headers.length - 1];
    console.log(`✓ 重复 Header Key: 描红=${dupInvalid}, 未写入=${lastHeader.key === ''}`);
    if (!dupInvalid || lastHeader.key !== '') {
      throw new Error('重复 Header Key 未被阻止');
    }

    // 离开页面：未修正的空 Key 行应被丢弃
    await options.eval(`document.querySelectorAll('.nav-item')[1]?.click()`);
    await sleep(500);
    await options.eval(`document.querySelectorAll('.nav-item')[2]?.click()`);
    await sleep(500);
    cfg = await getConfig(options);
    const req1AfterNav = cfg.requirements.find((r) => r.name === '需求1');
    const emptyKeyDropped = req1AfterNav.headers.every((h) => h.key.trim() !== '');
    console.log(`✓ 离开页面丢弃空 Key 行: ${emptyKeyDropped}`);
    if (!emptyKeyDropped) throw new Error('离开页面后空 Key 行未丢弃');

    // 12.5 需求导入：标准 JSON
    await realClick(options, '.page-actions-actions .btn', 0);
    if (!(await waitFor(options, `!!document.querySelector('.import-modal')`))) {
      throw new Error('导入弹窗未打开');
    }
    await sleep(600);
    const parseButtonLabel = await options.eval(
      `document.querySelector('.import-actions .btn.primary')?.textContent ?? ''`,
    );
    if (!parseButtonLabel.includes('解析预览')) {
      throw new Error(`解析/导入按钮未合并且标签异常: ${parseButtonLabel}`);
    }
    await setInput(options, '.import-textarea', IMPORT_STANDARD_JSON, 0);
    await realClick(options, '.import-actions .btn.primary');
    await waitImportParsed(options);
    const importSummary = await options.eval(
      `document.querySelector('.import-summary')?.innerText ?? ''`,
    );
    const importConflicts = await options.eval(
      `document.querySelectorAll('.import-conflict').length`,
    );
    const importInvalid = await options.eval(
      `document.querySelectorAll('.import-invalid-item').length`,
    );
    console.log(
      `✓ 标准导入预览: ${importSummary.replace(/\n/g, ' / ')}, 冲突 ${importConflicts}, 无效 ${importInvalid}`,
    );
    if (
      !importSummary.includes('可导入 2 条') ||
      importConflicts !== 2 ||
      importInvalid !== 1
    ) {
      throw new Error('标准导入预览不符合预期');
    }
    await realClick(options, '.import-item-main', 0);
    await sleep(250);
    const previewHeaders = await options.eval(
      `document.querySelector('.import-item-headers')?.innerText ?? ''`,
    );
    console.log(`✓ 预览展开 Header: ${previewHeaders.replace(/\n/g, ' / ')}`);
    if (!previewHeaders.includes('X-Imported') || !previewHeaders.includes('yes')) {
      throw new Error('预览需求 Header 展开不符合预期');
    }
    await realClick(options, '.import-actions .btn.primary');
    await sleep(900);
    const standardImportResult = await options.eval(
      `document.querySelector('.import-result')?.textContent ?? ''`,
    );
    cfg = await getConfig(options);
    const autoIdRequirement = cfg.requirements.find((r) => r.name === '无ID需求');
    console.log(
      `✓ 标准导入: ${standardImportResult}, 需求 ${cfg.requirements.length} 个, 缺省 id 自动生成=${!!autoIdRequirement?.id}`,
    );
    if (
      !standardImportResult.includes('已导入 2 条') ||
      cfg.requirements.length !== 6 ||
      !autoIdRequirement?.id
    ) {
      throw new Error('标准导入结果不符合预期');
    }
    await realClick(options, '.import-actions .btn.primary');
    await sleep(400);

    // 12.6 需求导入：自定义 JS 解析（沙箱执行）
    await realClick(options, '.page-actions-actions .btn', 0);
    if (!(await waitFor(options, `!!document.querySelector('.import-modal')`))) {
      throw new Error('导入弹窗未打开');
    }
    await sleep(700);
    await realClick(options, '.import-mode button', 1);
    await sleep(200);
    await setInput(options, '.import-textarea', IMPORT_CUSTOM_JSON, 0);
    await setInput(options, '.import-code', IMPORT_CUSTOM_CODE, 0);
    const importLayout = await options.eval(`(() => {
      const areas = [...document.querySelectorAll('.import-split .import-textarea')];
      const rects = areas.map((el) => el.getBoundingClientRect());
      return JSON.stringify({
        tops: rects.map((r) => Math.round(r.top)),
        heights: rects.map((r) => Math.round(r.height)),
        extraCodeActions: document.querySelectorAll('.import-code-actions .link-btn').length,
        saveButtons: document.querySelectorAll('.import-code-save').length,
      });
    })()`).then(JSON.parse);
    console.log(
      `✓ 自定义解析布局: top=${importLayout.tops.join('/')}, height=${importLayout.heights.join('/')}, 多余按钮=${importLayout.extraCodeActions}`,
    );
    if (
      importLayout.tops[0] !== importLayout.tops[1] ||
      importLayout.heights[0] !== importLayout.heights[1] ||
      importLayout.extraCodeActions !== 0 ||
      importLayout.saveButtons !== 1
    ) {
      throw new Error('自定义解析布局/按钮不符合预期');
    }
    await realClick(options, '.import-code-save');
    await sleep(400);
    const savedParser = await options.eval(
      `chrome.storage.local.get('parserCode').then(({parserCode}) => parserCode ?? '')`,
    );
    if (savedParser !== IMPORT_CUSTOM_CODE) throw new Error('解析代码保存未生效');
    console.log('✓ 解析代码已保存');
    await realClick(options, '.import-actions .btn.primary');
    await waitImportParsed(options);
    await realClick(options, '.import-actions .btn.primary');
    await sleep(900);
    const customImportResult = await options.eval(
      `document.querySelector('.import-result')?.textContent ?? ''`,
    );
    cfg = await getConfig(options);
    const scriptedRequirement = cfg.requirements.find((r) => r.id === 'EXT-1');
    console.log(
      `✓ 自定义导入: ${customImportResult}, 脚本需求=${scriptedRequirement?.name}, Header=${scriptedRequirement?.headers?.[0]?.value}`,
    );
    if (
      !customImportResult.includes('已导入 1 条') ||
      !scriptedRequirement ||
      scriptedRequirement.headers[0]?.key !== 'X-Lane' ||
      scriptedRequirement.headers[0]?.value !== 'lane-x'
    ) {
      throw new Error('自定义导入结果不符合预期');
    }
    if (cfg.requirements.length !== 7) throw new Error('自定义导入后需求数量不符合预期');
    await realClick(options, '.import-actions .btn.primary');
    await sleep(400);

    // 12.7 唯一键冲突（id）→ 跳过且不可导入
    await realClick(options, '.page-actions-actions .btn', 0);
    if (!(await waitFor(options, `!!document.querySelector('.import-modal')`))) {
      throw new Error('导入弹窗未打开');
    }
    await sleep(700);
    await realClick(options, '.import-mode button', 1);
    await sleep(300);
    const persistedCode = await options.eval(
      `document.querySelector('.import-code')?.value ?? ''`,
    );
    if (persistedCode !== IMPORT_CUSTOM_CODE) throw new Error('解析代码未从存储恢复');
    await setInput(options, '.import-textarea', IMPORT_CUSTOM_JSON, 0);
    await setInput(options, '.import-code', IMPORT_CUSTOM_CODE, 0);
    await realClick(options, '.import-actions .btn.primary');
    await waitImportParsed(options);
    const duplicateConflict = await options.eval(
      `document.querySelector('.import-conflict')?.textContent ?? ''`,
    );
    const duplicateDisabled = await options.eval(
      `document.querySelector('.import-actions .btn.primary')?.disabled ?? false`,
    );
    const emptyImportLabel = await options.eval(
      `document.querySelector('.import-actions .btn.primary')?.textContent ?? ''`,
    );
    console.log(
      `✓ 重复导入唯一键冲突: ${duplicateConflict}, 按钮=${emptyImportLabel}, 禁用=${duplicateDisabled}`,
    );
    if (
      !duplicateConflict.includes('EXT-1') ||
      !duplicateDisabled ||
      !emptyImportLabel.includes('没有可导入的需求')
    ) {
      throw new Error('唯一键冲突未正确阻止导入');
    }
    await realClick(options, '.import-modal .modal-head .icon-btn');
    await sleep(400);

    // 删除被两个系统引用的共享需求
    const sharedIndex = await options.eval(
      `[...document.querySelectorAll('.requirement-card')].findIndex(
         (c) => c.querySelector('.scheme-name')?.value === '需求2')`,
    );
    if (sharedIndex < 0) throw new Error('未找到共享需求卡片');
    await realClick(options, '.requirement-card .req-delete', sharedIndex);
    await sleep(400);
    const confirmShown = await options.eval(`!!document.querySelector('.confirm-modal')`);
    const confirmMessage = await options.eval(
      `document.querySelector('.confirm-message')?.textContent ?? ''`,
    );
    if (!confirmShown || !confirmMessage.includes('2 个系统')) {
      throw new Error(`删除确认弹窗不符合预期: ${confirmMessage}`);
    }
    await realClick(options, '.confirm-modal .btn.danger');
    await sleep(900);
    cfg = await getConfig(options);
    const req2Gone =
      !cfg.requirements.some((r) => r.id === 'req2') &&
      cfg.systems.every((s) => !s.requirementIds.includes('req2'));
    console.log(`✓ 删除共享需求: 需求剩 ${cfg.requirements.length} 个, 引用已清理=${req2Gone}`);
    if (!req2Gone) throw new Error('删除共享需求后引用未清理');

    // 13. 删除系统（共享需求保留）
    const reqCountBeforeSystemDelete = cfg.requirements.length;
    await options.eval(`document.querySelectorAll('.nav-item')[1]?.click()`);
    await sleep(600);
    await realClick(options, '.sys-row-delete', 1);
    await sleep(400);
    const sysConfirmShown = await options.eval(
      `!!document.querySelector('.confirm-modal') && document.querySelector('.confirm-message')?.textContent.includes('共享需求')`,
    );
    await realClick(options, '.confirm-modal .btn:not(.danger)');
    await sleep(400);
    cfg = await getConfig(options);
    const sysKeptOnCancel = cfg.systems.length === 2;
    await realClick(options, '.sys-row-delete', 1);
    await sleep(300);
    await realClick(options, '.confirm-modal .btn.danger');
    await sleep(900);
    cfg = await getConfig(options);
    console.log(
      `✓ 删除系统: 确认弹窗=${sysConfirmShown}, 取消保留=${sysKeptOnCancel}, 系统剩 ${cfg.systems.length} 个, 需求保留 ${cfg.requirements.length} 个`,
    );
    if (!sysConfirmShown || !sysKeptOnCancel || cfg.systems.length !== 1) {
      throw new Error('删除系统未生效');
    }
    if (cfg.requirements.length !== reqCountBeforeSystemDelete) {
      throw new Error('删除系统不应删除共享需求');
    }

    // 13.5 新建系统弹窗 + 列表红字删除
    await realClick(options, '.page-actions .btn.primary');
    if (!(await waitFor(options, `!!document.querySelector('.system-form-modal')`))) {
      throw new Error('新建系统弹窗未打开');
    }
    const sysModalHeight = await options.eval(
      `document.querySelector('.system-form-modal').offsetHeight`,
    );
    await realClick(options, '.system-form-modal .btn.primary');
    await sleep(300);
    const sysInvalid = await options.eval(`(() => {
      const modal = document.querySelector('.system-form-modal');
      return JSON.stringify({
        name: !!modal.querySelector('input.invalid'),
        domain: !!modal.querySelector('.domain-add input.invalid'),
        errorText: modal.querySelectorAll('.form-error').length,
        height: modal.offsetHeight,
      });
    })()`).then(JSON.parse);
    if (
      !sysInvalid.name ||
      !sysInvalid.domain ||
      sysInvalid.errorText !== 0 ||
      sysInvalid.height !== sysModalHeight
    ) {
      throw new Error('新建系统空值描红/弹窗尺寸不符合预期');
    }
    const sysCountBeforeCreate = (await getConfig(options)).systems.length;
    await setInput(options, '.system-form-modal input[type="text"]', '运营后台A', 0);
    await setInput(options, '.system-form-modal .domain-add input', 'modal.acme.cn', 0);
    await sleep(200);
    await realClick(options, '.system-form-modal .domain-add .btn');
    await sleep(200);
    await realClick(options, '.system-form-modal .btn.primary');
    await sleep(400);
    const dupSysError = await options.eval(
      `document.querySelector('.system-form-modal .field-error')?.textContent ?? ''`,
    );
    cfg = await getConfig(options);
    console.log(
      `✓ 新建系统重名: 红字=${dupSysError}, 未创建=${cfg.systems.length === sysCountBeforeCreate}`,
    );
    if (
      !dupSysError.includes('已存在') ||
      cfg.systems.length !== sysCountBeforeCreate
    ) {
      throw new Error('新建系统重名未被阻止或缺少红字提示');
    }
    await setInput(options, '.system-form-modal input[type="text"]', '模态系统', 0);
    await realClick(options, '.system-form-modal .btn.primary');
    await sleep(900);
    cfg = await getConfig(options);
    const modalSystem = cfg.systems.find((s) => s.name === '模态系统');
    const modalDetailShown = await options.eval(
      `!!document.querySelector('.system-detail') && document.querySelector('.system-summary-name')?.textContent === '模态系统'`,
    );
    console.log(
      `✓ 新建系统弹窗: 系统 ${cfg.systems.length} 个, 域名=${modalSystem?.domains.join(',')}, 已进入详情=${modalDetailShown}`,
    );
    if (!modalSystem || !modalDetailShown || modalSystem.domains[0] !== 'modal.acme.cn') {
      throw new Error('新建系统弹窗流程不符合预期');
    }

    await realClick(options, '.system-summary-back');
    await sleep(500);
    const newRowIndex = await options.eval(
      `[...document.querySelectorAll('.sys-row')].findIndex(
         (row) => row.querySelector('.sys-row-name')?.textContent === '模态系统')`,
    );
    if (newRowIndex < 0) throw new Error('未找到新建系统行');
    await realClick(options, '.sys-row-delete', newRowIndex);
    await sleep(300);
    const listDeleteConfirming = await options.eval(
      `!!document.querySelector('.confirm-modal')`,
    );
    await realClick(options, '.confirm-modal .btn.danger');
    await sleep(900);
    cfg = await getConfig(options);
    const rowsAfterDelete = await options.eval(`document.querySelectorAll('.sys-row').length`);
    console.log(
      `✓ 列表删除系统弹窗: 确认弹窗=${listDeleteConfirming}, 系统剩 ${cfg.systems.length} 个, 列表行 ${rowsAfterDelete}`,
    );
    if (!listDeleteConfirming || cfg.systems.length !== 1 || rowsAfterDelete !== 1) {
      throw new Error('列表删除系统流程不符合预期');
    }

    // 14. 常规设置 / 配置导出导入（含解析代码） / 关于 / 深链
    await options.eval(`document.querySelectorAll('.nav-item')[0]?.click()`);
    await sleep(400);

    const exportedText = await options.eval(`(async () => {
      window.__hkExport = null;
      URL.createObjectURL = (blob) => { window.__hkExport = blob; return 'blob:hk-test'; };
      URL.revokeObjectURL = () => {};
      HTMLAnchorElement.prototype.click = function () {};
      document.querySelectorAll('.general-actions .btn')[1].click();
      for (let i = 0; i < 30 && !window.__hkExport; i++) {
        await new Promise((r) => setTimeout(r, 100));
      }
      return window.__hkExport ? await window.__hkExport.text() : '';
    })()`);
    const exportedConfig = JSON.parse(exportedText);
    const storedParser = await options.eval(
      `chrome.storage.local.get('parserCode').then(({parserCode}) => parserCode ?? '')`,
    );
    const exportHasParser = exportedConfig.parserCode === storedParser;
    console.log(`✓ 配置导出包含解析代码: ${exportHasParser}`);
    if (!exportHasParser) throw new Error('配置导出未包含解析代码');

    const importedConfig = await options.eval(`(async () => {
      window.confirm = () => true;
      window.alert = () => {};
      const current = await chrome.storage.local
        .get('laneConfig')
        .then(({ laneConfig }) => laneConfig);
      const payload = { ...current, globalEnabled: false, parserCode: '// imported parser return data;' };
      const file = new File([JSON.stringify(payload)], 'hk-smoke-config.json', {
        type: 'application/json',
      });
      const input = document.querySelector('.general-page input[type="file"]');
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 900));
      const saved = await chrome.storage.local.get(['parserCode', 'laneConfig']);
      return JSON.stringify({
        parserCode: saved.parserCode,
        globalEnabled: saved.laneConfig?.globalEnabled,
      });
    })()`).then(JSON.parse);
    const importRestored =
      importedConfig.parserCode === '// imported parser return data;' &&
      importedConfig.globalEnabled === false;
    console.log(`✓ 配置导入恢复解析代码: ${importRestored}`);
    if (!importRestored) throw new Error('配置导入未恢复解析代码');

    await realClick(options, '.lang-toggle button', 1);
    await sleep(600);
    const english = await options.eval(`document.body.innerText.includes('Interface language')`);
    await realClick(options, '.lang-toggle button', 0);
    await sleep(600);
    const chinese = await options.eval(`document.body.innerText.includes('界面语言')`);
    console.log(`✓ 语言切换: EN=${english}, 中文=${chinese}`);
    if (!english || !chinese) throw new Error('语言切换未生效');

    await options.eval(`document.querySelectorAll('.nav-item')[3]?.click()`);
    await sleep(400);
    const aboutShown = await options.eval(
      `document.body.innerText.includes('Manifest V3') && document.body.innerText.includes('handsometaoa')`,
    );
    console.log(`✓ 关于页: ${aboutShown}`);
    if (!aboutShown) throw new Error('关于页渲染不符合预期');
    await screenshot(options, 'smoke-about.png');
    options.close();

    const deep = await openPage('options.html?system=sys1');
    await sleep(900);
    const deepShown = await deep.eval(
      `!!document.querySelector('.system-detail') && document.querySelector('.system-summary-name')?.textContent === '运营后台A'`,
    );
    console.log(`✓ 深链定位系统详情: ${deepShown}`);
    if (!deepShown) throw new Error('深链未定位到系统详情');
    deep.close();

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
