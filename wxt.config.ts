import { defineConfig } from 'wxt';

export default defineConfig({
  modules: ['@wxt-dev/module-react'],
  manifest: {
    name: 'Header 注入助手',
    description: '按域名匹配系统，每个系统维护多个需求注入方案（泳道），一键切换重写请求 Header',
    author: { email: '2216662881@qq.com' },
    homepage_url: 'https://github.com/handsometaoa/HeaderKeeper',
    permissions: ['storage', 'declarativeNetRequest'],
    host_permissions: ['<all_urls>'],
    icons: {
      16: '/icon-16.png',
      48: '/icon-48.png',
      128: '/icon-128.png',
    },
  },
});
