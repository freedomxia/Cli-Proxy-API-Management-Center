import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { HeaderInputList } from '@/components/ui/HeaderInputList';
import { ModelInputList } from '@/components/ui/ModelInputList';
import { useEdgeSwipeBack } from '@/hooks/useEdgeSwipeBack';
import { useUnsavedChangesGuard } from '@/hooks/useUnsavedChangesGuard';
import { SecondaryScreenShell } from '@/components/common/SecondaryScreenShell';
import { providersApi } from '@/services/api';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import type { NotionKeyConfig } from '@/types';
import { buildHeaderObject, headersToEntries, normalizeHeaderEntries } from '@/utils/headers';
import { entriesToModels, modelsToEntries } from '@/components/ui/modelInputListUtils';
import { excludedModelsToText, parseExcludedModels } from '@/components/providers/utils';
import layoutStyles from './AiProvidersEditLayout.module.scss';

type LocationState = { fromAiProviders?: boolean } | null;

type NotionFormState = {
  tokenV2: string;
  spaceId: string;
  userId: string;
  priority?: number;
  prefix: string;
  baseUrl: string;
  proxyUrl: string;
  headers: Array<{ key: string; value: string }>;
  modelEntries: Array<{ name: string; alias: string }>;
  excludedText: string;
};

const buildEmptyForm = (): NotionFormState => ({
  tokenV2: '',
  spaceId: '',
  userId: '',
  priority: undefined,
  prefix: '',
  baseUrl: '',
  proxyUrl: '',
  headers: [],
  modelEntries: [{ name: '', alias: '' }],
  excludedText: '',
});

const parseIndexParam = (value: string | undefined) => {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const normalizeModelEntries = (entries: Array<{ name: string; alias: string }>) =>
  (entries ?? []).reduce<Array<{ name: string; alias: string }>>((acc, entry) => {
    const name = String(entry?.name ?? '').trim();
    let alias = String(entry?.alias ?? '').trim();
    if (name && alias === name) {
      alias = '';
    }
    if (!name && !alias) return acc;
    acc.push({ name, alias });
    return acc;
  }, []);

const buildNotionSignature = (form: NotionFormState) =>
  JSON.stringify({
    tokenV2: String(form.tokenV2 ?? '').trim(),
    spaceId: String(form.spaceId ?? '').trim(),
    userId: String(form.userId ?? '').trim(),
    priority:
      form.priority !== undefined && Number.isFinite(form.priority)
        ? Math.trunc(form.priority)
        : null,
    prefix: String(form.prefix ?? '').trim(),
    baseUrl: String(form.baseUrl ?? '').trim(),
    proxyUrl: String(form.proxyUrl ?? '').trim(),
    headers: normalizeHeaderEntries(form.headers),
    models: normalizeModelEntries(form.modelEntries),
    excludedModels: parseExcludedModels(form.excludedText ?? ''),
  });

export function AiProvidersNotionEditPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams<{ index?: string }>();

  const { showNotification } = useNotificationStore();
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const disableControls = connectionStatus !== 'connected';

  const fetchConfig = useConfigStore((state) => state.fetchConfig);
  const updateConfigValue = useConfigStore((state) => state.updateConfigValue);
  const clearCache = useConfigStore((state) => state.clearCache);

  const [configs, setConfigs] = useState<NotionKeyConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState<NotionFormState>(() => buildEmptyForm());
  const [baselineSignature, setBaselineSignature] = useState(() =>
    buildNotionSignature(buildEmptyForm())
  );

  const hasIndexParam = typeof params.index === 'string';
  const editIndex = useMemo(() => parseIndexParam(params.index), [params.index]);
  const invalidIndexParam = hasIndexParam && editIndex === null;

  const initialData = useMemo(() => {
    if (editIndex === null) return undefined;
    return configs[editIndex];
  }, [configs, editIndex]);

  const invalidIndex = editIndex !== null && !initialData;

  const title =
    editIndex !== null
      ? t('ai_providers.notion_edit_modal_title', { defaultValue: 'Edit Notion Account' })
      : t('ai_providers.notion_add_modal_title', { defaultValue: 'Add Notion Account' });

  const handleBack = useCallback(() => {
    const state = location.state as LocationState;
    if (state?.fromAiProviders) {
      navigate(-1);
      return;
    }
    navigate('/ai-providers', { replace: true });
  }, [location.state, navigate]);

  const handleManageAuthFiles = useCallback(() => {
    navigate('/auth-files', {
      state: {
        fromAiProviders: true,
        focusProvider: 'notion',
        openNewNotionEditor: true,
      },
    });
  }, [navigate]);

  const swipeRef = useEdgeSwipeBack({ onBack: handleBack });

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleBack();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleBack]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');

    fetchConfig('notion-api-key')
      .then((value) => {
        if (cancelled) return;
        setConfigs(Array.isArray(value) ? (value as NotionKeyConfig[]) : []);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : '';
        setError(message || t('notification.refresh_failed'));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fetchConfig, t]);

  useEffect(() => {
    if (loading) return;

    if (initialData) {
      const nextForm: NotionFormState = {
        tokenV2: initialData.tokenV2,
        spaceId: initialData.spaceId,
        userId: initialData.userId,
        priority: initialData.priority,
        prefix: initialData.prefix ?? '',
        baseUrl: initialData.baseUrl ?? '',
        proxyUrl: initialData.proxyUrl ?? '',
        headers: headersToEntries(initialData.headers),
        modelEntries: modelsToEntries(initialData.models),
        excludedText: excludedModelsToText(initialData.excludedModels),
      };
      setForm(nextForm);
      setBaselineSignature(buildNotionSignature(nextForm));
      return;
    }

    const nextForm = buildEmptyForm();
    setForm(nextForm);
    setBaselineSignature(buildNotionSignature(nextForm));
  }, [initialData, loading]);

  const currentSignature = useMemo(() => buildNotionSignature(form), [form]);
  const isDirty = baselineSignature !== currentSignature;
  const canGuard = !loading && !saving && !invalidIndexParam && !invalidIndex;

  const { allowNextNavigation } = useUnsavedChangesGuard({
    enabled: canGuard,
    shouldBlock: ({ currentLocation, nextLocation }) =>
      isDirty && currentLocation.pathname !== nextLocation.pathname,
    dialog: {
      title: t('common.unsaved_changes_title'),
      message: t('common.unsaved_changes_message'),
      confirmText: t('common.leave'),
      cancelText: t('common.stay'),
      variant: 'danger',
    },
  });

  const canSave = !disableControls && !saving && !loading && !invalidIndexParam && !invalidIndex;

  const handleSave = useCallback(async () => {
    if (!canSave) return;

    const tokenV2 = form.tokenV2.trim();
    const spaceId = form.spaceId.trim();
    const userId = form.userId.trim();
    if (!tokenV2 || !spaceId || !userId) {
      showNotification(
        t('notification.notion_required_fields', {
          defaultValue: 'token_v2、space_id、user_id 为必填项',
        }),
        'error'
      );
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payload: NotionKeyConfig = {
        tokenV2,
        spaceId,
        userId,
        priority: form.priority !== undefined ? Math.trunc(form.priority) : undefined,
        prefix: form.prefix?.trim() || undefined,
        baseUrl: form.baseUrl?.trim() || undefined,
        proxyUrl: form.proxyUrl?.trim() || undefined,
        headers: buildHeaderObject(form.headers),
        models: entriesToModels(form.modelEntries),
        excludedModels: parseExcludedModels(form.excludedText),
      };

      const nextList =
        editIndex !== null
          ? configs.map((item, idx) => (idx === editIndex ? payload : item))
          : [...configs, payload];

      await providersApi.saveNotionConfigs(nextList);
      updateConfigValue('notion-api-key', nextList);
      clearCache('notion-api-key');
      showNotification(
        editIndex !== null
          ? t('notification.notion_config_updated', { defaultValue: 'Notion 配置已更新' })
          : t('notification.notion_config_added', { defaultValue: 'Notion 配置已添加' }),
        'success'
      );
      allowNextNavigation();
      setBaselineSignature(buildNotionSignature(form));
      handleBack();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      setError(message);
      showNotification(`${t('notification.update_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [
    allowNextNavigation,
    canSave,
    clearCache,
    configs,
    editIndex,
    form,
    handleBack,
    showNotification,
    t,
    updateConfigValue,
  ]);

  return (
    <SecondaryScreenShell
      ref={swipeRef}
      contentClassName={layoutStyles.content}
      title={title}
      onBack={handleBack}
      backLabel={t('common.back')}
      backAriaLabel={t('common.back')}
      hideTopBarBackButton
      hideTopBarRightAction
      floatingAction={
        <div className={layoutStyles.floatingActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleBack}
            className={layoutStyles.floatingBackButton}
          >
            {t('common.back')}
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            loading={saving}
            disabled={!canSave}
            className={layoutStyles.floatingSaveButton}
          >
            {t('common.save')}
          </Button>
        </div>
      }
      isLoading={loading}
      loadingLabel={t('common.loading')}
    >
      <Card>
        {error && <div className="error-box">{error}</div>}
        {invalidIndexParam || invalidIndex ? (
          <div className="hint">{t('common.invalid_provider_index')}</div>
        ) : (
          <>
            <div className={layoutStyles.upstreamApiKeyRow}>
              <p className={layoutStyles.upstreamApiKeyHint}>
                {t('ai_providers.notion_auth_files_hint', {
                  defaultValue:
                    '这里编辑的是 notion-api-key 配置；如果你要改成 auths/*.json 凭证文件，请走下面的入口。',
                })}
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleManageAuthFiles}
                disabled={disableControls || saving}
              >
                {t('ai_providers.notion_auth_files_button', {
                  defaultValue: '新建凭证 JSON',
                })}
              </Button>
            </div>
            <Input
              label="token_v2"
              value={form.tokenV2}
              onChange={(e) => setForm((prev) => ({ ...prev, tokenV2: e.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label="space_id"
              value={form.spaceId}
              onChange={(e) => setForm((prev) => ({ ...prev, spaceId: e.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label="user_id"
              value={form.userId}
              onChange={(e) => setForm((prev) => ({ ...prev, userId: e.target.value }))}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.priority_label')}
              hint={t('ai_providers.priority_hint')}
              type="number"
              step={1}
              value={form.priority ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                const parsed = raw.trim() === '' ? undefined : Number(raw);
                setForm((prev) => ({
                  ...prev,
                  priority: parsed !== undefined && Number.isFinite(parsed) ? parsed : undefined,
                }));
              }}
              disabled={disableControls || saving}
            />
            <Input
              label={t('ai_providers.prefix_label')}
              placeholder={t('ai_providers.prefix_placeholder')}
              value={form.prefix}
              onChange={(e) => setForm((prev) => ({ ...prev, prefix: e.target.value }))}
              hint={t('ai_providers.prefix_hint')}
              disabled={disableControls || saving}
            />
            <Input
              label={t('common.base_url')}
              value={form.baseUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, baseUrl: e.target.value }))}
              hint={t('ai_providers.notion_base_url_hint', {
                defaultValue: '留空时使用 https://www.notion.so',
              })}
              disabled={disableControls || saving}
            />
            <Input
              label={t('common.proxy_url')}
              value={form.proxyUrl}
              onChange={(e) => setForm((prev) => ({ ...prev, proxyUrl: e.target.value }))}
              disabled={disableControls || saving}
            />
            <HeaderInputList
              entries={form.headers}
              onChange={(entries) => setForm((prev) => ({ ...prev, headers: entries }))}
              addLabel={t('common.custom_headers_add')}
              keyPlaceholder={t('common.custom_headers_key_placeholder')}
              valuePlaceholder={t('common.custom_headers_value_placeholder')}
              removeButtonTitle={t('common.delete')}
              removeButtonAriaLabel={t('common.delete')}
              disabled={disableControls || saving}
            />

            <div className="form-group">
              <label>{t('ai_providers.notion_models_label', { defaultValue: 'Models' })}</label>
              <div className="hint">
                {t('ai_providers.notion_models_hint', {
                  defaultValue: '可选：配置本地模型别名到 Notion 上游模型名的映射。',
                })}
              </div>
              <ModelInputList
                entries={form.modelEntries}
                onChange={(entries) => setForm((prev) => ({ ...prev, modelEntries: entries }))}
                namePlaceholder={t('common.model_name_placeholder')}
                aliasPlaceholder={t('common.model_alias_placeholder')}
                disabled={disableControls || saving}
                removeButtonTitle={t('common.delete')}
                removeButtonAriaLabel={t('common.delete')}
              />
            </div>

            <div className="form-group">
              <label>{t('ai_providers.excluded_models_label')}</label>
              <textarea
                className="input"
                placeholder={t('ai_providers.excluded_models_placeholder')}
                value={form.excludedText}
                onChange={(e) => setForm((prev) => ({ ...prev, excludedText: e.target.value }))}
                rows={4}
                disabled={disableControls || saving}
              />
              <div className="hint">{t('ai_providers.excluded_models_hint')}</div>
            </div>
          </>
        )}
      </Card>
    </SecondaryScreenShell>
  );
}
