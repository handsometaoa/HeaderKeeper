import type { Language } from './i18n';

/** 一个 Header 键值对（需求方案内的注入项） */
export interface HeaderPair {
  id: string;
  /** Header 名称，如 X-Lane */
  key: string;
  /** 注入的值 */
  value: string;
}

/**
 * 一个需求方案（泳道）：一次切换会整体应用该方案内的所有 Header。
 * 例如「需求1 - 张三购物车改版」: X-Lane: feature-cart-a
 */
export interface Scheme {
  id: string;
  /** 方案名，如 需求1 */
  name: string;
  /** 说明/备注 */
  description: string;
  /** 过期时间（本地时间 YYYY-MM-DDTHH:mm）；null = 永久有效。过期后不注入且不在弹窗展示 */
  expiresAt: string | null;
  headers: HeaderPair[];
}

/**
 * 一个系统：按域名匹配的一组注入方案。
 * 同一时刻至多一个方案处于 ACTIVE（activeSchemeId）。
 */
export interface SystemEntry {
  id: string;
  /** 系统名，如 运营后台 */
  name: string;
  /** 匹配域名，支持精确与通配符写法（*.example.com 归一化为 example.com，均含子域名） */
  domains: string[];
  /** 系统级注入开关：false 时该系统不注入（即使有 ACTIVE 方案） */
  enabled: boolean;
  /** 当前 ACTIVE 的方案 id；null = 不注入 */
  activeSchemeId: string | null;
  schemes: Scheme[];
}

export interface LaneConfig {
  /** 全局注入总开关，关闭后不注入任何 Header */
  globalEnabled: boolean;
  /** 界面语言（zh = 中文，en = English）；缺省为 zh */
  language?: Language;
  systems: SystemEntry[];
}
