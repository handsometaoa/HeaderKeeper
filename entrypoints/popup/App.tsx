import { useEffect, useState } from 'react';
import { browser } from '#imports';
import { matchSystems } from '../../lib/domains';
import { refreshBadge } from '../../lib/badge';
import {
  findHeaderConflicts,
  quickCreateSystem,
  schemeExpired,
  setActiveScheme,
  setSystemEnabled,
} from '../../lib/ops';
import type { LaneConfig, SystemEntry } from '../../lib/types';
import { useLaneConfig } from '../../lib/useLaneConfig';

type Update = (fn: (config: LaneConfig) => LaneConfig) => void;

function openOptions() {
  void browser.runtime.openOptionsPage();
}

function QuickCreate({ host, update }: { host: string; update: Update }) {
  const [name, setName] = useState('');
  return (
    <section className="quick">
      <div className="qc-label mono">NO MATCH</div>
      <div className="qc-title disp">未匹配到系统</div>
      <div className="qc-desc">
        当前域名 <b className="mono">{host}</b> 还没有注入配置
      </div>
      <input
        type="text"
        className="qc-name"
        value={name}
        placeholder={`系统名称（默认 ${host}）`}
        onChange={(e) => setName(e.target.value)}
      />
      <button
        type="button"
        className="btn primary qc-create"
        onClick={() => update((cfg) => quickCreateSystem(cfg, name, host))}
      >
        ＋ 创建系统并匹配此域名
      </button>
      <button type="button" className="link-btn" onClick={openOptions}>
        打开配置页详细编辑 →
      </button>
    </section>
  );
}

function SystemCard({
  system,
  globalEnabled,
  update,
}: {
  system: SystemEntry;
  globalEnabled: boolean;
  update: Update;
}) {
  const enabled = system.enabled !== false;
  // 过期的方案不在主界面展示、也不注入
  const visibleSchemes = system.schemes.filter((s) => !schemeExpired(s));
  const activeScheme = system.schemes.find((s) => s.id === system.activeSchemeId);
  const injecting = enabled && !!activeScheme && !schemeExpired(activeScheme);
  return (
    <section className="system-card">
      <div className="system-head">
        <span className={`sys-dot${injecting ? ' on' : ''}`} />
        <span className="sys-name disp">{system.name || '未命名系统'}</span>
        <span className="sys-domains mono">{system.domains.join(' · ')}</span>
        <label
          className="switch mini"
          title={enabled ? '停用该系统的注入' : '启用该系统的注入'}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => update((cfg) => setSystemEnabled(cfg, system.id, e.target.checked))}
          />
          <span className="track" />
        </label>
      </div>
      <div
        className={
          globalEnabled && enabled ? 'scheme-list' : 'scheme-list dim'
        }
      >
        {system.schemes.length === 0 && <div className="scheme-empty">该系统还没有注入方案</div>}
        {system.schemes.length > 0 && visibleSchemes.length === 0 && (
          <div className="scheme-empty">所有方案均已过期，请在配置页调整过期时间</div>
        )}
        {visibleSchemes.map((scheme, index) => {
          const active = system.activeSchemeId === scheme.id;
          return (
            <button
              type="button"
              key={scheme.id}
              className={`scheme-row${active ? ' active' : ''}`}
              title={active ? '点击取消注入' : '点击应用该方案'}
              onClick={() =>
                update((cfg) => setActiveScheme(cfg, system.id, active ? null : scheme.id))
              }
            >
              <span className="scheme-index mono">{String(index + 1).padStart(2, '0')}</span>
              <span className="scheme-main">
                <span className="scheme-name disp">{scheme.name || '未命名方案'}</span>
                {scheme.description.trim() && (
                  <span className="scheme-desc">{scheme.description}</span>
                )}
              </span>
              <span className="scheme-state mono">{active ? 'ACTIVE' : 'OFF'}</span>
            </button>
          );
        })}
      </div>
      <div className="system-foot">
        <button type="button" className="link-btn" onClick={openOptions}>
          编辑系统 →
        </button>
      </div>
    </section>
  );
}

export default function App() {
  const { config, update } = useLaneConfig();
  const [host, setHost] = useState<string | null>(null);
  const [hostResolved, setHostResolved] = useState(false);

  useEffect(() => {
    // 打开弹窗时按当前页面重算角标：
    // SPA 站内导航（如 github.com）不会触发 tabs.onUpdated，角标可能残留旧值
    void refreshBadge();
  }, []);

  useEffect(() => {
    // __host 查询参数供自动化测试注入假想的当前域名
    const fromQuery = new URLSearchParams(location.search).get('__host');
    if (fromQuery) {
      setHost(fromQuery);
      setHostResolved(true);
      return;
    }
    void (async () => {
      try {
        const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
        const url = tab?.url ? new URL(tab.url) : null;
        setHost(url && /^https?:$/.test(url.protocol) ? url.hostname : null);
      } catch {
        setHost(null);
      }
      setHostResolved(true);
    })();
  }, []);

  if (!config) {
    return <div className="loading">LOADING…</div>;
  }

  const matched = host ? matchSystems(config.systems, host) : [];
  // 多个系统同时注入同一 Header Key 时提示可能冲突
  const conflicts = host ? findHeaderConflicts(config.systems, host) : [];
  // 汇总当前域名下所有系统实际会注入的 Header（含来源系统，列表靠后者覆盖靠前）
  const injectingPairs = config.globalEnabled
    ? matched.flatMap((system) => {
        if (system.enabled === false) return [];
        const scheme = system.schemes.find((s) => s.id === system.activeSchemeId);
        if (!scheme || schemeExpired(scheme)) return [];
        const name = system.name || '未命名系统';
        return scheme.headers
          .filter((h) => h.key.trim() && h.value.trim())
          .map((h) => ({ id: `${system.id}:${h.id}`, key: h.key, value: h.value, system: name }));
      })
    : [];

  return (
    <div className="app">
      <section className="master">
        <div className="master-icon">⇥</div>
        <div className="master-text">
          <div className="master-label mono">MASTER SWITCH</div>
          <div className="master-title disp">
            {config.globalEnabled ? '全局注入已开启' : '全局注入已关闭'}
          </div>
          <div className="master-sub">
            {config.globalEnabled
              ? '所有 ACTIVE 的匹配方案将在请求发送前生效'
              : '开启后注入方案才会应用到请求'}
          </div>
        </div>
        <label className="switch" title={config.globalEnabled ? '关闭全局注入' : '开启全局注入'}>
          <input
            type="checkbox"
            checked={config.globalEnabled}
            onChange={(e) => update((cfg) => ({ ...cfg, globalEnabled: e.target.checked }))}
          />
          <span className="track" />
        </label>
      </section>

      <div className="body">
        {!hostResolved ? (
          <div className="page-hint mono">正在读取当前页面…</div>
        ) : host === null ? (
          <div className="page-hint">当前页面不是普通网页（浏览器内部页面），无法按域名匹配</div>
        ) : (
          <>
            <div className="host-bar">
              <span className="host-label mono">CURRENT HOST</span>
              <span className="host-value mono">{host}</span>
            </div>
            {injectingPairs.length > 0 && (
              <section className="inject-card">
                <div className="inject-head">
                  <span className="inject-label mono">当前注入</span>
                  <span className="inject-count mono">{injectingPairs.length}</span>
                </div>
                <div className="inject-pairs">
                  {injectingPairs.map((pair) => (
                    <div className="inject-pair mono" key={pair.id}>
                      <span className="pair-k">{pair.key}</span>
                      <span className="pair-sep">=</span>
                      <span className="pair-v">{pair.value}</span>
                      <span className="pair-sys">{pair.system}</span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {conflicts.length > 0 && (
              <div className="conflict-card">
                <div className="conflict-title">⚠ 可能存在 Header 冲突</div>
                <div className="conflict-body">
                  {conflicts.map((conflict) => (
                    <div key={conflict.key.toLowerCase()}>
                      <b className="mono">{conflict.key}</b> 同时被{' '}
                      <b>{conflict.systems.join('、')}</b> 注入，列表靠后的系统会覆盖靠前的
                    </div>
                  ))}
                </div>
              </div>
            )}
            {matched.length === 0 ? (
              <QuickCreate host={host} update={update} />
            ) : (
              matched.map((system) => (
                <SystemCard
                  key={system.id}
                  system={system}
                  globalEnabled={config.globalEnabled}
                  update={update}
                />
              ))
            )}
          </>
        )}
      </div>

      <footer className="footer">
        <span className="mono">HEADER INJECTION · LOCAL</span>
        <button type="button" className="link-btn" onClick={openOptions}>
          配置页 →
        </button>
      </footer>
    </div>
  );
}
