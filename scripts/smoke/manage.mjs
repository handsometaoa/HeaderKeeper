// 收尾冒烟：删除共享需求/系统、新建系统弹窗、配置导出导入、语言切换、关于页、深链
import { getConfig, realClick, screenshot, setInput, sleep, waitFor } from '../lib/browser.mjs';

export async function run({ open, options }) {
  let cfg;

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

  const deep = await open('options.html?system=sys1');
  await sleep(900);
  const deepShown = await deep.eval(
    `!!document.querySelector('.system-detail') && document.querySelector('.system-summary-name')?.textContent === '运营后台A'`,
  );
  console.log(`✓ 深链定位系统详情: ${deepShown}`);
  if (!deepShown) throw new Error('深链未定位到系统详情');
  deep.close();
}
