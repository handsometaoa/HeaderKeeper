import type { Language } from './i18n';

/** 一个 Header 键值对（需求内的注入项） */
export interface HeaderPair {
  id: string;
  /** Header 名称，如 X-Lane */
  key: string;
  /** 注入的值 */
  value: string;
}

/**
 * 共享需求：独立存在于需求库中，可被多个系统引用。
 * 修改会同步影响所有引用它的系统。
 */
export interface Requirement {
  id: string;
  /** 需求名，如 需求1 */
  name: string;
  /** 说明/备注 */
  description: string;
  /** 过期时间（本地时间 YYYY-MM-DDTHH:mm）；null = 永久有效。过期后不注入且不在弹窗展示 */
  expiresAt: string | null;
  /** 创建时间（毫秒时间戳），用于列表倒序 */
  createdAt: number;
  headers: HeaderPair[];
}

/**
 * 一个系统：按域名匹配一组共享需求。
 * 同一时刻至多一个需求处于「使用中」（activeRequirementId）。
 */
export interface SystemEntry {
  id: string;
  /** 系统名，如 运营后台 */
  name: string;
  /** 匹配域名，支持精确与通配符写法（*.example.com 归一化为 example.com，均含子域名） */
  domains: string[];
  /** 系统级注入开关：false 时该系统不注入（即使有使用中的需求） */
  enabled: boolean;
  /** 引用的共享需求 id（顺序即弹窗中的展示顺序） */
  requirementIds: string[];
  /** 当前使用中的需求 id；null = 不注入。必须属于 requirementIds */
  activeRequirementId: string | null;
}

/** 界面主题：light 浅色 / dark 深色 / system 跟随系统 */
export type ThemeSetting = 'light' | 'dark' | 'system';

export interface LaneConfig {
  /** 配置结构版本：v2 = 共享需求库 */
  version: 2;
  /** 全局注入总开关，关闭后不注入任何 Header */
  globalEnabled: boolean;
  /** 界面语言（zh = 中文，en = English）；缺省为 zh */
  language?: Language;
  /** 界面主题（light = 浅色，dark = 深色，system = 跟随系统）；缺省为 system */
  theme?: ThemeSetting;
  /** 共享需求库 */
  requirements: Requirement[];
  systems: SystemEntry[];
}
