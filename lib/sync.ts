import { browser } from '#imports';
import { buildDnrRules } from './dnr';
import { refreshBadge } from './badge';
import { loadConfig } from './store';

async function apply() {
  const config = await loadConfig();
  const rules = buildDnrRules(config);

  const existing = await browser.declarativeNetRequest.getDynamicRules();
  await browser.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: existing.map((r) => r.id),
    addRules: rules as never[],
  });

  // 角标按当前活跃标签页的站点计算（非网页页签保持现状）
  await refreshBadge();
}

// 串行化同步：读-改-写必须原子进行，否则并发同步会因规则 ID 冲突互相踩踏
let queue: Promise<void> = Promise.resolve();

/**
 * 把当前配置应用到 declarativeNetRequest 动态规则。
 * Popup / Options 保存后直接调用（扩展页面有完整 API 权限，无需等待
 * Service Worker 唤醒）；background 在启动、安装和 storage 变化时兜底调用。
 */
export function syncDnrRules(): Promise<void> {
  const task = queue.then(apply).catch((e) => {
    console.error('[泳道] DNR 同步失败:', e);
  });
  queue = task;
  return task;
}
