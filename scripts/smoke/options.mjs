// 设置页冒烟：系统列表编辑/停用、系统详情、新建/关联需求、需求管理与筛选、内联编辑
// 返回保持打开的 options 连接，供后续导入/管理模块继续使用
import {
  getConfig,
  realClick,
  screenshot,
  setSelect,
  setInput,
  sleep,
  sync,
  waitFor,
  reload,
} from '../lib/browser.mjs';
import { testConfig } from './fixtures.mjs';

export async function run({ open }) {
  // ---------- 设置页 ----------
  const options = await open('options.html');
  await options.eval(
    `chrome.storage.local.set({laneConfig: ${JSON.stringify(testConfig())}}).then(() => 'ok')`,
  );
  await sync(options);
  await reload(options);
  await sleep(500);

  const sysRows = await options.eval(`document.querySelectorAll('.sys-row').length`);
  const navItems = await options.eval(`document.querySelectorAll('.nav-item').length`);
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
  if (!pausedText.includes('已停用') || !injectText.includes('注入：')) {
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

  // 11. 关联已有需求（多选）→ 过期需求不进候选 → 解除引用
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
  // 先移出「新建共享需求」凑出两个候选（第一张卡片即它，最新创建）
  await realClick(options, '.req-remove', 0);
  await sleep(700);
  cfg = await getConfig(options);
  if (cfg.systems.find((s) => s.id === 'sys1').requirementIds.length !== 2) {
    throw new Error('移出新建共享需求未生效');
  }
  await realClick(options, '.req-toolbar-actions .btn', 0);
  await sleep(400);
  // 候选 = req3 + 新建共享需求（均未关联 sys1）
  const pickerItems = await options.eval(`document.querySelectorAll('.picker-item').length`);
  if (pickerItems !== 2) throw new Error(`关联弹窗候选数量不符合预期: ${pickerItems}`);
  // 多选两个 → 批量关联
  await realClick(options, '.picker-item', 0);
  await sleep(200);
  await realClick(options, '.picker-item', 1);
  await sleep(200);
  const pickerBtnLabel = await options.eval(
    `document.querySelector('.picker-link')?.textContent ?? ''`,
  );
  await realClick(options, '.picker-link');
  await sleep(700);
  cfg = await getConfig(options);
  const sysAfterLink = cfg.systems.find((s) => s.id === 'sys1');
  console.log(
    `✓ 关联已有需求(多选): 按钮="${pickerBtnLabel}", 系统引用 ${sysAfterLink.requirementIds.length} 个`,
  );
  if (
    sysAfterLink.requirementIds.length !== 4 ||
    !sysAfterLink.requirementIds.includes('req3')
  ) {
    throw new Error('多选批量关联未生效');
  }

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

  // 内联编辑：重复 Header Key 自由写入，描红提示不阻断（注入时 last-wins）
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
    const input = inputs[inputs.length - 1];
    return JSON.stringify({
      invalid: input.classList.contains('invalid'),
      shown: input.value,
      title: input.title.includes('只保留最后一个'),
    });
  })()`).then(JSON.parse);
  cfg = await getConfig(options);
  const req1 = cfg.requirements.find((r) => r.name === '需求1');
  const lastHeader = req1.headers[req1.headers.length - 1];
  console.log(
    `✓ 重复 Header Key: 描红=${dupInvalid.invalid}, 输入保留="${dupInvalid.shown}", 已写入=${lastHeader.key === 'X-Lane'}, 提示=${dupInvalid.title}`,
  );
  if (!dupInvalid.invalid || dupInvalid.shown !== 'X-Lane' || lastHeader.key !== 'X-Lane') {
    throw new Error('重复 Header Key 应自由写入并描红');
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

  return options;
}
