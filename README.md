# HeaderKeeper · Header 注入助手

基于 [WXT](https://wxt.dev) + React + TypeScript 的浏览器插件（Chrome Manifest V3）：**按域名匹配「系统」，每个系统维护多个「需求」注入方案（泳道），在弹窗中一键切换，重写请求 Header**。适用于泳道测试 / 灰度发布 / 多需求并行开发。

<p>
  <img alt="WXT" src="https://img.shields.io/badge/WXT-0.21-7c3aed">
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca">
  <img alt="MV3" src="https://img.shields.io/badge/Manifest-V3-4285f4">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

## 界面

- **弹窗（主界面）**：深色总开关卡片 + 当前域名匹配的系统列表 + 「当前注入」汇总（所有匹配系统实际会发送的 `KEY = VALUE`）+ Key 冲突提醒 + 未匹配时快捷创建系统。
- **配置页**：灰底仪表盘风格，左侧深色系统列表（含注入开关、选中展开详情），右侧方案卡片（倒序展示、右缘方案目录栏快速定位）。

## 核心概念

```
系统（按域名匹配）           需求方案（同一时刻至多一个 ACTIVE）
┌────────────────────┐      ┌──────────────────────────────┐
│ 运营后台            │      │ 01 需求2  李四-结算优化  [ON]  │
│ www.baidu.com      │ ───→ │    X-Lane: feature-cart-b    │
├────────────────────┤      │ 02 需求1  张三-购物车改版  [OFF]│
│ Github             │      │    X-Lane: feature-cart-a    │
│ github.com         │      └──────────────────────────────┘
└────────────────────┘
```

- **系统**：名称（必填、唯一）+ 匹配域名（必填，支持精确与通配符写法 `*.example.com`，两者都命中本域及全部子域名）。
- **需求方案**：名称（必填）+ 描述（可选）+ 任意多条 Header（KEY → VALUE）。在弹窗点选即整体应用，再点取消；同一时刻每个系统至多一个 ACTIVE 方案。
- **过期时间**：方案可设置过期时间，到期后自动停止注入并从弹窗隐藏（配置页标红 EXPIRED，可改期或清除）。
- **三层开关**：全局总闸（弹窗顶部 / 配置页右上角）→ 系统注入开关（系统行右侧）→ 方案 ACTIVE。任一层关闭，该范围就不注入。
- **冲突检测**：同一域名下 ≥2 个开启的系统注入相同 Key 时，弹窗顶部提示冲突并列出 Key 与涉及系统。
- **角标**：工具栏图标显示**当前标签页站点**生效的 Header 数量，未匹配的站点不显示（打开弹窗自动校正，SPA 站内导航也不会残留旧值）。
- **配置导入 / 导出**：JSON 格式，方便团队共享；旧版「规则 → 候选值」结构自动迁移。

## 安装

从 [Releases](https://github.com/handsometaoa/HeaderKeeper/releases) 下载 `*-chrome.zip` 并解压，然后在 Chrome / Edge 的 `扩展管理` 页开启「开发者模式」→「加载已解压的扩展程序」→ 选择解压后的目录。

## 使用方法

1. 点击工具栏插件图标 →「配置页 →」进入管理页，或在弹窗中快捷创建系统。
2. 「＋ 添加系统」填写名称与匹配域名（必填，名称不可重复）。
3. 「＋ 添加注入方案」填写需求名称（必填）与描述（可选），再补上 Header KEY / VALUE（可多条）。
4. 打开弹窗：访问目标站点时自动匹配系统，点选方案即整体切换（ACTIVE），再点取消注入。
5. 修改自动保存并即时生效（基于 `chrome.declarativeNetRequest` 动态规则，无需刷新页面）。

### 验证注入是否生效

> DNR 注入的 Header 在 DevTools 的 Network 面板里**不一定可见**。建议访问 [httpbin.org/headers](https://httpbin.org/headers)（或把系统的域名临时换成它）查看服务端实际收到的请求头；也可运行 `npm run verify:net` 自动验证。

## 数据结构

```ts
interface LaneConfig {
  globalEnabled: boolean;  // 全局注入总开关
  systems: SystemEntry[];  // 系统列表，靠后的系统优先级更高
}

interface SystemEntry {
  name: string;                 // 系统名（唯一）
  domains: string[];            // 匹配域名（含子域名）
  enabled: boolean;             // 系统级注入开关
  activeSchemeId: string | null;// 当前 ACTIVE 的方案，null = 不注入
  schemes: Scheme[];
}

interface Scheme {
  name: string;             // 需求名称
  description: string;      // 描述（可选）
  expiresAt: string | null; // 过期时间（本地 YYYY-MM-DDTHH:mm），null = 永久有效
  headers: { key: string; value: string }[]; // 注入的 Header 键值对
}
```

## 开发

```bash
npm install
npm run dev        # 开发模式（自动打开加载好插件的 Chrome）
npm run build      # 生产构建 → .output/chrome-mv3
npm run zip        # 打包 zip（发布用）
```

| 命令 | 说明 |
| --- | --- |
| `npm run dev` / `dev:firefox` | 开发模式 |
| `npm run build` / `build:firefox` | 生产构建 |
| `npm run zip` | 打包发布 zip |
| `npm run compile` | TypeScript 类型检查 |
| `npm run smoke` | 端到端冒烟测试 |
| `npm run verify:net` | 真实网络注入验证（httpbin.org） |
| `npm run gen:icons` | 重新生成插件图标 |

### 冒烟测试

`npm run smoke` 用全新临时 profile 启动无头 Chrome for Testing（默认路径 `C:/Users/Wgoto/AppData/Local/ChromeForTesting/chrome.exe`，可用 `CHROME_PATH` 覆盖），端到端验证：Popup 渲染、方案切换、存储写入、DNR 规则生成/清理、三层开关、角标按站点显示、方案过期、未匹配快捷创建、Key 冲突提示、配置页渲染与增删流程，并输出截图。运行前请先 `npm run build`。

## 说明与限制

- Header 注入使用 `declarativeNetRequest` 的 `modifyHeaders`，需声明 `<all_urls>` host 权限；本工具面向本地/内网测试，请勿发布到应用商店。
- 多个系统命中同一域名且写入同名 Header 时，系统列表中**靠下的系统覆盖靠上的**（弹窗冲突提示会指出）。
- Firefox 使用 `npm run build:firefox` 构建（需要 Firefox 113+，其 MV3 对 host permission 采用点击授权模式）。

## License

MIT
