import { useEffect, useRef, useState } from 'react';
import { browser } from '#imports';
import {
  applyRequirementImport,
  prepareRequirementImport,
} from '@/lib/requirementImport';
import {
  DEFAULT_PARSER_CODE,
  loadParserCode,
  saveParserCode,
} from '@/services/parserStore';
import type { ImportPreview } from '@/lib/requirementImport';
import type { LaneConfig } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';

const JSON_PLACEHOLDER = `[
    {
        "id": "req-123",
        "name": "需求123",
        "description": "示例需求",
        "expiresAt": "2026-12-31T23:59",
        "headers": {
            "X-Lane": "feature-a"
        }
    }
]`;

type Mode = 'standard' | 'custom';

interface SandboxPending {
  id: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
}

/** 沙箱页本身不可用（未加载/未就绪），与用户代码报错区分 */
class SandboxUnavailableError extends Error {}

export function RequirementImportModal({
  config,
  update,
  t,
  onClose,
  onImported,
}: {
  config: LaneConfig;
  update: Update;
  t: T;
  onClose: () => void;
  /** 导入写入成功后回调（ok=导入条数，skipped=冲突+无效条数），随后弹窗立即关闭 */
  onImported: (ok: number, skipped: number) => void;
}) {
  const [mode, setMode] = useState<Mode>('standard');
  const [jsonText, setJsonText] = useState('');
  const [codeText, setCodeText] = useState(DEFAULT_PARSER_CODE);
  const [codeStatus, setCodeStatus] = useState('');
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rawResult, setRawResult] = useState<unknown>(null);
  const [parsing, setParsing] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const iframeLoadedRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const sandboxReady = useRef(false);
  const pendingRef = useRef<SandboxPending | null>(null);
  // 绝对扩展 URL，避免相对路径在 dev/不同 options URL 下解析到错误位置
  const sandboxUrl = browser.runtime.getURL('/sandbox.html' as never);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== iframeRef.current?.contentWindow) return;
      const data = event.data as
        | { type?: string; id?: string; ok?: boolean; result?: unknown; error?: string }
        | null;
      if (!data) return;
      if (data.type === 'hk-sandbox-ready') {
        sandboxReady.current = true;
        return;
      }
      if (
        data.type === 'hk-eval-result' &&
        pendingRef.current &&
        data.id === pendingRef.current.id
      ) {
        const pending = pendingRef.current;
        pendingRef.current = null;
        window.clearTimeout(pending.timer);
        if (data.ok) pending.resolve(data.result);
        else pending.reject(new Error(data.error || 'unknown error'));
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(
    () => () => {
      if (pendingRef.current) {
        window.clearTimeout(pendingRef.current.timer);
        pendingRef.current = null;
      }
    },
    [],
  );

  // 打开弹窗时恢复上次保存的解析代码
  useEffect(() => {
    let alive = true;
    loadParserCode()
      .then((code) => {
        if (alive) setCodeText(code);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const saveCode = async () => {
    try {
      await saveParserCode(codeText);
      setCodeStatus(t('import.codeSaved'));
      window.setTimeout(() => setCodeStatus(''), 2000);
    } catch {
      setCodeStatus(t('import.codeSaveFailed'));
    }
  };

  /** 在隔离沙箱中执行用户解析代码；就绪最多等 6 秒，执行最多 5 秒 */
  const runSandbox = (data: unknown, code: string) =>
    new Promise<unknown>((resolve, reject) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) {
        reject(new SandboxUnavailableError(t('import.errorSandboxMissing')));
        return;
      }
      const send = () => {
        const id = `hk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
        const timer = window.setTimeout(() => {
          if (pendingRef.current?.id === id) {
            pendingRef.current = null;
            reject(new Error(t('import.errorTimeout')));
          }
        }, 5000);
        pendingRef.current = { id, resolve, reject, timer };
        win.postMessage({ type: 'hk-eval', id, data, code }, '*');
      };
      const started = Date.now();
      const wait = () => {
        if (sandboxReady.current) {
          send();
          return;
        }
        if (Date.now() - started > 6000) {
          reject(
            new SandboxUnavailableError(
              iframeLoadedRef.current
                ? t('import.errorSandboxBlocked')
                : t('import.errorSandboxMissing'),
            ),
          );
          return;
        }
        // 反复 ping：避免沙箱页晚于首次探测完成初始化导致误报
        win.postMessage({ type: 'hk-ping' }, '*');
        window.setTimeout(wait, 300);
      };
      wait();
    });

  const resetOutput = () => {
    setError('');
    setPreview(null);
    setRawResult(null);
    setExpandedId(null);
  };

  const switchMode = (next: Mode) => {
    setMode(next);
    resetOutput();
  };

  const handleParse = async () => {
    resetOutput();
    let data: unknown;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      setError(t('import.errorJson', { msg: e instanceof Error ? e.message : String(e) }));
      return;
    }

    setParsing(true);
    try {
      if (mode === 'custom') {
        // 先做一次运行时自检：旧开发构建/旧 zip 可能没有 manifest sandbox 页
        const manifest = browser.runtime.getManifest() as {
          sandbox?: { pages?: string[] };
        };
        if (!manifest.sandbox?.pages?.includes('sandbox.html')) {
          setError(t('import.errorSandboxManifest'));
          return;
        }
        try {
          const response = await fetch(sandboxUrl, { cache: 'no-store' });
          if (!response.ok) {
            setError(t('import.errorSandboxFile'));
            return;
          }
        } catch {
          setError(t('import.errorSandboxFile'));
          return;
        }
      }

      const raw = mode === 'custom' ? await runSandbox(data, codeText) : data;
      const prepared = prepareRequirementImport(config, raw);
      if (!prepared) {
        setError(t('import.errorResult'));
        return;
      }
      setRawResult(raw);
      setPreview(prepared);
    } catch (e) {
      if (e instanceof SandboxUnavailableError) {
        setError(e.message);
      } else {
        setError(t('import.errorCode', { msg: e instanceof Error ? e.message : String(e) }));
      }
    } finally {
      setParsing(false);
    }
  };

  const handleImport = () => {
    if (rawResult === null) return;
    // 用最新配置再校验一次，避免预览后配置发生变化
    const finalPreview = prepareRequirementImport(config, rawResult);
    if (!finalPreview) {
      setError(t('import.errorResult'));
      return;
    }
    setPreview(finalPreview);
    if (finalPreview.accepted.length === 0) {
      setError(t('import.previewEmpty'));
      return;
    }
    update((cfg) => applyRequirementImport(cfg, finalPreview.accepted));
    // 提示与关闭都交给需求页：立即关闭弹窗，顶部 toast 展示结果
    onImported(
      finalPreview.accepted.length,
      finalPreview.conflicts.length + finalPreview.invalid.length,
    );
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      setJsonText(await file.text());
      resetOutput();
    } catch {
      setError(t('import.errorFile'));
    }
  };

  return (
    <div className="modal-backdrop">
      <div
        className="modal import-modal"
        role="dialog"
        aria-modal="true"
        aria-label={t('import.title')}
      >
        <div className="modal-head">
          <h3 className="modal-title">{t('import.title')}</h3>
          <button
            type="button"
            className="icon-btn"
            onClick={onClose}
            aria-label={t('common.cancel')}
          >
            ✕
          </button>
        </div>

        <div className="import-body">
          <section className="import-section import-source">
            <div className="import-section-head">
              <div className="import-step-title">
                <span className="import-step mono">01</span>
                <span>{t('import.sourceTitle')}</span>
              </div>
              <div className="import-mode" role="tablist" aria-label={t('import.title')}>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'standard'}
              className={mode === 'standard' ? 'on' : ''}
              onClick={() => switchMode('standard')}
            >
              {t('import.mode.standard')}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'custom'}
              className={mode === 'custom' ? 'on' : ''}
              onClick={() => switchMode('custom')}
            >
              {t('import.mode.custom')}
            </button>
              </div>
            </div>

          {mode === 'custom' ? (
            <div className="import-split">
              <div className="import-field">
                <div className="import-label-row">
                  <span className="import-label">{t('import.jsonLabel')}</span>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => fileRef.current?.click()}
                  >
                    {t('import.chooseFile')}
                  </button>
                </div>
                <textarea
                  className="import-textarea mono"
                  value={jsonText}
                  placeholder={JSON_PLACEHOLDER}
                  spellCheck={false}
                  onChange={(e) => {
                    setJsonText(e.target.value);
                    resetOutput();
                  }}
                />
                <div className="import-help">{t('import.customJsonHelp')}</div>
              </div>

              <div className="import-field">
                <div className="import-label-row">
                  <span className="import-label">{t('import.codeLabel')}</span>
                  <div className="import-code-actions">
                    {codeStatus && (
                      <span className="import-code-status">{codeStatus}</span>
                    )}
                    <button
                      type="button"
                      className="btn import-code-save"
                      onClick={() => void saveCode()}
                    >
                      {t('import.codeSave')}
                    </button>
                  </div>
                </div>
                <textarea
                  className="import-textarea import-code mono"
                  value={codeText}
                  spellCheck={false}
                  onChange={(e) => {
                    setCodeText(e.target.value);
                    setCodeStatus('');
                    resetOutput();
                  }}
                />
                <div className="import-help">{t('import.codeHelp')}</div>
              </div>
            </div>
          ) : (
            <div className="import-field">
              <div className="import-label-row">
                <span className="import-label">{t('import.jsonLabel')}</span>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => fileRef.current?.click()}
                >
                  {t('import.chooseFile')}
                </button>
              </div>
              <textarea
                className="import-textarea mono"
                value={jsonText}
                placeholder={JSON_PLACEHOLDER}
                spellCheck={false}
                onChange={(e) => {
                  setJsonText(e.target.value);
                  resetOutput();
                }}
              />
              <div className="import-help">{t('import.standardHelp')}</div>
            </div>
          )}

            {error && <div className="import-error">{error}</div>}
          </section>

          <section
            className={`import-section import-preview-section${preview ? '' : ' is-empty'}`}
          >
            <div className="import-section-head">
              <div className="import-step-title">
                <span className="import-step mono">02</span>
                <span>{t('import.previewTitle')}</span>
              </div>
            </div>

            {preview ? (
              <div className="import-preview">
                <div className="import-summary">
                <span className="import-chip">{t('import.total', { n: preview.total })}</span>
                <span className="import-chip ok">
                  {t('import.accepted', { n: preview.accepted.length })}
                </span>
                <span className="import-chip warn">
                  {t('import.conflictsCount', { n: preview.conflicts.length })}
                </span>
                <span className="import-chip">
                  {t('import.invalidCount', { n: preview.invalid.length })}
                </span>
              </div>

              {preview.accepted.length > 0 && (
                <div className="import-list">
                  {preview.accepted.map((requirement, index) => {
                    const itemKey = `${requirement.id}-${index}`;
                    const open = expandedId === itemKey;
                    return (
                      <div className={`import-item${open ? ' open' : ''}`} key={itemKey}>
                        <button
                          type="button"
                          className="import-item-main"
                          aria-expanded={open}
                          onClick={() => setExpandedId(open ? null : itemKey)}
                        >
                          <span className="import-item-name">{requirement.name}</span>
                          <span className="import-item-meta mono">
                            {t('import.headers', { n: requirement.headers.length })}
                            <span className="import-item-chevron" aria-hidden="true">
                              ▾
                            </span>
                          </span>
                        </button>
                        {open && (
                          <div className="import-item-headers">
                            {requirement.headers.length === 0 ? (
                              <span className="import-header-empty">—</span>
                            ) : (
                              requirement.headers.map((header, headerIndex) => (
                                <div
                                  className="import-header-row"
                                  key={`${header.key}-${headerIndex}`}
                                >
                                  <span className="import-header-key mono">{header.key}</span>
                                  <span className="import-header-sep" aria-hidden="true">
                                    =
                                  </span>
                                  <span className="import-header-value mono">{header.value}</span>
                                </div>
                              ))
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {preview.conflicts.length > 0 && (
                <div className="import-conflicts">
                  <div className="import-section-title">{t('import.conflictTitle')}</div>
                  {preview.conflicts.map((conflict, index) => (
                    <div
                      className="import-conflict"
                      key={`${conflict.keyType}:${conflict.keyValue}:${index}`}
                    >
                      {t('import.conflictLine', {
                        name: conflict.name,
                        key:
                          conflict.keyType === 'id'
                            ? `id: ${conflict.keyValue}`
                            : `${t('import.keyName')}: ${conflict.keyValue}`,
                      })}
                    </div>
                  ))}
                </div>
              )}

              {preview.invalid.length > 0 && (
                <div className="import-invalid">
                  <div className="import-section-title">{t('import.invalidTitle')}</div>
                  {preview.invalid.map((item) => (
                    <div className="import-invalid-item" key={item.index}>
                      {t('import.invalidLine', {
                        index: item.index + 1,
                        reason:
                          item.reason === 'missing-name'
                            ? t('import.invalidName')
                            : t('import.invalidItem'),
                      })}
                    </div>
                  ))}
                </div>
              )}
              </div>
            ) : (
              <div className="import-preview-empty">{t('import.previewHint')}</div>
            )}
          </section>
        </div>

        <div className="import-actions">
          <button type="button" className="btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn primary"
            disabled={
              preview
                ? preview.accepted.length === 0
                : parsing || !jsonText.trim()
            }
            onClick={() => {
              if (preview) handleImport();
              else void handleParse();
            }}
          >
            {preview
              ? preview.accepted.length > 0
                ? t('import.importButton', { n: preview.accepted.length })
                : t('import.importButtonEmpty')
              : parsing
                ? t('import.parsing')
                : t('import.parse')}
          </button>
        </div>

        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={(e) => {
            void handleFile(e.target.files?.[0]);
            e.target.value = '';
          }}
        />

        <iframe
          ref={iframeRef}
          src={sandboxUrl}
          className="import-sandbox"
          title="HeaderKeeper parser sandbox"
          aria-hidden="true"
          tabIndex={-1}
          onLoad={() => {
            iframeLoadedRef.current = true;
          }}
        />
      </div>
    </div>
  );
}
