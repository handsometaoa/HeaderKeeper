// 需求导入冒烟：标准 JSON、自定义 JS 沙箱解析、唯一键冲突（复用 options.mjs 打开的连接）
import { getConfig, realClick, setInput, sleep, waitFor, waitImportParsed } from '../lib/browser.mjs';
import { IMPORT_CUSTOM_CODE, IMPORT_CUSTOM_JSON, IMPORT_STANDARD_JSON } from './fixtures.mjs';

export async function run({ options }) {
  let cfg;

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
    importConflicts !== 3 ||
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
}
