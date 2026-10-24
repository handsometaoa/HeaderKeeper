import { browser } from '#imports';
import { matchSystems } from '@/lib/domains';
import { activeInjectableRequirement } from '@/lib/requirements';
import { loadConfig } from '@/services/store';

/** 从 URL 提取域名（非 http/https 返回 null） */
function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.hostname : null;
  } catch {
    return null;
  }
}

/** 当前配置下，某个域名实际会注入的 Header 数量 */
function countHeadersForHost(
  config: Awaited<ReturnType<typeof loadConfig>>,
  host: string | null,
): number {
  if (!config.globalEnabled || !host) return 0;
  let count = 0;
  for (const system of matchSystems(config.systems, host)) {
    if (system.enabled === false) continue;
    const requirement = activeInjectableRequirement(config, system);
    if (!requirement) continue;
    count += requirement.headers.filter((h) => h.key.trim() && h.value.trim()).length;
  }
  return count;
}

async function setBadge(text: string) {
  await browser.action.setBadgeBackgroundColor({ color: '#64765c' });
  await browser.action.setBadgeText({ text });
}

/** 按当前活跃标签页的域名刷新角标（非网页页签保持现状不清空） */
export async function refreshBadge(): Promise<void> {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  const host = hostOf(tab?.url);
  if (!host) return;
  const config = await loadConfig();
  const count = countHeadersForHost(config, host);
  await setBadge(count > 0 ? String(count) : '');
}

/** 指定标签页是活跃标签页时才刷新（供 tabs.onUpdated 使用） */
export async function refreshBadgeIfActive(tabId: number): Promise<void> {
  const [active] = await browser.tabs.query({ active: true, currentWindow: true });
  if (active?.id !== tabId) return;
  await refreshBadge();
}
