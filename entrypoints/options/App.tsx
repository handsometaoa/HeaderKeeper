import { useEffect, useRef, useState } from 'react';
import { browser } from '#imports';
import { parseDomainInput } from '../../lib/domains';
import {
  addPair,
  addScheme,
  addSystem,
  deletePair,
  deleteScheme,
  deleteSystem,
  normalizeConfig,
  schemeExpired,
  setSystemEnabled,
  updatePair,
  updateScheme,
  updateSystem,
} from '../../lib/ops';
import type { HeaderPair, LaneConfig, Scheme, SystemEntry } from '../../lib/types';
import { useLaneConfig } from '../../lib/useLaneConfig';

type Update = (fn: (config: LaneConfig) => LaneConfig) => void;

const pad2 = (n: number) => String(n).padStart(2, '0');

function SchemeCard({
  systemId,
  scheme,
  index,
  active,
  update,
}: {
  systemId: string;
  scheme: Scheme;
  index: number;
  active: boolean;
  update: Update;
}) {
  const expired = schemeExpired(scheme);
  // 两段式确认：第一次点击变为「确认删除」，再点执行；3 秒无操作自动还原
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  return (
    <div
      className={`scheme-card${active ? ' active' : ''}${expired ? ' expired' : ''}`}
      data-scheme-id={scheme.id}
    >
      <div className="scheme-head">
        <span className="scheme-index mono">{pad2(index + 1)}</span>
        <div className="scheme-title">
          <input
            type="text"
            className="scheme-name disp"
            value={scheme.name}
            placeholder="方案名称，如 需求1"
            onChange={(e) =>
              update((cfg) =>
                updateScheme(cfg, systemId, scheme.id, (sc) => ({ ...sc, name: e.target.value })),
              )
            }
          />
          <input
            type="text"
            className="scheme-desc"
            value={scheme.description}
            placeholder="尚未添加说明"
            onChange={(e) =>
              update((cfg) =>
                updateScheme(cfg, systemId, scheme.id, (sc) => ({
                  ...sc,
                  description: e.target.value,
                })),
              )
            }
          />
        </div>
        {active && <span className="active-badge mono">ACTIVE</span>}
        <button
          type="button"
          className={`icon-btn scheme-delete${confirming ? ' confirming' : ''}`}
          title={confirming ? '再次点击确认删除' : '删除该方案'}
          onClick={() => {
            if (confirming) {
              update((cfg) => deleteScheme(cfg, systemId, scheme.id));
            } else {
              setConfirming(true);
            }
          }}
        >
          {confirming ? '确认删除' : '✕'}
        </button>
      </div>

      <div className="scheme-meta">
        <span className="meta-label mono">过期时间</span>
        <input
          type="datetime-local"
          className="expire-input mono"
          value={scheme.expiresAt ?? ''}
          title="过期后自动停止注入并从弹窗隐藏；留空表示永久有效"
          onChange={(e) =>
            update((cfg) =>
              updateScheme(cfg, systemId, scheme.id, (sc) => ({
                ...sc,
                expiresAt: e.target.value || null,
              })),
            )
          }
        />
        {scheme.expiresAt && (
          <button
            type="button"
            className="link-btn"
            title="清除过期时间（恢复永久有效）"
            onClick={() =>
              update((cfg) =>
                updateScheme(cfg, systemId, scheme.id, (sc) => ({ ...sc, expiresAt: null })),
              )
            }
          >
            清除
          </button>
        )}
        {expired && <span className="expired-badge mono">EXPIRED · 已过期，已停止注入</span>}
      </div>

      <div className="pair-table">
        <div className="pair-head mono">
          <span>HEADER KEY</span>
          <span>VALUE</span>
          <span />
        </div>
        {scheme.headers.map((pair: HeaderPair) => (
          <div className="pair-row" key={pair.id}>
            <input
              type="text"
              className="key-input"
              value={pair.key}
              placeholder="Header-Name"
              onChange={(e) =>
                update((cfg) =>
                  updatePair(cfg, systemId, scheme.id, pair.id, { key: e.target.value }),
                )
              }
            />
            <input
              type="text"
              value={pair.value}
              placeholder="Header-Value"
              onChange={(e) =>
                update((cfg) =>
                  updatePair(cfg, systemId, scheme.id, pair.id, { value: e.target.value }),
                )
              }
            />
            <button
              type="button"
              className="icon-btn"
              title="删除该 Header"
              onClick={() => update((cfg) => deletePair(cfg, systemId, scheme.id, pair.id))}
            >
              ✕
            </button>
          </div>
        ))}
        <button
          type="button"
          className="pair-add"
          onClick={() => update((cfg) => addPair(cfg, systemId, scheme.id))}
        >
          ＋ 添加 Header
        </button>
      </div>
    </div>
  );
}

/** 侧栏系统项：选中后在项内展开详情（MATCH / 编辑系统 / 删除系统） */
function SidebarSystem({
  system,
  index,
  otherNames,
  selected,
  onSelect,
  onDelete,
  update,
}: {
  system: SystemEntry;
  index: number;
  otherNames: string[];
  selected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  update: Update;
}) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(system.name);
  const [domainsDraft, setDomainsDraft] = useState(system.domains.join(', '));
  const [editError, setEditError] = useState('');
  // 两段式确认：第一次点击变为「确认删除」，再点执行；3 秒无操作自动还原
  const [confirming, setConfirming] = useState(false);
  useEffect(() => {
    if (!confirming) return;
    const timer = window.setTimeout(() => setConfirming(false), 3000);
    return () => window.clearTimeout(timer);
  }, [confirming]);

  const startEdit = () => {
    setNameDraft(system.name);
    setDomainsDraft(system.domains.join(', '));
    setEditError('');
    setEditing(true);
  };

  const save = () => {
    const name = nameDraft.trim();
    const domains = parseDomainInput(domainsDraft);
    if (!name) return setEditError('系统名称必填');
    if (domains.length === 0) return setEditError('请至少填写一个有效域名');
    if (otherNames.includes(name)) return setEditError('系统名称已存在');
    update((cfg) =>
      updateSystem(cfg, system.id, (s) => ({
        ...s,
        name,
        domains,
      })),
    );
    setEditing(false);
  };

  return (
    <div className={`sys-item-wrap${selected ? ' selected' : ''}`} data-sys-id={system.id}>
      <div
        className="sys-item"
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') onSelect();
        }}
      >
        <span
          className={`sys-dot${system.enabled !== false && system.activeSchemeId ? ' on' : ''}`}
        />
        <span className="sys-item-main">
          <span className="sys-item-name">{system.name || '未命名系统'}</span>
          <span className="sys-item-domains mono">
            {system.domains.join(' · ') || '未设置域名'}
          </span>
        </span>
        <span className="sys-item-idx mono">{pad2(index + 1)}</span>
        <label
          className="switch mini sys-switch"
          title={system.enabled !== false ? '停用该系统的注入' : '启用该系统的注入'}
          onClick={(e) => e.stopPropagation()}
        >
          <input
            type="checkbox"
            checked={system.enabled !== false}
            onChange={(e) => update((cfg) => setSystemEnabled(cfg, system.id, e.target.checked))}
          />
          <span className="track" />
        </label>
      </div>

      {selected && (
        <div className="sys-expand">
          {editing ? (
            <div className="sys-edit">
              <label className="edit-label mono">
                系统名称
                <input
                  type="text"
                  value={nameDraft}
                  placeholder="如 运营后台"
                  onChange={(e) => setNameDraft(e.target.value)}
                />
              </label>
              <label className="edit-label mono">
                匹配域名
                <input
                  type="text"
                  className="mono"
                  value={domainsDraft}
                  placeholder="admin.acme.cn, *.insights.acme.cn"
                  onChange={(e) => setDomainsDraft(e.target.value)}
                />
              </label>
              {editError && <div className="form-error">{editError}</div>}
              <div className="edit-row">
                <button type="button" className="btn primary" onClick={save}>
                  保存
                </button>
                <button type="button" className="btn" onClick={() => setEditing(false)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="sys-expand-row mono">
                <span>MATCH:</span>
                <span className="sys-expand-match">
                  {system.domains.join(' · ') || '未设置域名'}
                </span>
              </div>
              <div className="sys-expand-row">
                <button type="button" className="btn on-dark" onClick={startEdit}>
                  编辑系统
                </button>
                <button
                  type="button"
                  className={`btn sys-delete${confirming ? ' confirming' : ''}`}
                  title={confirming ? '再次点击确认删除' : '删除该系统及其全部方案'}
                  onClick={() => {
                    if (confirming) {
                      onDelete();
                    } else {
                      setConfirming(true);
                    }
                  }}
                >
                  {confirming ? '确认删除？' : '删除系统'}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/** 主区：当前系统的方案列表 */
function SchemeList({ system, update }: { system: SystemEntry; update: Update }) {
  const [adding, setAdding] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [descDraft, setDescDraft] = useState('');
  const [addError, setAddError] = useState('');

  const openAdd = () => {
    setNameDraft('');
    setDescDraft('');
    setAddError('');
    setAdding(true);
  };

  const createScheme = () => {
    const name = nameDraft.trim();
    if (!name) return setAddError('需求名称必填');
    update((cfg) => addScheme(cfg, system.id, { name, description: descDraft.trim() }));
    setAdding(false);
  };

  // 倒序展示：最新创建的方案排在最上面
  const orderedSchemes = [...system.schemes].reverse();

  // 右侧目录栏：锚点是方案卡片，滚动时高亮视口中央的卡片
  const [activeTick, setActiveTick] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const cards = [...document.querySelectorAll('.scheme-card[data-scheme-id]')];
      if (cards.length === 0) return;
      const mid = window.innerHeight / 2;
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      cards.forEach((el, i) => {
        const rect = el.getBoundingClientRect();
        const dist = Math.abs(rect.top + rect.height / 2 - mid);
        if (dist < bestDist) {
          bestDist = dist;
          best = i;
        }
      });
      setActiveTick(best);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, [system.schemes.length, adding]);

  return (
    <section className="detail-panel">
      <div className="schemes-head">
        <span className="kicker mono">SCHEMES · 注入方案</span>
        <span className="schemes-count mono">{pad2(system.schemes.length)}</span>
      </div>

      {/* 右侧目录栏：锚点为方案卡片，点击快速定位 */}
      {orderedSchemes.length > 0 && (
        <nav className="sys-rail" title="方案目录">
          {orderedSchemes.map((scheme, index) => (
            <button
              type="button"
              key={scheme.id}
              className={`sys-rail-tick${index === activeTick ? ' active' : ''}`}
              title={`${pad2(index + 1)} ${scheme.name || '未命名方案'}`}
              onClick={() =>
                document
                  .querySelector(`[data-scheme-id="${scheme.id}"]`)
                  ?.scrollIntoView({ block: 'center', behavior: 'smooth' })
              }
            >
              <span className="tick-bar" />
            </button>
          ))}
        </nav>
      )}

      <div className="schemes">
        {adding ? (
          <div className="scheme-card add-form-scheme">
            <div className="scheme-head">
              <span className="scheme-index mono">＋</span>
              <div className="scheme-title">
                <input
                  type="text"
                  className="scheme-name disp"
                  value={nameDraft}
                  autoFocus
                  placeholder="需求名称，如 需求1"
                  onChange={(e) => setNameDraft(e.target.value)}
                />
                <input
                  type="text"
                  className="scheme-desc"
                  value={descDraft}
                  placeholder="需求描述，如 张三 - 购物车改版"
                  onChange={(e) => setDescDraft(e.target.value)}
                />
              </div>
            </div>
            {addError && <div className="form-error scheme-add-error">{addError}</div>}
            <div className="edit-row scheme-form-actions">
              <button type="button" className="btn primary" onClick={createScheme}>
                创建方案
              </button>
              <button type="button" className="btn" onClick={() => setAdding(false)}>
                取消
              </button>
            </div>
          </div>
        ) : (
          <button type="button" className="btn dashed add-scheme" onClick={openAdd}>
            ＋ 为「{system.name || '未命名系统'}」添加注入方案
          </button>
        )}

        {orderedSchemes.map((scheme, index) => (
          <SchemeCard
            key={scheme.id}
            systemId={system.id}
            scheme={scheme}
            index={orderedSchemes.length - 1 - index}
            active={system.activeSchemeId === scheme.id}
            update={update}
          />
        ))}
        {system.schemes.length === 0 && !adding && (
          <div className="hint">还没有注入方案</div>
        )}
      </div>
    </section>
  );
}

export default function App() {
  const { config, update } = useLaneConfig();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDomains, setNewDomains] = useState('');
  const [addError, setAddError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  // 仅首次加载时自动选中第一个系统；之后删除选中的系统不再自动展开其他系统
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!config || initializedRef.current) return;
    initializedRef.current = true;
    if (config.systems.length > 0) setSelectedId(config.systems[0]!.id);
  }, [config]);

  if (!config) {
    return <div className="loading">LOADING…</div>;
  }

  // 无兜底：选中的系统被删除后保持收起状态
  const current = config.systems.find((s) => s.id === selectedId);

  const openAdd = () => {
    setNewName('');
    setNewDomains('');
    setAddError('');
    setAdding(true);
  };

  const createSystem = () => {
    const name = newName.trim();
    const domains = parseDomainInput(newDomains);
    if (!name) return setAddError('系统名称必填');
    if (domains.length === 0) return setAddError('请至少填写一个有效域名（如 admin.acme.cn）');
    if (config.systems.some((s) => s.name === name)) return setAddError('系统名称已存在');
    const result = addSystem(config, { name, domains });
    update(() => result);
    setSelectedId(result.newId);
    setAdding(false);
  };

  /** 删除系统；若删除的是当前选中的，则改为选中它的上一个（没有则选后一个） */
  const removeSystem = (systemId: string) => {
    const index = config.systems.findIndex((s) => s.id === systemId);
    if (index === -1) return;
    const wasSelected = current?.id === systemId;
    update((cfg) => deleteSystem(cfg, systemId));
    if (wasSelected) {
      const neighbor = config.systems[index - 1] ?? config.systems[index + 1];
      setSelectedId(neighbor?.id ?? null);
    }
  };

  const exportConfig = () => {
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `header-injection-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importConfig = async (file: File) => {
    try {
      const imported = normalizeConfig(JSON.parse(await file.text()));
      if (
        window.confirm(
          `导入 ${imported.systems.length} 个系统并覆盖当前全部配置？\n（可先「导出」备份当前配置）`,
        )
      ) {
        update(() => imported);
        setSelectedId(null);
      }
    } catch {
      window.alert('导入失败：不是有效的配置文件');
    }
  };

  return (
    <div className="page">
      <div className="shell">
        <aside className="sidebar">
          <div className="side-brand">
            <div className="brand-mark">⇥</div>
            <div>
              <div className="side-kicker mono">NETWORK TOOLKIT</div>
              <div className="side-brand-name disp">Header 注入助手</div>
            </div>
          </div>

          <div className="side-label mono">
            <span>TARGETS · 系统</span>
            <span>{pad2(config.systems.length)}</span>
          </div>

          <div className="sys-list">
            {config.systems.map((system, index) => (
              <SidebarSystem
                key={system.id}
                system={system}
                index={index}
                otherNames={config.systems
                  .filter((s) => s.id !== system.id)
                  .map((s) => s.name)}
                selected={current?.id === system.id}
                onSelect={() => setSelectedId(system.id)}
                onDelete={() => removeSystem(system.id)}
                update={update}
              />
            ))}
            {config.systems.length === 0 && <div className="side-hint">暂无系统</div>}
          </div>

          {adding ? (
            <div className="sys-edit add-form">
              <label className="edit-label mono">
                系统名称 *
                <input
                  type="text"
                  value={newName}
                  placeholder="如 运营后台"
                  onChange={(e) => setNewName(e.target.value)}
                />
              </label>
              <label className="edit-label mono">
                匹配域名 *
                <input
                  type="text"
                  className="mono"
                  value={newDomains}
                  placeholder="admin.acme.cn"
                  onChange={(e) => setNewDomains(e.target.value)}
                />
              </label>
              {addError && <div className="form-error">{addError}</div>}
              <div className="edit-row">
                <button type="button" className="btn primary" onClick={createSystem}>
                  创建
                </button>
                <button type="button" className="btn" onClick={() => setAdding(false)}>
                  取消
                </button>
              </div>
            </div>
          ) : (
            <button type="button" className="btn add-sys" onClick={openAdd}>
              ＋ 添加系统
            </button>
          )}

          <div className="side-note">
            域名支持精确匹配和通配符（如 *.example.com），两者都命中本域及全部子域名；通配符写法原样保留。方案的选择在弹窗主界面进行。
          </div>
        </aside>

        <main className="main">
          <header className="topbar">
            <div className="title-block">
              <div className="kicker mono">NETWORK TOOLKIT / 01</div>
              <h1 className="disp">Let&apos;s switch lanes!</h1>
            </div>
            <div className="head-actions">
              <label className="engine-pill">
                <span className="engine-dot" />
                规则已保存至本地
              </label>
              <label className="pill-toggle" title="全局注入开关">
                全局注入
                <span className="switch mini">
                  <input
                    type="checkbox"
                    checked={config.globalEnabled}
                    onChange={(e) => update((cfg) => ({ ...cfg, globalEnabled: e.target.checked }))}
                  />
                  <span className="track" />
                </span>
              </label>
              <button type="button" className="btn" onClick={exportConfig}>
                导出
              </button>
              <button type="button" className="btn" onClick={() => fileInputRef.current?.click()}>
                导入
              </button>
            </div>
          </header>

          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void importConfig(file);
              e.target.value = '';
            }}
          />

          {!config.globalEnabled && (
            <div className="banner">全局注入已关闭，所有系统都不会注入 Header（可在插件弹窗中开启）</div>
          )}

          {current ? (
            <SchemeList key={current.id} system={current} update={update} />
          ) : config.systems.length > 0 ? (
            <div className="empty">点击左侧系统名称，查看与编辑注入方案</div>
          ) : (
            <div className="empty">点击左侧「＋ 添加系统」创建第一个系统</div>
          )}

          <footer className="page-foot mono">
            修改自动保存并即时生效 · 用 httpbin.org/headers 验证注入结果 ·
            <button
              type="button"
              className="link-btn"
              onClick={() => void browser.tabs.create({ url: 'https://httpbin.org/headers' })}
            >
              打开验证页
            </button>
          </footer>
        </main>
      </div>
    </div>
  );
}
