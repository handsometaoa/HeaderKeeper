import { defineBackground, browser } from '#imports';
import { syncDnrRules } from '../lib/sync';
import { refreshBadge, refreshBadgeIfActive } from '../lib/badge';

export default defineBackground(() => {
  browser.runtime.onInstalled.addListener(() => void syncDnrRules());
  browser.runtime.onStartup.addListener(() => void syncDnrRules());
  // 兜底消息通道：任何上下文都可以请求重新同步
  //（Popup / Options 保存后会在各自页面内直接同步，这里用于同步角标等）
  browser.runtime.onMessage.addListener((msg: { type?: string }) => {
    if (msg?.type === 'sync-dnr') {
      void syncDnrRules();
    }
    return false;
  });
  // 切换标签页 / 页面导航时，按当前站点刷新角标
  browser.tabs.onActivated.addListener(() => void refreshBadge());
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.url || changeInfo.status) void refreshBadgeIfActive(tabId);
  });
});
