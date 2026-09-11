// 端到端冒烟测试：自动启动带插件的 Chrome for Testing（全新 profile），验证
// Popup 渲染、需求方案切换、存储写入、DNR 动态规则同步、总开关与快捷创建，测完自动关闭。
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
  ).then(JSON.parse);
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

/** 轮询等待 DNR 规则数量达到期望值（注意回调参数直接是规则数组） */
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
    await sleep(1500); // 等扩展初始化

    // 1. Popup 渲染（命中示例系统 admin.acme.cn）
    const popup = await openPage('popup.html?__host=admin.acme.cn');
    console.log('✓ 插件页面可访问:', await popup.eval('chrome.runtime.getManifest().name'));

    const banners = await popup.eval(`document.querySelectorAll('.master').length`);
    const systems = await popup.eval(`document.querySelectorAll('.system-card').length`);
    const schemes = await popup.eval(`document.querySelectorAll('.scheme-row').length`);
    const sampleVisible = await popup.eval(
      `document.body.innerText.includes('运营后台') && document.body.innerText.includes('需求1') && document.body.innerText.includes('张三 - 购物车改版')`,
    );
    console.log(
      `✓ Popup 渲染: 总开关=${banners === 1}, ${systems} 个系统, ${schemes} 个方案, 示例数据可见=${sampleVisible}`,
    );
    if (banners !== 1 || systems !== 1 || schemes !== 2 || !sampleVisible) {
      throw new Error('Popup 渲染不符合预期');
    }

    // 2. 点击「需求1」→ ACTIVE + 存储写入 + DNR 规则
    await clickUntil(
      popup,
      '.scheme-row',
      `document.querySelectorAll('.scheme-row.active').length === 1`,
    );
    console.log('  · 需求1 已选中 (ACTIVE)');
    await sleep(800);

    const stored = await popup.eval(
      `chrome.storage.local.get('laneConfig').then(({laneConfig}) => ({
         activeSchemeId: laneConfig.systems[0].activeSchemeId,
         firstSchemeId: laneConfig.systems[0].schemes[0].id,
       }))`,
    );
    console.log(`✓ 存储写入: activeSchemeId === schemes[0].id → ${stored.activeSchemeId === stored.firstSchemeId}`);
    if (stored.activeSchemeId !== stored.firstSchemeId) throw new Error('存储状态与预期不符');

    const dnrCount = await waitDnrCount(popup, 1);
    const rule = await popup
      .eval(
        `new Promise(res => chrome.declarativeNetRequest.getDynamicRules(r => res(JSON.stringify(r[0] ?? null))))`,
      )
      .then((s) => JSON.parse(s));
    const header = rule?.action?.requestHeaders?.[0];
    console.log(`✓ DNR 规则: ${dnrCount} 条, ${header?.header}=${header?.value}, 域名=${rule?.condition?.requestDomains?.join(',')}`);
    if (dnrCount !== 1 || header?.header !== 'X-Lane' || header?.value !== 'feature-cart-a') {
      throw new Error('DNR 规则未正确生成');
    }

    // 2.5 角标按当前站点显示：打开匹配域名的网页标签页后应显示 1
    const webTab = await openPage('https://admin.acme.cn/');
    const badge = await waitBadge(popup, '1');
    console.log(`✓ 角标(admin.acme.cn 页签): "${badge}"`);
    if (badge !== '1') throw new Error('角标未按当前站点显示');

    // 2.5 当前注入汇总：显示匹配系统的 Key=Value
    const injectShown = await popup.eval(
      `document.body.innerText.includes('当前注入') && document.body.innerText.includes('X-Lane') && document.body.innerText.includes('feature-cart-a') && document.body.innerText.includes('运营后台')`,
    );
    console.log(`✓ 当前注入汇总: ${injectShown}`);
    if (!injectShown) throw new Error('当前注入汇总未展示');

    // 3. 总开关关闭 → 规则清空；再开启 → 规则恢复
    await clickUntil(
      popup,
      '.master .switch input',
      `!document.querySelector('.master .switch input').checked`,
    );
    const offCount = await waitDnrCount(popup, 0);
    console.log(`✓ 总开关关闭后 DNR 规则: ${offCount} 条`);
    if (offCount !== 0) throw new Error('总开关关闭后规则未清理');
    const badgeOff = await waitBadge(popup, '');
    console.log(`✓ 总开关关闭后角标: "${badgeOff}"`);
    if (badgeOff !== '') throw new Error('总开关关闭后角标未清空');

    await clickUntil(
      popup,
      '.master .switch input',
      `document.querySelector('.master .switch input').checked`,
    );
    const onCount = await waitDnrCount(popup, 1);
    console.log(`✓ 总开关重新开启后 DNR 规则: ${onCount} 条`);
    if (onCount !== 1) throw new Error('总开关开启后规则未恢复');
    const badgeOn = await waitBadge(popup, '1');
    console.log(`✓ 总开关重新开启后角标: "${badgeOn}"`);
    if (badgeOn !== '1') throw new Error('总开关开启后角标未恢复');

    // 3.5 系统级注入开关：关闭 → 规则清空；开启 → 恢复
    await clickUntil(
      popup,
      '.system-head .switch input',
      `!document.querySelector('.system-head .switch input').checked`,
    );
    const sysOff = await waitDnrCount(popup, 0);
    const badgeSysOff = await waitBadge(popup, '');
    console.log(`✓ 系统开关关闭后 DNR 规则: ${sysOff} 条, 角标: "${badgeSysOff}"`);
    if (sysOff !== 0 || badgeSysOff !== '') throw new Error('系统开关关闭后未清理');

    await clickUntil(
      popup,
      '.system-head .switch input',
      `document.querySelector('.system-head .switch input').checked`,
    );
    const sysOn = await waitDnrCount(popup, 1);
    const badgeSysOn = await waitBadge(popup, '1');
    console.log(`✓ 系统开关重新开启后 DNR 规则: ${sysOn} 条, 角标: "${badgeSysOn}"`);
    if (sysOn !== 1 || badgeSysOn !== '1') throw new Error('系统开关开启后未恢复');

    // 4. 再次点击方案取消 → 规则清空
    await clickUntil(
      popup,
      '.scheme-row',
      `document.querySelectorAll('.scheme-row.active').length === 0`,
    );
    const cleared = await waitDnrCount(popup, 0);
    const badgeCleared = await waitBadge(popup, '');
    console.log(`✓ 取消方案后 DNR 规则: ${cleared} 条, 角标: "${badgeCleared}"`);
    if (cleared !== 0 || badgeCleared !== '') throw new Error('取消方案后 DNR 规则未清理');

    // 5. 重新选中便于截图 → Popup 截图
    await clickUntil(
      popup,
      '.scheme-row',
      `document.querySelectorAll('.scheme-row.active').length === 1`,
    );
    const badgeReselect = await waitBadge(popup, '1');
    console.log(`✓ 重新选中后角标: "${badgeReselect}"`);
    if (badgeReselect !== '1') throw new Error('重新选中后角标未恢复');
    await sleep(800);
    await screenshot(popup, 'smoke-popup.png');

    // 6. 方案过期：ACTIVE 方案过期后不再注入、且不在弹窗展示
    await popup.eval(`(async () => {
      const {laneConfig} = await chrome.storage.local.get('laneConfig');
      const sys = laneConfig.systems[0];
      const active = sys.schemes.find((s) => s.id === sys.activeSchemeId);
      active.expiresAt = '2020-01-01T00:00';
      await chrome.storage.local.set({laneConfig});
      await browser.runtime.sendMessage({type:'sync-dnr'});
      return 'ok';
    })()`);
    await sleep(1200);
    const expiredRows = await popup.eval(`document.querySelectorAll('.scheme-row').length`);
    const expiredDnr = await waitDnrCount(popup, 0);
    const expiredHidden = await popup.eval(
      `!document.body.innerText.includes('张三 - 购物车改版') && document.body.innerText.includes('需求2')`,
    );
    console.log(
      `✓ 方案过期: 可见方案 ${expiredRows} 个(剩1), DNR ${expiredDnr} 条, 过期方案已隐藏=${expiredHidden}`,
    );
    if (expiredRows !== 1 || expiredDnr !== 0 || !expiredHidden) {
      throw new Error('过期逻辑不符合预期');
    }
    popup.close();

    // 7. 未匹配域名 → 快捷创建系统
    const popup2 = await openPage('popup.html?__host=unknown.acme.test');
    const noMatch = await popup2.eval(`document.body.innerText.includes('未匹配到系统')`);
    console.log(`✓ 未匹配提示可见=${noMatch}`);
    if (!noMatch) throw new Error('未匹配提示未出现');
    await popup2.eval(`(() => {
      const el = document.querySelector('.qc-name');
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(el, '数据平台');
      el.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`);
    await realClick(popup2, '.qc-create');
    await sleep(800);
    const qcSystems = await popup2.eval(
      `chrome.storage.local.get('laneConfig').then(({laneConfig}) => laneConfig.systems.length)`,
    );
    const qcVisible = await popup2.eval(`document.querySelectorAll('.system-card').length`);
    console.log(`✓ 快捷创建: storage ${qcSystems} 个系统, 页面显示 ${qcVisible} 张系统卡片`);
    if (qcSystems !== 2 || qcVisible !== 1) throw new Error('快捷创建未生效');
    popup2.close();

    // 8. Key 冲突检测：两个系统同域名 + 同 Key 注入 → 弹窗提示冲突并列出 Key
    const popup3 = await openPage('popup.html?__host=admin.acme.cn');
    await popup3.eval(`(async () => {
      const {laneConfig} = await chrome.storage.local.get('laneConfig');
      const sys0 = laneConfig.systems[0];
      // 恢复过期用例中系统1的方案有效期，使其恢复注入
      sys0.schemes.find((s) => s.id === sys0.activeSchemeId).expiresAt = null;
      const sys = laneConfig.systems[1]; // 快捷创建的系统（无默认方案，补一个）
      sys.domains = ['admin.acme.cn'];
      sys.schemes.push({id: 'sc9', name: '需求X', description: '', expiresAt: null,
        headers: [{id: 'p9', key: 'X-Lane', value: 'other-lane'}]});
      sys.activeSchemeId = 'sc9';
      await chrome.storage.local.set({laneConfig});
      await browser.runtime.sendMessage({type:'sync-dnr'});
      return 'ok';
    })()`);
    await sleep(1200);
    const conflictShown = await popup3.eval(
      `document.body.innerText.includes('可能存在 Header 冲突') && document.body.innerText.includes('X-Lane')`,
    );
    const conflictDnr = await popup3.eval(
      `new Promise(res => chrome.declarativeNetRequest.getDynamicRules(r => res(r.length)))`,
    );
    console.log(`✓ 冲突检测: 提示可见=${conflictShown}, DNR 规则 ${conflictDnr} 条(两系统各1条)`);
    if (!conflictShown || conflictDnr !== 2) throw new Error('冲突检测不符合预期');
    await screenshot(popup3, 'smoke-popup-conflict.png');
    popup3.close();

    // 9. Options 页渲染 + 截图
    const options = await openPage('options.html');
    let sysItemReady = false;
    for (let i = 0; i < 12; i++) {
      sysItemReady = await options.eval(`!!document.querySelector('.scheme-delete')`);
      if (sysItemReady) break;
      await sleep(500);
    }
    const optionOk = await options.eval(
      `document.body.innerText.includes('Header 注入助手') && document.body.innerText.includes('添加系统') && document.body.innerText.includes('HEADER KEY') && document.body.innerText.includes('过期时间')`,
    );
    console.log(`✓ Options 页渲染正常=${optionOk}`);
    if (!optionOk || !sysItemReady) throw new Error('Options 页渲染不符合预期');

    // 10. 添加系统表单：名称/域名必填校验 + 名称唯一校验 + 创建
    await realClick(options, '.add-sys');
    await sleep(400);
    const formShown = await options.eval(`!!document.querySelector('.add-form')`);
    await realClick(options, '.add-form .btn.primary'); // 空表单直接提交
    await sleep(300);
    const errRequired = await options.eval(`document.body.innerText.includes('系统名称必填')`);
    // 重名校验：填已存在的名称
    await options.eval(`(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const inputs = document.querySelectorAll('.add-form input');
      setter.call(inputs[0], '运营后台');
      inputs[0].dispatchEvent(new Event('input', { bubbles: true }));
      setter.call(inputs[1], 'new1.acme.cn');
      inputs[1].dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`);
    await realClick(options, '.add-form .btn.primary');
    await sleep(300);
    const errDuplicate = await options.eval(`document.body.innerText.includes('系统名称已存在')`);
    const countBeforeCreate = await options.eval(
      `chrome.storage.local.get('laneConfig').then(({laneConfig}) => laneConfig.systems.length)`,
    );
    // 改为唯一名称后创建
    await options.eval(`(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const nameInput = document.querySelector('.add-form input');
      setter.call(nameInput, '验收系统');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`);
    await realClick(options, '.add-form .btn.primary');
    await sleep(800);
    const addSysCount = await options.eval(
      `chrome.storage.local.get('laneConfig').then(({laneConfig}) => laneConfig.systems.length)`,
    );
    const addSysName = await options.eval(
      `chrome.storage.local.get('laneConfig').then(({laneConfig}) => laneConfig.systems[2]?.name)`,
    );
    console.log(
      `✓ 添加系统: 表单=${formShown}, 必填报错=${errRequired}, 重名报错=${errDuplicate}(数量仍 ${countBeforeCreate}), 创建后 ${addSysCount} 个系统(名称=${addSysName})`,
    );
    if (
      !formShown || !errRequired || !errDuplicate || countBeforeCreate !== 2 ||
      addSysCount !== 3 || addSysName !== '验收系统'
    ) {
      throw new Error('添加系统流程不符合预期');
    }

    // 11. 添加方案表单：名称/描述必填 + 创建
    await realClick(options, '.add-scheme');
    await sleep(400);
    const schemeFormShown = await options.eval(`!!document.querySelector('.add-form-scheme')`);
    await realClick(options, '.add-form-scheme .btn.primary'); // 空表单直接提交
    await sleep(300);
    const schemeErr = await options.eval(`document.body.innerText.includes('需求名称必填')`);
    await options.eval(`(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      const nameInput = document.querySelector('.add-form-scheme .scheme-name');
      setter.call(nameInput, '需求1');
      nameInput.dispatchEvent(new Event('input', { bubbles: true }));
      return 'ok';
    })()`);
    await realClick(options, '.add-form-scheme .btn.primary');
    await sleep(800);
    const schemeInfo = JSON.parse(
      await options.eval(
        `chrome.storage.local.get('laneConfig').then(({laneConfig}) => {
           const s = laneConfig.systems[2].schemes[0];
           return JSON.stringify({name: s?.name, desc: s?.description});
         })`,
      ),
    );
    console.log(
      `✓ 添加方案: 表单=${schemeFormShown}, 空提交报错=${schemeErr}, 创建方案=${schemeInfo.name}/描述可为空(${schemeInfo.desc === ''})`,
    );
    if (!schemeFormShown || !schemeErr || schemeInfo.name !== '需求1' || schemeInfo.desc !== '') {
      throw new Error('添加方案流程不符合预期');
    }

    // 12. 删除选中的系统：两段式确认 + 自动选中上一个系统
    await realClick(options, '.sys-item', 1); // 选中第二个系统（数据平台）
    await sleep(400);
    await realClick(options, '.sys-delete');
    await sleep(300);
    const sysConfirming = await options.eval(
      `document.querySelector('.sys-delete')?.textContent.includes('确认删除')`,
    );
    await realClick(options, '.sys-delete'); // 二次确认删除
    await sleep(800);
    const afterDelCount = await options.eval(
      `chrome.storage.local.get('laneConfig').then(({laneConfig}) => laneConfig.systems.length)`,
    );
    const prevSelected = await options.eval(
      `document.querySelector('.sys-item-wrap.selected .sys-item-name')?.textContent`,
    );
    console.log(
      `✓ 删除系统: 确认态=${sysConfirming}, 剩余 ${afterDelCount} 个系统, 自动选中上一个=${prevSelected} (应为 运营后台)`,
    );
    if (!sysConfirming || afterDelCount !== 2 || prevSelected !== '运营后台') {
      throw new Error('删除系统流程不符合预期');
    }

    await screenshot(options, 'smoke-options.png');
    options.close();

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
