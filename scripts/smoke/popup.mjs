// Popup 冒烟：旧配置重置、Tab 记忆、需求切换、DNR、三层开关、角标、过期、快捷创建、冲突检测
import {
  clickUntil,
  getConfig,
  realClick,
  screenshot,
  setInput,
  sleep,
  waitBadge,
  waitDnrCount,
  reload,
} from '../lib/browser.mjs';
import { LEGACY_CONFIG } from './fixtures.mjs';

export async function run({ open }) {
  // 0. 旧结构配置：备份 + 重置为 v2 默认配置
  const setup = await open('options.html');
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
  const popup = await open('popup.html?__host=admin.acme.cn');
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

  const popup2 = await open('popup.html?__host=admin.acme.cn');
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
  await open('https://admin.acme.cn/');
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

  const popup3 = await open('popup.html?__host=admin.acme.cn');
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
  const popup4 = await open('popup.html?__host=unknown.acme.test');
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
  const popup5 = await open('popup.html?__host=admin.acme.cn');
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
}
