import { useCallback, useEffect, useRef, useState, type ChangeEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useNotificationStore, useThemeStore } from '@/stores';
import {
  oauthApi,
  type OAuthProvider,
  type IFlowCookieAuthResponse,
  type NotionImportResponse
} from '@/services/api/oauth';
import { vertexApi, type VertexImportResponse } from '@/services/api/vertex';
import { copyToClipboard } from '@/utils/clipboard';
import styles from './OAuthPage.module.scss';
import iconCodexLight from '@/assets/icons/codex_light.svg';
import iconCodexDark from '@/assets/icons/codex_drak.svg';
import iconClaude from '@/assets/icons/claude.svg';
import iconAntigravity from '@/assets/icons/antigravity.svg';
import iconGemini from '@/assets/icons/gemini.svg';
import iconKimiLight from '@/assets/icons/kimi-light.svg';
import iconKimiDark from '@/assets/icons/kimi-dark.svg';
import iconQwen from '@/assets/icons/qwen.svg';
import iconIflow from '@/assets/icons/iflow.svg';
import iconNotion from '@/assets/icons/notion.svg';
import iconVertex from '@/assets/icons/vertex.svg';

interface ProviderState {
  url?: string;
  state?: string;
  status?: 'idle' | 'waiting' | 'success' | 'error';
  error?: string;
  polling?: boolean;
  projectId?: string;
  projectIdError?: string;
  callbackUrl?: string;
  callbackSubmitting?: boolean;
  callbackStatus?: 'success' | 'error';
  callbackError?: string;
}

interface IFlowCookieState {
  cookie: string;
  loading: boolean;
  result?: IFlowCookieAuthResponse;
  error?: string;
  errorType?: 'error' | 'warning';
}

interface NotionImportState {
  tokenV2: string;
  baseUrl: string;
  prefix: string;
  extractedText: string;
  loading: boolean;
  result?: NotionImportResponse;
  error?: string;
}

interface VertexImportResult {
  projectId?: string;
  email?: string;
  location?: string;
  authFile?: string;
}

interface VertexImportState {
  file?: File;
  fileName: string;
  location: string;
  loading: boolean;
  error?: string;
  result?: VertexImportResult;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object';
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (isRecord(error) && typeof error.message === 'string') return error.message;
  return typeof error === 'string' ? error : '';
}

function getErrorStatus(error: unknown): number | undefined {
  if (!isRecord(error)) return undefined;
  return typeof error.status === 'number' ? error.status : undefined;
}

function getFileNameFromPath(path?: string): string {
  const normalized = String(path ?? '').trim();
  if (!normalized) return '';
  const parts = normalized.split(/[\\/]/).filter(Boolean);
  return parts.length > 0 ? parts[parts.length - 1] : '';
}

const PROVIDERS: { id: OAuthProvider; titleKey: string; hintKey: string; urlLabelKey: string; icon: string | { light: string; dark: string } }[] = [
  { id: 'codex', titleKey: 'auth_login.codex_oauth_title', hintKey: 'auth_login.codex_oauth_hint', urlLabelKey: 'auth_login.codex_oauth_url_label', icon: { light: iconCodexLight, dark: iconCodexDark } },
  { id: 'anthropic', titleKey: 'auth_login.anthropic_oauth_title', hintKey: 'auth_login.anthropic_oauth_hint', urlLabelKey: 'auth_login.anthropic_oauth_url_label', icon: iconClaude },
  { id: 'antigravity', titleKey: 'auth_login.antigravity_oauth_title', hintKey: 'auth_login.antigravity_oauth_hint', urlLabelKey: 'auth_login.antigravity_oauth_url_label', icon: iconAntigravity },
  { id: 'gemini-cli', titleKey: 'auth_login.gemini_cli_oauth_title', hintKey: 'auth_login.gemini_cli_oauth_hint', urlLabelKey: 'auth_login.gemini_cli_oauth_url_label', icon: iconGemini },
  { id: 'kimi', titleKey: 'auth_login.kimi_oauth_title', hintKey: 'auth_login.kimi_oauth_hint', urlLabelKey: 'auth_login.kimi_oauth_url_label', icon: { light: iconKimiLight, dark: iconKimiDark } },
  { id: 'qwen', titleKey: 'auth_login.qwen_oauth_title', hintKey: 'auth_login.qwen_oauth_hint', urlLabelKey: 'auth_login.qwen_oauth_url_label', icon: iconQwen }
];

const CALLBACK_SUPPORTED: OAuthProvider[] = ['codex', 'anthropic', 'antigravity', 'gemini-cli'];
const getProviderI18nPrefix = (provider: OAuthProvider) => provider.replace('-', '_');
const getAuthKey = (provider: OAuthProvider, suffix: string) =>
  `auth_login.${getProviderI18nPrefix(provider)}_${suffix}`;

const NOTION_EXTRACT_SCRIPT = String.raw`(async () => {
  const token_v2 = prompt('Paste token_v2 from Cookies', '') || '';
  const response = await fetch('/api/v3/loadUserContent', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
    credentials: 'include'
  });
  const data = await response.json();
  const pick = (obj) => Object.keys(obj || {})[0] || '';
  const user_id = pick(data.recordMap?.notion_user);
  const space_id = pick(data.recordMap?.space);
  const space_view_id = pick(data.recordMap?.space_view);
  const user = data.recordMap?.notion_user?.[user_id]?.value || {};
  const payload = {
    token_v2,
    space_id,
    user_id,
    space_view_id,
    user_name: user.given_name || user.name || '',
    user_email: user.email || ''
  };
  const text = JSON.stringify(payload, null, 2);
  console.log(text);
  await navigator.clipboard.writeText(text);
  alert('Copied Notion JSON to clipboard');
})().catch((error) => {
  console.error(error);
  alert(error instanceof Error ? error.message : 'Failed to extract Notion info');
});`;

const getIcon = (icon: string | { light: string; dark: string }, theme: 'light' | 'dark') => {
  return typeof icon === 'string' ? icon : icon[theme];
};

export function OAuthPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { showNotification } = useNotificationStore();
  const resolvedTheme = useThemeStore((state) => state.resolvedTheme);
  const [states, setStates] = useState<Record<OAuthProvider, ProviderState>>({} as Record<OAuthProvider, ProviderState>);
  const [iflowCookie, setIflowCookie] = useState<IFlowCookieState>({ cookie: '', loading: false });
  const [notionState, setNotionState] = useState<NotionImportState>({
    tokenV2: '',
    baseUrl: '',
    prefix: '',
    extractedText: '',
    loading: false
  });
  const [vertexState, setVertexState] = useState<VertexImportState>({
    fileName: '',
    location: '',
    loading: false
  });
  const timers = useRef<Record<string, number>>({});
  const vertexFileInputRef = useRef<HTMLInputElement | null>(null);

  const clearTimers = useCallback(() => {
    Object.values(timers.current).forEach((timer) => window.clearInterval(timer));
    timers.current = {};
  }, []);

  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  const updateProviderState = (provider: OAuthProvider, next: Partial<ProviderState>) => {
    setStates((prev) => ({
      ...prev,
      [provider]: { ...(prev[provider] ?? {}), ...next }
    }));
  };

  const startPolling = (provider: OAuthProvider, state: string) => {
    if (timers.current[provider]) {
      clearInterval(timers.current[provider]);
    }
    const timer = window.setInterval(async () => {
      try {
        const res = await oauthApi.getAuthStatus(state);
        if (res.status === 'ok') {
          updateProviderState(provider, { status: 'success', polling: false });
          showNotification(t(getAuthKey(provider, 'oauth_status_success')), 'success');
          window.clearInterval(timer);
          delete timers.current[provider];
        } else if (res.status === 'error') {
          updateProviderState(provider, { status: 'error', error: res.error, polling: false });
          showNotification(
            `${t(getAuthKey(provider, 'oauth_status_error'))} ${res.error || ''}`,
            'error'
          );
          window.clearInterval(timer);
          delete timers.current[provider];
        }
      } catch (err: unknown) {
        updateProviderState(provider, { status: 'error', error: getErrorMessage(err), polling: false });
        window.clearInterval(timer);
        delete timers.current[provider];
      }
    }, 3000);
    timers.current[provider] = timer;
  };

  const startAuth = async (provider: OAuthProvider) => {
    const geminiState = provider === 'gemini-cli' ? states[provider] : undefined;
    const rawProjectId = provider === 'gemini-cli' ? (geminiState?.projectId || '').trim() : '';
    const projectId = rawProjectId
      ? rawProjectId.toUpperCase() === 'ALL'
        ? 'ALL'
        : rawProjectId
      : undefined;
    // 项目 ID 可选：留空自动选择第一个可用项目；输入 ALL 获取全部项目
    if (provider === 'gemini-cli') {
      updateProviderState(provider, { projectIdError: undefined });
    }
    updateProviderState(provider, {
      status: 'waiting',
      polling: true,
      error: undefined,
      callbackStatus: undefined,
      callbackError: undefined,
      callbackUrl: ''
    });
    try {
      const res = await oauthApi.startAuth(
        provider,
        provider === 'gemini-cli' ? { projectId: projectId || undefined } : undefined
      );
      updateProviderState(provider, { url: res.url, state: res.state, status: 'waiting', polling: true });
      if (res.state) {
        startPolling(provider, res.state);
      }
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      updateProviderState(provider, { status: 'error', error: message, polling: false });
      showNotification(
        `${t(getAuthKey(provider, 'oauth_start_error'))}${message ? ` ${message}` : ''}`,
        'error'
      );
    }
  };

  const copyLink = async (url?: string) => {
    if (!url) return;
    const copied = await copyToClipboard(url);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const submitCallback = async (provider: OAuthProvider) => {
    const redirectUrl = (states[provider]?.callbackUrl || '').trim();
    if (!redirectUrl) {
      showNotification(t('auth_login.oauth_callback_required'), 'warning');
      return;
    }
    updateProviderState(provider, {
      callbackSubmitting: true,
      callbackStatus: undefined,
      callbackError: undefined
    });
    try {
      await oauthApi.submitCallback(provider, redirectUrl);
      updateProviderState(provider, { callbackSubmitting: false, callbackStatus: 'success' });
      showNotification(t('auth_login.oauth_callback_success'), 'success');
    } catch (err: unknown) {
      const status = getErrorStatus(err);
      const message = getErrorMessage(err);
      const errorMessage =
        status === 404
          ? t('auth_login.oauth_callback_upgrade_hint', {
              defaultValue: 'Please update CLI Proxy API or check the connection.'
            })
          : message || undefined;
      updateProviderState(provider, {
        callbackSubmitting: false,
        callbackStatus: 'error',
        callbackError: errorMessage
      });
      const notificationMessage = errorMessage
        ? `${t('auth_login.oauth_callback_error')} ${errorMessage}`
        : t('auth_login.oauth_callback_error');
      showNotification(notificationMessage, 'error');
    }
  };

  const submitIflowCookie = async () => {
    const cookie = iflowCookie.cookie.trim();
    if (!cookie) {
      showNotification(t('auth_login.iflow_cookie_required'), 'warning');
      return;
    }
    setIflowCookie((prev) => ({
      ...prev,
      loading: true,
      error: undefined,
      errorType: undefined,
      result: undefined
    }));
    try {
      const res = await oauthApi.iflowCookieAuth(cookie);
      if (res.status === 'ok') {
        setIflowCookie((prev) => ({ ...prev, loading: false, result: res }));
        showNotification(t('auth_login.iflow_cookie_status_success'), 'success');
      } else {
        setIflowCookie((prev) => ({
          ...prev,
          loading: false,
          error: res.error,
          errorType: 'error'
        }));
        showNotification(`${t('auth_login.iflow_cookie_status_error')} ${res.error || ''}`, 'error');
      }
    } catch (err: unknown) {
      if (getErrorStatus(err) === 409) {
        const message = t('auth_login.iflow_cookie_config_duplicate');
        setIflowCookie((prev) => ({ ...prev, loading: false, error: message, errorType: 'warning' }));
        showNotification(message, 'warning');
        return;
      }
      const message = getErrorMessage(err);
      setIflowCookie((prev) => ({ ...prev, loading: false, error: message, errorType: 'error' }));
      showNotification(
        `${t('auth_login.iflow_cookie_start_error')}${message ? ` ${message}` : ''}`,
        'error'
      );
    }
  };

  const copyNotionExtractScript = async () => {
    const copied = await copyToClipboard(NOTION_EXTRACT_SCRIPT);
    showNotification(
      t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
      copied ? 'success' : 'error'
    );
  };

  const openNotionAI = () => {
    window.open('https://www.notion.so/ai', '_blank', 'noopener,noreferrer');
  };

  const submitNotionImport = async () => {
    const tokenV2 = notionState.tokenV2.trim();
    const extractedText = notionState.extractedText.trim();
    if (!tokenV2 && !extractedText) {
      const message = t('auth_login.notion_import_required', {
        defaultValue: '请先填写 token_v2，或粘贴提取脚本输出。'
      });
      setNotionState((prev) => ({ ...prev, error: message }));
      showNotification(message, 'warning');
      return;
    }

    setNotionState((prev) => ({
      ...prev,
      loading: true,
      error: undefined,
      result: undefined
    }));

    try {
      const result = await oauthApi.notionImport({
        token_v2: tokenV2 || undefined,
        base_url: notionState.baseUrl.trim() || undefined,
        prefix: notionState.prefix.trim() || undefined,
        extracted_text: extractedText || undefined
      });
      setNotionState((prev) => ({
        ...prev,
        loading: false,
        result
      }));
      const authFileName = getFileNameFromPath(result.saved_path);
      showNotification(
        t('auth_login.notion_import_success', {
          defaultValue: 'Notion 凭证已保存。'
        }),
        'success'
      );
      navigate('/auth-files', {
        state: {
          focusProvider: 'notion',
          focusAuthName: authFileName || undefined,
          fromNotionImport: true
        }
      });
    } catch (err: unknown) {
      const message = getErrorMessage(err) || t('notification.upload_failed');
      setNotionState((prev) => ({
        ...prev,
        loading: false,
        error: message
      }));
      showNotification(message, 'error');
    }
  };

  const handleVertexFilePick = () => {
    vertexFileInputRef.current?.click();
  };

  const handleVertexFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.name.endsWith('.json')) {
      showNotification(t('vertex_import.file_required'), 'warning');
      event.target.value = '';
      return;
    }
    setVertexState((prev) => ({
      ...prev,
      file,
      fileName: file.name,
      error: undefined,
      result: undefined
    }));
    event.target.value = '';
  };

  const handleVertexImport = async () => {
    if (!vertexState.file) {
      const message = t('vertex_import.file_required');
      setVertexState((prev) => ({ ...prev, error: message }));
      showNotification(message, 'warning');
      return;
    }
    const location = vertexState.location.trim();
    setVertexState((prev) => ({ ...prev, loading: true, error: undefined, result: undefined }));
    try {
      const res: VertexImportResponse = await vertexApi.importCredential(
        vertexState.file,
        location || undefined
      );
      const result: VertexImportResult = {
        projectId: res.project_id,
        email: res.email,
        location: res.location,
        authFile: res['auth-file'] ?? res.auth_file
      };
      setVertexState((prev) => ({ ...prev, loading: false, result }));
      showNotification(t('vertex_import.success'), 'success');
    } catch (err: unknown) {
      const message = getErrorMessage(err);
      setVertexState((prev) => ({
        ...prev,
        loading: false,
        error: message || t('notification.upload_failed')
      }));
      const notification = message
        ? `${t('notification.upload_failed')}: ${message}`
        : t('notification.upload_failed');
      showNotification(notification, 'error');
    }
  };

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('nav.oauth', { defaultValue: 'OAuth' })}</h1>

      <div className={styles.content}>
        {PROVIDERS.map((provider) => {
          const state = states[provider.id] || {};
          const canSubmitCallback = CALLBACK_SUPPORTED.includes(provider.id) && Boolean(state.url);
          return (
            <div key={provider.id}>
              <Card
                title={
                  <span className={styles.cardTitle}>
                    <img
                      src={getIcon(provider.icon, resolvedTheme)}
                      alt=""
                      className={styles.cardTitleIcon}
                    />
                    {t(provider.titleKey)}
                  </span>
                }
                extra={
                  <Button onClick={() => startAuth(provider.id)} loading={state.polling}>
                    {t('common.login')}
                  </Button>
                }
              >
                <div className={styles.cardContent}>
                  <div className={styles.cardHint}>{t(provider.hintKey)}</div>
                  {provider.id === 'gemini-cli' && (
                    <div className={styles.geminiProjectField}>
                      <Input
                        label={t('auth_login.gemini_cli_project_id_label')}
                        hint={t('auth_login.gemini_cli_project_id_hint')}
                        value={state.projectId || ''}
                        error={state.projectIdError}
                        disabled={Boolean(state.polling)}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            projectId: e.target.value,
                            projectIdError: undefined
                          })
                        }
                        placeholder={t('auth_login.gemini_cli_project_id_placeholder')}
                      />
                    </div>
                  )}
                  {state.url && (
                    <div className={styles.authUrlBox}>
                      <div className={styles.authUrlLabel}>{t(provider.urlLabelKey)}</div>
                      <div className={styles.authUrlValue}>{state.url}</div>
                      <div className={styles.authUrlActions}>
                        <Button variant="secondary" size="sm" onClick={() => copyLink(state.url!)}>
                          {t(getAuthKey(provider.id, 'copy_link'))}
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => window.open(state.url, '_blank', 'noopener,noreferrer')}
                        >
                          {t(getAuthKey(provider.id, 'open_link'))}
                        </Button>
                      </div>
                    </div>
                  )}
                  {canSubmitCallback && (
                    <div className={styles.callbackSection}>
                      <Input
                        label={t('auth_login.oauth_callback_label')}
                        hint={t('auth_login.oauth_callback_hint')}
                        value={state.callbackUrl || ''}
                        onChange={(e) =>
                          updateProviderState(provider.id, {
                            callbackUrl: e.target.value,
                            callbackStatus: undefined,
                            callbackError: undefined
                          })
                        }
                        placeholder={t('auth_login.oauth_callback_placeholder')}
                      />
                      <div className={styles.callbackActions}>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => submitCallback(provider.id)}
                          loading={state.callbackSubmitting}
                        >
                          {t('auth_login.oauth_callback_button')}
                        </Button>
                      </div>
                      {state.callbackStatus === 'success' && state.status === 'waiting' && (
                        <div className="status-badge success">
                          {t('auth_login.oauth_callback_status_success')}
                        </div>
                      )}
                      {state.callbackStatus === 'error' && (
                        <div className="status-badge error">
                          {t('auth_login.oauth_callback_status_error')} {state.callbackError || ''}
                        </div>
                      )}
                    </div>
                  )}
                  {state.status && state.status !== 'idle' && (
                    <div className="status-badge">
                      {state.status === 'success'
                        ? t(getAuthKey(provider.id, 'oauth_status_success'))
                        : state.status === 'error'
                          ? `${t(getAuthKey(provider.id, 'oauth_status_error'))} ${state.error || ''}`
                          : t(getAuthKey(provider.id, 'oauth_status_waiting'))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          );
        })}

        {/* Vertex JSON 登录 */}
        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconNotion} alt="" className={styles.cardTitleIcon} />
              {t('auth_login.notion_import_title', { defaultValue: 'Notion 登录导入' })}
            </span>
          }
          extra={
            <Button onClick={submitNotionImport} loading={notionState.loading}>
              {t('auth_login.notion_import_button', { defaultValue: '导入凭证' })}
            </Button>
          }
        >
          <div className={styles.cardContent}>
            <div className={styles.cardHint}>
              {t('auth_login.notion_import_hint', {
                defaultValue:
                  '先打开 Notion AI 页面，再从浏览器 Cookies 复制 token_v2。若你想一次拿到 space_id 和 user_id，可以在页面 Console 执行提取脚本。'
              })}
            </div>
            <div className={styles.cardHintSecondary}>
              {t('auth_login.notion_import_secondary_hint', {
                defaultValue:
                  '后端会优先用 token_v2 自动探测账号信息；粘贴脚本输出只作为兜底或校对。'
              })}
            </div>
            <div className={styles.actionRow}>
              <Button variant="secondary" size="sm" onClick={openNotionAI}>
                {t('auth_login.notion_import_open', { defaultValue: '打开 Notion AI' })}
              </Button>
              <Button variant="secondary" size="sm" onClick={copyNotionExtractScript}>
                {t('auth_login.notion_import_copy_script', { defaultValue: '复制提取脚本' })}
              </Button>
            </div>
            <Input
              label={t('auth_login.notion_import_token_label', { defaultValue: 'token_v2' })}
              hint={t('auth_login.notion_import_token_hint', {
                defaultValue: '从浏览器开发者工具 Application -> Cookies -> token_v2 获取。'
              })}
              value={notionState.tokenV2}
              onChange={(e) =>
                setNotionState((prev) => ({
                  ...prev,
                  tokenV2: e.target.value,
                  error: undefined
                }))
              }
              placeholder={t('auth_login.notion_import_token_placeholder', {
                defaultValue: 'Paste token_v2 from Notion cookies'
              })}
              className={styles.monoInput}
            />
            <Input
              label={t('auth_login.notion_import_prefix_label', { defaultValue: 'Prefix（可选）' })}
              hint={t('auth_login.notion_import_prefix_hint', {
                defaultValue: '用于多账号路由，例如 notion-team。不要包含 /。'
              })}
              value={notionState.prefix}
              onChange={(e) =>
                setNotionState((prev) => ({
                  ...prev,
                  prefix: e.target.value,
                  error: undefined
                }))
              }
              placeholder={t('auth_login.notion_import_prefix_placeholder', {
                defaultValue: 'notion-team'
              })}
            />
            <Input
              label={t('auth_login.notion_import_base_url_label', { defaultValue: 'Base URL（可选）' })}
              hint={t('auth_login.notion_import_base_url_hint', {
                defaultValue: '默认 https://www.notion.so。只有自定义域名或本地调试时才需要填写。'
              })}
              value={notionState.baseUrl}
              onChange={(e) =>
                setNotionState((prev) => ({
                  ...prev,
                  baseUrl: e.target.value,
                  error: undefined
                }))
              }
              placeholder={t('auth_login.notion_import_base_url_placeholder', {
                defaultValue: 'https://www.notion.so'
              })}
            />
            <div className={styles.formItem}>
              <label className={styles.formItemLabel}>
                {t('auth_login.notion_import_extracted_label', {
                  defaultValue: '提取脚本输出（可选）'
                })}
              </label>
              <textarea
                className={`input ${styles.textarea}`.trim()}
                rows={7}
                value={notionState.extractedText}
                onChange={(e) =>
                  setNotionState((prev) => ({
                    ...prev,
                    extractedText: e.target.value,
                    error: undefined
                  }))
                }
                placeholder={t('auth_login.notion_import_extracted_placeholder', {
                  defaultValue:
                    'Paste JSON object or NOTION_ACCOUNTS=[...] here if auto-discovery is unavailable.'
                })}
              />
              <div className={styles.cardHintSecondary}>
                {t('auth_login.notion_import_extracted_hint', {
                  defaultValue:
                    '支持直接粘贴 JSON 对象，或粘贴 NOTION_ACCOUNTS=\'[...]\' 这一整段。'
                })}
              </div>
            </div>
            {notionState.error && <div className="status-badge error">{notionState.error}</div>}
            {notionState.result && (
              <div className={styles.connectionBox}>
                <div className={styles.connectionLabel}>
                  {t('auth_login.notion_import_result_title', { defaultValue: '导入结果' })}
                </div>
                <div className={styles.keyValueList}>
                  {notionState.result.user_name && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.notion_import_result_name', { defaultValue: '用户名称' })}
                      </span>
                      <span className={styles.keyValueValue}>{notionState.result.user_name}</span>
                    </div>
                  )}
                  {notionState.result.user_email && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.notion_import_result_email', { defaultValue: '邮箱' })}
                      </span>
                      <span className={styles.keyValueValue}>{notionState.result.user_email}</span>
                    </div>
                  )}
                  {notionState.result.user_id && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.notion_import_result_user_id', { defaultValue: 'user_id' })}
                      </span>
                      <span className={styles.keyValueValue}>{notionState.result.user_id}</span>
                    </div>
                  )}
                  {notionState.result.space_id && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.notion_import_result_space_id', { defaultValue: 'space_id' })}
                      </span>
                      <span className={styles.keyValueValue}>{notionState.result.space_id}</span>
                    </div>
                  )}
                  {notionState.result.space_view_id && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.notion_import_result_space_view_id', {
                          defaultValue: 'space_view_id'
                        })}
                      </span>
                      <span className={styles.keyValueValue}>{notionState.result.space_view_id}</span>
                    </div>
                  )}
                  {notionState.result.base_url && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.notion_import_result_base_url', { defaultValue: 'Base URL' })}
                      </span>
                      <span className={styles.keyValueValue}>{notionState.result.base_url}</span>
                    </div>
                  )}
                  {notionState.result.prefix && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.notion_import_result_prefix', { defaultValue: 'Prefix' })}
                      </span>
                      <span className={styles.keyValueValue}>{notionState.result.prefix}</span>
                    </div>
                  )}
                  {notionState.result.saved_path && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>
                        {t('auth_login.notion_import_result_file', { defaultValue: '保存路径' })}
                      </span>
                      <span className={styles.keyValueValue}>{notionState.result.saved_path}</span>
                    </div>
                  )}
                  <div className={styles.keyValueItem}>
                    <span className={styles.keyValueKey}>
                      {t('auth_login.notion_import_result_mode', { defaultValue: '处理方式' })}
                    </span>
                    <span className={styles.keyValueValue}>
                      {notionState.result.created
                        ? t('auth_login.notion_import_result_created', { defaultValue: '新建凭证文件' })
                        : t('auth_login.notion_import_result_updated', { defaultValue: '更新已有凭证文件' })}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* Vertex JSON 登录 */}
        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconVertex} alt="" className={styles.cardTitleIcon} />
              {t('vertex_import.title')}
            </span>
          }
          extra={
            <Button onClick={handleVertexImport} loading={vertexState.loading}>
              {t('vertex_import.import_button')}
            </Button>
          }
        >
          <div className={styles.cardContent}>
            <div className={styles.cardHint}>{t('vertex_import.description')}</div>
            <Input
              label={t('vertex_import.location_label')}
              hint={t('vertex_import.location_hint')}
              value={vertexState.location}
              onChange={(e) =>
                setVertexState((prev) => ({
                  ...prev,
                  location: e.target.value
                }))
              }
              placeholder={t('vertex_import.location_placeholder')}
            />
            <div className={styles.formItem}>
              <label className={styles.formItemLabel}>{t('vertex_import.file_label')}</label>
              <div className={styles.filePicker}>
                <Button variant="secondary" size="sm" onClick={handleVertexFilePick}>
                  {t('vertex_import.choose_file')}
                </Button>
                <div
                  className={`${styles.fileName} ${
                    vertexState.fileName ? '' : styles.fileNamePlaceholder
                  }`.trim()}
                >
                  {vertexState.fileName || t('vertex_import.file_placeholder')}
                </div>
              </div>
              <div className={styles.cardHintSecondary}>{t('vertex_import.file_hint')}</div>
              <input
                ref={vertexFileInputRef}
                type="file"
                accept=".json,application/json"
                style={{ display: 'none' }}
                onChange={handleVertexFileChange}
              />
            </div>
            {vertexState.error && (
              <div className="status-badge error">
                {vertexState.error}
              </div>
            )}
            {vertexState.result && (
              <div className={styles.connectionBox}>
                <div className={styles.connectionLabel}>{t('vertex_import.result_title')}</div>
                <div className={styles.keyValueList}>
                  {vertexState.result.projectId && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_project')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.projectId}</span>
                    </div>
                  )}
                  {vertexState.result.email && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_email')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.email}</span>
                    </div>
                  )}
                  {vertexState.result.location && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_location')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.location}</span>
                    </div>
                  )}
                  {vertexState.result.authFile && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('vertex_import.result_file')}</span>
                      <span className={styles.keyValueValue}>{vertexState.result.authFile}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>

        {/* iFlow Cookie 登录 */}
        <Card
          title={
            <span className={styles.cardTitle}>
              <img src={iconIflow} alt="" className={styles.cardTitleIcon} />
              {t('auth_login.iflow_cookie_title')}
            </span>
          }
          extra={
            <Button onClick={submitIflowCookie} loading={iflowCookie.loading}>
              {t('auth_login.iflow_cookie_button')}
            </Button>
          }
        >
          <div className={styles.cardContent}>
            <div className={styles.cardHint}>{t('auth_login.iflow_cookie_hint')}</div>
            <div className={styles.cardHintSecondary}>
              {t('auth_login.iflow_cookie_key_hint')}
            </div>
            <div className={styles.formItem}>
              <label className={styles.formItemLabel}>{t('auth_login.iflow_cookie_label')}</label>
              <Input
                value={iflowCookie.cookie}
                onChange={(e) => setIflowCookie((prev) => ({ ...prev, cookie: e.target.value }))}
                placeholder={t('auth_login.iflow_cookie_placeholder')}
              />
            </div>
            {iflowCookie.error && (
              <div
                className={`status-badge ${iflowCookie.errorType === 'warning' ? 'warning' : 'error'}`}
              >
                {iflowCookie.errorType === 'warning'
                  ? t('auth_login.iflow_cookie_status_duplicate')
                  : t('auth_login.iflow_cookie_status_error')}{' '}
                {iflowCookie.error}
              </div>
            )}
            {iflowCookie.result && iflowCookie.result.status === 'ok' && (
              <div className={styles.connectionBox}>
                <div className={styles.connectionLabel}>{t('auth_login.iflow_cookie_result_title')}</div>
                <div className={styles.keyValueList}>
                  {iflowCookie.result.email && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('auth_login.iflow_cookie_result_email')}</span>
                      <span className={styles.keyValueValue}>{iflowCookie.result.email}</span>
                    </div>
                  )}
                  {iflowCookie.result.expired && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('auth_login.iflow_cookie_result_expired')}</span>
                      <span className={styles.keyValueValue}>{iflowCookie.result.expired}</span>
                    </div>
                  )}
                  {iflowCookie.result.saved_path && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('auth_login.iflow_cookie_result_path')}</span>
                      <span className={styles.keyValueValue}>{iflowCookie.result.saved_path}</span>
                    </div>
                  )}
                  {iflowCookie.result.type && (
                    <div className={styles.keyValueItem}>
                      <span className={styles.keyValueKey}>{t('auth_login.iflow_cookie_result_type')}</span>
                      <span className={styles.keyValueValue}>{iflowCookie.result.type}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
