import { useEffect, useRef, useState } from 'react';
import {
  applyRequirementImport,
  prepareRequirementImport,
} from '@/lib/requirementImport';
import type { ImportPreview } from '@/lib/requirementImport';
import type { LaneConfig } from '@/lib/types';
import type { T } from '@/lib/i18n';
import type { Update } from '@/hooks/useLaneConfig';

const JSON_PLACEHOLDER = `[
  {
    "name": "需求1",
    "description": "示例需求",
    "headers": [{ "key": "X-Lane", "value": "feature-a" }]
  }
]`;

const DEFAULT_CODE = `// data 是解析后的 JSON；返回标准需求数组
return data.map((item) => ({
  id: item.id,              // 可选：外部唯一编号
  name: item.name,
  description: item.desc ?? '',
  expiresAt: null,
  headers: [],
}));`;

type Mode = 'standard' | 'custom';

interface SandboxPending {
  id: string;
  resolve: (value: unknown) => void;
  reject: (reason: Error) => void;
  timer: number;
}

export function RequirementImportModal({
  config,
  update,
  t,
  onClose,
}: {
  config: LaneConfig;
  update: Update;
  t: T;
  onClose: () => void;
}) {
  const [mode, setMode] = useState<Mode>('standard');
  const [jsonText, setJsonText] = useState('');
  const [codeText, setCodeText] = useState(DEFAULT_CODE);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [rawResult, setRawResult] = useState<unknown>(null);
  const [parsing, setParsing] = useState(false);
  const [result, setResult] = useState<{ ok: number; skipped: number } | null>(null);

  const iframeRef = useRef<HTMLIFrameElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sandboxReady = useRef(false);
  const pendingRef = useRef<SandboxPending | null>(null);
  // 与 options.html 同目录；由 manifest 的 sandbox.pages 声明为隔离页
  const sandboxUrl = './sandbox.html';

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

  /** 在隔离沙箱中执行用户解析代码；5 秒超时 */
  const runSandbox = (data: unknown, code: string) =>
    new Promise<unknown>((resolve, reject) => {
      const win = iframeRef.current?.contentWindow;
      if (!win) {
        reject(new Error(t('import.errorSandbox')));
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
      // 沙箱可能还在加载：发 ping 探测，最多等 3 秒
      win.postMessage({ type: 'hk-ping' }, '*');
      const wait = () => {
        if (sandboxReady.current) {
          send();
          return;
        }
        if (Date.now() - started > 3000) {
          reject(new Error(t('import.errorSandbox')));
          return;
        }
        window.setTimeout(wait, 60);
      };
      wait();
    });

  const resetOutput = () => {
    setError('');
    setPreview(null);
    setRawResult(null);
    setResult(null);
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
      const raw = mode === 'custom' ? await runSandbox(data, codeText) : data;
      const prepared = prepareRequirementImport(config, raw);
      if (!prepared) {
        setError(t('import.errorResult'));
        return;
      }
      setRawResult(raw);
      setPreview(prepared);
    } catch (e) {
      setError(t('import.errorCode', { msg: e instanceof Error ? e.message : String(e) }));
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
    setResult({
      ok: finalPreview.accepted.length,
      skipped: finalPreview.conflicts.length + finalPreview.invalid.length,
    });
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
            <div className="import-help">
              {mode === 'standard' ? t('import.standardHelp') : t('import.customJsonHelp')}
            </div>
          </div>

          {mode === 'custom' && (
            <div className="import-field">
              <span className="import-label">{t('import.codeLabel')}</span>
              <textarea
                className="import-textarea import-code mono"
                value={codeText}
                spellCheck={false}
                onChange={(e) => {
                  setCodeText(e.target.value);
                  resetOutput();
                }}
              />
              <div className="import-help">{t('import.codeHelp')}</div>
            </div>
          )}

          {error && <div className="import-error">{error}</div>}

          <div className="import-toolbar">
            <button
              type="button"
              className="btn"
              disabled={parsing || !jsonText.trim()}
              onClick={() => void handleParse()}
            >
              {parsing ? t('import.parsing') : t('import.parse')}
            </button>
          </div>

          {preview && (
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
                  {preview.accepted.slice(0, 8).map((requirement) => (
                    <div className="import-item" key={requirement.id}>
                      <span className="import-item-name">{requirement.name}</span>
                      <span className="import-item-meta mono">
                        {t('import.headers', { n: requirement.headers.length })}
                      </span>
                    </div>
                  ))}
                  {preview.accepted.length > 8 && (
                    <div className="import-more">
                      {t('import.more', { n: preview.accepted.length - 8 })}
                    </div>
                  )}
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
          )}
        </div>

        <div className="import-actions">
          {result ? (
            <>
              <span className="import-result">
                {t('import.success', { ok: result.ok, skipped: result.skipped })}
              </span>
              <button type="button" className="btn primary" onClick={onClose}>
                {t('import.done')}
              </button>
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={!preview || preview.accepted.length === 0}
                onClick={handleImport}
              >
                {preview && preview.accepted.length > 0
                  ? t('import.importButton', { n: preview.accepted.length })
                  : t('import.importButtonEmpty')}
              </button>
            </>
          )}
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
        />
      </div>
    </div>
  );
}
