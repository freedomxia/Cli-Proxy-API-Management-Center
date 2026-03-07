import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { copyToClipboard } from '@/utils/clipboard';
import { detectApiBaseFromLocation, normalizeApiBase } from '@/utils/connection';
import { pluginConnectionApi } from '@/services/api/pluginConnection';
import { useAuthStore, useConfigStore, useNotificationStore } from '@/stores';
import styles from './PluginConnectionPage.module.scss';

const TOKEN_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';

function createRandomToken(length = 32): string {
  const size = Math.max(16, length);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(size);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (value) => TOKEN_ALPHABET[value % TOKEN_ALPHABET.length]).join('');
  }

  let output = '';
  for (let i = 0; i < size; i += 1) {
    output += TOKEN_ALPHABET[Math.floor(Math.random() * TOKEN_ALPHABET.length)];
  }
  return output;
}

export function PluginConnectionPage() {
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);
  const apiBase = useAuthStore((state) => state.apiBase);
  const connectionStatus = useAuthStore((state) => state.connectionStatus);
  const fetchConfig = useConfigStore((state) => state.fetchConfig);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [token, setToken] = useState('');
  const [autoEnableOnUpdate, setAutoEnableOnUpdate] = useState(true);
  const [error, setError] = useState('');

  const disableControls = connectionStatus !== 'connected' || loading || saving;
  const pluginEndpoint = useMemo(() => {
    const base = normalizeApiBase(apiBase) || detectApiBaseFromLocation();
    return `${base}/api/plugin/update-token`;
  }, [apiBase]);

  const handleCopy = useCallback(
    async (value: string) => {
      const copied = await copyToClipboard(value);
      showNotification(
        t(copied ? 'notification.link_copied' : 'notification.copy_failed'),
        copied ? 'success' : 'error'
      );
    },
    [showNotification, t]
  );

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const settings = await pluginConnectionApi.getSettings();
      setToken(settings.token);
      setAutoEnableOnUpdate(settings.autoEnableOnUpdate);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('plugin_connection.load_failed');
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadSettings();
  }, [loadSettings]);

  const handleRandomize = useCallback(() => {
    setToken(createRandomToken());
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError('');
    try {
      const nextToken = token.trim() || createRandomToken();
      await pluginConnectionApi.saveSettings({
        token: nextToken,
        autoEnableOnUpdate,
      });
      setToken(nextToken);
      void fetchConfig(undefined, true).catch(() => {});
      showNotification(t('plugin_connection.save_success'), 'success');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : t('plugin_connection.save_failed');
      setError(message);
      showNotification(`${t('plugin_connection.save_failed')}: ${message}`, 'error');
    } finally {
      setSaving(false);
    }
  }, [autoEnableOnUpdate, fetchConfig, showNotification, t, token]);

  return (
    <div className={styles.container}>
      <h1 className={styles.pageTitle}>{t('plugin_connection.title')}</h1>
      <Card className={styles.panelCard}>
        <div className={styles.panel}>
          <div className={styles.section}>
            <div className={styles.fieldLabel}>{t('plugin_connection.connection_interface')}</div>
            <div className={`${styles.inputRow} ${styles.endpointRow}`}>
              <input
                className="input"
                value={pluginEndpoint}
                readOnly
                aria-label={t('plugin_connection.connection_interface')}
              />
              <Button
                variant="secondary"
                type="button"
                onClick={() => void handleCopy(pluginEndpoint)}
                disabled={loading}
              >
                {t('common.copy')}
              </Button>
            </div>
            <div className={styles.hint}>{t('plugin_connection.connection_interface_hint')}</div>
          </div>

          <div className={styles.section}>
            <div className={styles.fieldLabel}>{t('plugin_connection.connection_token')}</div>
            <div className={`${styles.inputRow} ${styles.tokenRow}`}>
              <input
                className="input"
                value={token}
                onChange={(event) => setToken(event.currentTarget.value)}
                placeholder={t('plugin_connection.connection_token_placeholder')}
                aria-label={t('plugin_connection.connection_token')}
                disabled={disableControls}
                autoComplete="off"
              />
              <Button variant="primary" type="button" onClick={handleRandomize} disabled={disableControls}>
                {t('plugin_connection.random')}
              </Button>
              <Button
                variant="secondary"
                type="button"
                onClick={() => void handleCopy(token.trim())}
                disabled={disableControls || token.trim() === ''}
              >
                {t('common.copy')}
              </Button>
            </div>
            <div className={styles.hint}>{t('plugin_connection.connection_token_hint')}</div>
          </div>

          <div className={styles.section}>
            <ToggleSwitch
              checked={autoEnableOnUpdate}
              onChange={setAutoEnableOnUpdate}
              disabled={disableControls}
              ariaLabel={t('plugin_connection.auto_enable_on_update')}
              label={t('plugin_connection.auto_enable_on_update')}
            />
            <div className={styles.hint}>{t('plugin_connection.auto_enable_on_update_hint')}</div>
          </div>

          <div className={styles.infoBox}>
            <span className={styles.infoIcon}>i</span>
            <span>{t('plugin_connection.usage_note')}</span>
          </div>

          {error ? <div className="error-box">{error}</div> : null}

          <Button type="button" fullWidth onClick={handleSave} disabled={disableControls} loading={saving}>
            {t('plugin_connection.save')}
          </Button>
        </div>
      </Card>
    </div>
  );
}
