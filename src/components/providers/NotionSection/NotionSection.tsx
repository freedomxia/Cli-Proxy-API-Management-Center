import { Fragment, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import iconNotion from '@/assets/icons/notion.svg';
import type { NotionKeyConfig } from '@/types';
import { maskApiKey } from '@/utils/format';
import {
  buildCandidateUsageSourceIds,
  calculateStatusBarData,
  type KeyStats,
  type UsageDetail,
} from '@/utils/usage';
import styles from '@/pages/AiProvidersPage.module.scss';
import { ProviderList } from '../ProviderList';
import { ProviderStatusBar } from '../ProviderStatusBar';
import { getStatsBySource, hasDisableAllModelsRule } from '../utils';

interface NotionSectionProps {
  configs: NotionKeyConfig[];
  keyStats: KeyStats;
  usageDetails: UsageDetail[];
  loading: boolean;
  disableControls: boolean;
  isSwitching: boolean;
  onAdd: () => void;
  onManageAuthFiles: () => void;
  onEdit: (index: number) => void;
  onDelete: (index: number) => void;
  onToggle: (index: number, enabled: boolean) => void;
}

export function NotionSection({
  configs,
  keyStats,
  usageDetails,
  loading,
  disableControls,
  isSwitching,
  onAdd,
  onManageAuthFiles,
  onEdit,
  onDelete,
  onToggle,
}: NotionSectionProps) {
  const { t } = useTranslation();
  const actionsDisabled = disableControls || loading || isSwitching;
  const toggleDisabled = disableControls || loading || isSwitching;

  const statusBarCache = useMemo(() => {
    const cache = new Map<string, ReturnType<typeof calculateStatusBarData>>();
    configs.forEach((config) => {
      if (!config.tokenV2) return;
      const candidates = buildCandidateUsageSourceIds({
        apiKey: config.tokenV2,
        prefix: config.prefix,
      });
      if (!candidates.length) return;
      const candidateSet = new Set(candidates);
      const filteredDetails = usageDetails.filter((detail) => candidateSet.has(detail.source));
      cache.set(config.tokenV2, calculateStatusBarData(filteredDetails));
    });
    return cache;
  }, [configs, usageDetails]);

  return (
    <Card
      title={
        <span className={styles.cardTitle}>
          <img src={iconNotion} alt="" className={styles.cardTitleIcon} />
          {t('ai_providers.notion_title', { defaultValue: 'Notion' })}
        </span>
      }
      extra={
        <div className={styles.cardHeaderActions}>
          <Button
            variant="secondary"
            size="sm"
            onClick={onManageAuthFiles}
            disabled={actionsDisabled}
          >
            {t('ai_providers.notion_auth_files_button', {
              defaultValue: '管理凭证 JSON',
            })}
          </Button>
          <Button size="sm" onClick={onAdd} disabled={actionsDisabled}>
            {t('ai_providers.notion_add_button', { defaultValue: 'Add Notion Account' })}
          </Button>
        </div>
      }
    >
      <ProviderList<NotionKeyConfig>
        items={configs}
        loading={loading}
        keyField={(item) => item.tokenV2}
        emptyTitle={t('ai_providers.notion_empty_title', { defaultValue: 'No Notion accounts' })}
        emptyDescription={t('ai_providers.notion_empty_desc', {
          defaultValue: 'Add a token_v2 account to route native Notion AI requests.',
        })}
        onEdit={onEdit}
        onDelete={onDelete}
        actionsDisabled={actionsDisabled}
        getRowDisabled={(item) => hasDisableAllModelsRule(item.excludedModels)}
        renderExtraActions={(item, index) => (
          <ToggleSwitch
            label={t('ai_providers.config_toggle_label')}
            checked={!hasDisableAllModelsRule(item.excludedModels)}
            disabled={toggleDisabled}
            onChange={(value) => void onToggle(index, value)}
          />
        )}
        renderContent={(item) => {
          const stats = getStatsBySource(item.tokenV2, keyStats, item.prefix);
          const headerEntries = Object.entries(item.headers || {});
          const configDisabled = hasDisableAllModelsRule(item.excludedModels);
          const excludedModels = item.excludedModels ?? [];
          const statusData = statusBarCache.get(item.tokenV2) || calculateStatusBarData([]);

          return (
            <Fragment>
              <div className="item-title">
                {t('ai_providers.notion_item_title', { defaultValue: 'Notion Account' })}
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>token_v2:</span>
                <span className={styles.fieldValue}>{maskApiKey(item.tokenV2)}</span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>space_id:</span>
                <span className={styles.fieldValue}>{item.spaceId}</span>
              </div>
              <div className={styles.fieldRow}>
                <span className={styles.fieldLabel}>user_id:</span>
                <span className={styles.fieldValue}>{item.userId}</span>
              </div>
              {item.priority !== undefined && (
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>{t('common.priority')}:</span>
                  <span className={styles.fieldValue}>{item.priority}</span>
                </div>
              )}
              {item.prefix && (
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>{t('common.prefix')}:</span>
                  <span className={styles.fieldValue}>{item.prefix}</span>
                </div>
              )}
              {item.baseUrl && (
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>{t('common.base_url')}:</span>
                  <span className={styles.fieldValue}>{item.baseUrl}</span>
                </div>
              )}
              {item.proxyUrl && (
                <div className={styles.fieldRow}>
                  <span className={styles.fieldLabel}>{t('common.proxy_url')}:</span>
                  <span className={styles.fieldValue}>{item.proxyUrl}</span>
                </div>
              )}
              {headerEntries.length > 0 && (
                <div className={styles.headerBadgeList}>
                  {headerEntries.map(([key, value]) => (
                    <span key={key} className={styles.headerBadge}>
                      <strong>{key}:</strong> {value}
                    </span>
                  ))}
                </div>
              )}
              {configDisabled && (
                <div className="status-badge warning" style={{ marginTop: 8, marginBottom: 0 }}>
                  {t('ai_providers.config_disabled_badge')}
                </div>
              )}
              {item.models?.length ? (
                <div className={styles.modelTagList}>
                  <span className={styles.modelCountLabel}>
                    {t('ai_providers.notion_models_count', { defaultValue: 'Models' })}:{' '}
                    {item.models.length}
                  </span>
                  {item.models.map((model) => (
                    <span key={`${model.name}:${model.alias ?? ''}`} className={styles.modelTag}>
                      <span className={styles.modelName}>{model.name}</span>
                      {model.alias && model.alias !== model.name && (
                        <span className={styles.modelAlias}>{model.alias}</span>
                      )}
                    </span>
                  ))}
                </div>
              ) : null}
              {excludedModels.length ? (
                <div className={styles.excludedModelsSection}>
                  <div className={styles.excludedModelsLabel}>
                    {t('ai_providers.excluded_models_count', { count: excludedModels.length })}
                  </div>
                  <div className={styles.modelTagList}>
                    {excludedModels.map((model) => (
                      <span key={model} className={`${styles.modelTag} ${styles.excludedModelTag}`}>
                        <span className={styles.modelName}>{model}</span>
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className={styles.cardStats}>
                <span className={`${styles.statPill} ${styles.statSuccess}`}>
                  {t('stats.success')}: {stats.success}
                </span>
                <span className={`${styles.statPill} ${styles.statFailure}`}>
                  {t('stats.failure')}: {stats.failure}
                </span>
              </div>
              <ProviderStatusBar statusData={statusData} />
            </Fragment>
          );
        }}
      />
    </Card>
  );
}
