# HeaderKeeper · Header 注入助手

基于 [WXT](https://wxt.dev) + React + TypeScript 的浏览器插件（Chrome Manifest V3）：**按域名匹配「系统」，系统引用共享需求库中的「需求」（泳道），在弹窗中一键切换，重写请求 Header**。适用于泳道测试 / 灰度发布 / 多需求并行开发。

<p>
  <img alt="WXT" src="https://img.shields.io/badge/WXT-0.21-7c3aed">
  <img alt="React" src="https://img.shields.io/badge/React-19-149eca">
  <img alt="MV3" src="https://img.shields.io/badge/Manifest-V3-4285f4">
  <img alt="License" src="https://img.shields.io/badge/license-MIT-green">
</p>

## 界面

- **弹窗（主界面）**：顶部品牌栏（右上角齿轮进入配置页）+ 浅色总开关卡片 + 「当前注入 / 系统」双 Tab（标签带数量，可左右切换，滚动时吸顶，默认停在「当前注入」并记住上次选择）+ Key 冲突提醒 + 未匹配时快捷创建系统。当前注入 Tab 汇总所有匹配系统实际会发送的 `KEY = VALUE`。
- **配置页**：暖白底 + 莫兰迪绿点缀，系统无衬线字体；左侧导航固定贴边、上下通栏（常规设置 / 系统管理 / 需求管理 / 关于），右侧为内容区。系统列表点击进入详情，详情顶部使用绿色信息头；需求管理提供全量共享需求的筛选、内联编辑与导入。常规设置内含语言切换与配置导入/导出。

## 界面截图

**弹窗主界面** —— 全局总开关、当前注入 / 系统双 Tab、一键切换需求：

![弹窗主界面](docs/images/popup.png)

**系统管理** —— 系统列表、域名匹配与注入开关：

![系统管理](docs/images/options.png)

**需求管理** —— 共享需求库、引用系统、筛选与内联编辑：

![需求管理](docs/images/requirements.png)

**需求导入** —— 标准 JSON，或写一段 JS 把任意 JSON 转换成标准格式；唯一键冲突自动跳过：

![需求导入](docs/images/import.png)

## 核心概念

```
系统（按域名匹配）                   共享需求库（可被多个系统引用）
┌────────────────────┐              ┌──────────────────────────────┐
│ 运营后台            │  引用 req1    │ 需求1  X-Lane: feature-cart-a │
│ admin.acme.cn      │ ───────────→ ├──────────────────────────────┤
├────────────────────┤  引用 req2    │ 需求2  X-Lane: feature-cart-b │
│ 会员中心            │ ───────────→ │        （被两个系统共享）      │
│ *.member.acme.cn   │              └──────────────────────────────┘
└────────────────────┘
```

- **系统**：名称（必填、唯一）+ 一个或多个匹配域名（支持精确与通配符写法 `*.example.com`，两者都命中本域及全部子域名）+ 引用的共享需求。
- **共享需求**：独立存在于需求库中，名称（必填）+ 描述（可选）+ 过期时间 + 任意多条 Header（Header 名 → 值）。同一个需求可被多个系统同时引用；在任一系统里修改都会同步到所有引用系统。
- **使用中**：每个系统至多一个「使用中」的需求；在弹窗点选即整体应用，再点取消。多个系统可以同时使用同一个需求。
- **过期时间**：需求可设置过期时间，到期后自动停止注入并从弹窗隐藏（配置页显示「已过期」，可改期或清除）。
- **三层开关**：全局总闸（弹窗顶部 / 配置页右上角）→ 系统注入开关（系统列表右侧）→ 需求使用状态。任一层关闭，该范围就不注入。
- **冲突检测**：同一域名下 ≥2 个开启的系统注入相同 Key 时，弹窗顶部提示冲突并列出 Key 与涉及系统。
- **角标**：工具栏图标显示**当前标签页站点**生效的 Header 数量，未匹配的站点不显示（打开弹窗自动校正，SPA 站内导航也不会残留旧值）。
- **需求导入**：支持标准需求 JSON，也支持「自定义解析」——粘贴任意 JSON，再写一段 JS 把它转换成标准需求格式。解析代码在隔离沙箱中执行；唯一键优先使用 `id`，缺省使用需求名称，冲突项跳过并汇报。
- **配置导入 / 导出**：位于「常规设置 → 配置数据」，v2 JSON 格式，方便团队共享；旧版配置不做迁移，见下方说明。

## 安装

从 [Releases](https://github.com/handsometaoa/HeaderKeeper/releases) 下载 `*-chrome.zip` 并解压，然后在 Chrome / Edge 的 `扩展管理` 页开启「开发者模式」→「加载已解压的扩展程序」→ 选择解压后的目录。

## 使用方法

1. 点击工具栏插件图标，再点弹窗右上角齿轮进入配置页；也可以在未匹配的站点上直接快捷创建系统。
2. 在「系统管理」点「＋ 新建系统」，在弹窗中填写名称，并用多域名编辑器添加匹配规则（支持批量粘贴）。
3. 点击系统进入详情：可修改名称/域名；「＋ 新建需求」弹窗会在共享库创建并自动关联当前系统，「＋ 关联已有需求」可复用其他系统已建好的需求。
4. 在「需求管理」集中维护共享需求：按需求名称、Header 值、过期状态筛选；卡片可直接内联编辑；卡片上会列出引用它的系统。
5. 打开弹窗：默认展示「当前注入」，切到「系统」点选需求即整体切换（使用中），再点取消注入。
6. 修改自动保存并即时生效（基于 `chrome.declarativeNetRequest` 动态规则，无需刷新页面）。

### 验证注入是否生效

> DNR 注入的 Header 在 DevTools 的 Network 面板里**不一定可见**。建议访问 [httpbin.org/headers](https://httpbin.org/headers)（或把系统的域名临时换成它）查看服务端实际收到的请求头；也可运行 `npm run verify:net` 自动验证。

## 数据结构

```ts
interface LaneConfig {
  version: 2;
  globalEnabled: boolean;        // 全局注入总开关
  language?: 'zh' | 'en';        // 界面语言
  requirements: Requirement[];   // 共享需求库
  systems: SystemEntry[];        // 系统列表，靠后的系统优先级更高
}

interface SystemEntry {
  name: string;                 // 系统名（唯一）
  domains: string[];            // 匹配域名（含子域名）
  enabled: boolean;             // 系统级注入开关
  requirementIds: string[];     // 引用的共享需求
  activeRequirementId: string | null; // 当前使用中的需求，null = 不注入
}

interface Requirement {
  name: string;             // 需求名称
  description: string;      // 描述（可选）
  expiresAt: string | null; // 过期时间（本地 YYYY-MM-DDTHH:mm），null = 永久有效
  createdAt: number;        // 创建时间（毫秒时间戳），用于列表倒序
  headers: { key: string; value: string }[]; // 注入的 Header 键值对
}
```

> **旧版配置说明**：此版本不再迁移旧结构（`systems[].schemes` / 旧 `rules`）。首次加载新版时，旧配置会原样备份到 `chrome.storage.local` 的 `laneConfigLegacyBackup` 键，然后重置为新版默认配置。

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

`npm run smoke` 用全新临时 profile 启动无头 Chrome for Testing（默认路径 `C:/Users/Wgoto/AppData/Local/ChromeForTesting/chrome.exe`，可用 `CHROME_PATH` 覆盖），端到端验证：旧配置备份/重置、Popup 默认 Tab 与记忆、需求切换、DNR 规则生成/清理、三层开关、角标按站点显示、需求过期、未匹配快捷创建、Key 冲突提示、系统详情改名/多域名、新建/关联/移出需求、需求筛选与内联编辑、标准/自定义需求导入与唯一键冲突、共享需求删除、系统删除、语言切换、关于页与深链定位，并输出截图。运行前请先 `npm run build`。

## 项目结构

```
entrypoints/              # WXT 入口
  background/index.ts     # 后台：DNR 同步兜底、tabs 事件刷新角标
  popup/                  # 弹窗主界面（App + components/）
  options/                # 配置页（App + components/）
lib/                      # 领域模型与纯逻辑（不依赖浏览器 API）
  types.ts                # 数据模型
  domains.ts              # 域名解析与匹配
  ops.ts                  # 配置增删改与导入清洗
  requirements.ts         # 共享需求选择器 / 过期判断 / 筛选排序
  requirementImport.ts    # 需求导入标准化 / 唯一键冲突检查
  conflicts.ts            # 跨系统 Key 冲突检测
  dnr.ts                  # declarativeNetRequest 规则构建
services/                 # 浏览器平台服务
  store.ts                # 配置存储（旧结构备份后重置）
  sync.ts                 # DNR 动态规则串行同步
  badge.ts                # 按站点刷新工具栏角标
hooks/                    # React hooks（useLaneConfig：加载 / 防抖保存）
utils/                    # 通用工具（uid / format）
public/sandbox.html       # 需求导入的 JS 解析沙箱（无插件 API 权限）
styles/                   # 共享样式（设计令牌与基础组件）
scripts/                  # 图标生成 / 冒烟测试 / 网络验证
```

## 说明与限制

- Header 注入使用 `declarativeNetRequest` 的 `modifyHeaders`，需声明 `<all_urls>` host 权限；本工具面向本地/内网测试，请勿发布到应用商店。
- 多个系统命中同一域名且写入同名 Header 时，系统列表中**靠下的系统覆盖靠上的**（弹窗冲突提示会指出）。
- Firefox 使用 `npm run build:firefox` 构建（需要 Firefox 113+，其 MV3 对 host permission 采用点击授权模式）。

## 作者
- GitHub：<https://github.com/handsometaoa>
- 项目仓库：<https://github.com/handsometaoa/HeaderKeeper>
- 问题反馈：<https://github.com/handsometaoa/HeaderKeeper/issues>

如果这个工具对你有帮助，欢迎去仓库点个 Star ⭐

## License

MIT
