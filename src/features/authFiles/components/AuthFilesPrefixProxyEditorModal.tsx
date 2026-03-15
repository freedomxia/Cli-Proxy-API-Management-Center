import { useTranslation } from 'react-i18next';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { LoadingSpinner } from '@/components/ui/LoadingSpinner';
import { Input } from '@/components/ui/Input';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import type {
  PrefixProxyEditorField,
  PrefixProxyEditorFieldValue,
  PrefixProxyEditorState,
} from '@/features/authFiles/hooks/useAuthFilesPrefixProxyEditor';
import styles from '@/pages/AuthFilesPage.module.scss';

export type AuthFilesPrefixProxyEditorModalProps = {
  disableControls: boolean;
  editor: PrefixProxyEditorState | null;
  updatedText: string;
  dirty: boolean;
  validationError: string | null;
  onClose: () => void;
  onSave: () => void;
  onChange: (field: PrefixProxyEditorField, value: PrefixProxyEditorFieldValue) => void;
};

export function AuthFilesPrefixProxyEditorModal(props: AuthFilesPrefixProxyEditorModalProps) {
  const { t } = useTranslation();
  const {
    disableControls,
    editor,
    updatedText,
    dirty,
    validationError,
    onClose,
    onSave,
    onChange,
  } = props;

  return (
    <Modal
      open={Boolean(editor)}
      onClose={onClose}
      closeDisabled={editor?.saving === true}
      width={720}
      title={
        editor?.isNew
          ? t('auth_files.notion_create_title', { defaultValue: '新建 Notion 凭证 JSON' })
          : editor?.fileName
            ? t('auth_files.auth_field_editor_title', { name: editor.fileName })
            : t('auth_files.prefix_proxy_button')
      }
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={editor?.saving === true}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={onSave}
            loading={editor?.saving === true}
            disabled={
              disableControls ||
              editor?.saving === true ||
              !dirty ||
              !editor?.json ||
              Boolean(validationError)
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      {editor && (
        <div className={styles.prefixProxyEditor}>
          {editor.loading ? (
            <div className={styles.prefixProxyLoading}>
              <LoadingSpinner size={14} />
              <span>{t('auth_files.prefix_proxy_loading')}</span>
            </div>
          ) : (
            <>
              {editor.error && <div className={styles.prefixProxyError}>{editor.error}</div>}
              {validationError && <div className={styles.prefixProxyError}>{validationError}</div>}
              <div className={styles.prefixProxyFields}>
                <Input
                  label={t('auth_files.file_name_label', { defaultValue: '文件名' })}
                  value={editor.fileName}
                  placeholder={t('auth_files.file_name_placeholder', {
                    defaultValue: 'notion-credential.json',
                  })}
                  disabled={disableControls || editor.saving || !editor.isNew}
                  onChange={(e) => onChange('fileName', e.target.value)}
                />
              </div>
              {editor.isNotionFile && (
                <div className={styles.prefixProxyFields}>
                  <Input
                    label="token_v2"
                    type="password"
                    value={editor.tokenV2}
                    placeholder={t('auth_files.notion_token_placeholder', {
                      defaultValue: '输入 Notion token_v2',
                    })}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('tokenV2', e.target.value)}
                  />
                  <Input
                    label="space_id"
                    value={editor.spaceId}
                    placeholder={t('auth_files.notion_space_placeholder', {
                      defaultValue: '输入 Notion space_id',
                    })}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('spaceId', e.target.value)}
                  />
                  <Input
                    label="user_id"
                    value={editor.userId}
                    placeholder={t('auth_files.notion_user_placeholder', {
                      defaultValue: '输入 Notion user_id',
                    })}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('userId', e.target.value)}
                  />
                  <Input
                    label="base_url"
                    value={editor.baseUrl}
                    placeholder="https://www.notion.so"
                    hint={t('auth_files.notion_base_url_hint', {
                      defaultValue: '留空时使用 https://www.notion.so',
                    })}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('baseUrl', e.target.value)}
                  />
                  <div className="form-group">
                    <label>{t('auth_files.headers_label', { defaultValue: 'Headers JSON' })}</label>
                    <textarea
                      className="input"
                      value={editor.headersText}
                      placeholder='{\n  "x-test-header": "value"\n}'
                      rows={4}
                      disabled={disableControls || editor.saving || !editor.json}
                      onChange={(e) => onChange('headersText', e.target.value)}
                    />
                    <div className="hint">
                      {t('auth_files.headers_hint', {
                        defaultValue: '可选：填写 JSON 对象形式的自定义请求头。',
                      })}
                    </div>
                  </div>
                </div>
              )}
              <div className={styles.prefixProxyJsonWrapper}>
                <label className={styles.prefixProxyLabel}>
                  {t('auth_files.prefix_proxy_source_label', {
                    defaultValue: editor.isNew
                      ? '将要写入的认证文件 JSON'
                      : '认证文件 JSON（预览）',
                  })}
                </label>
                <textarea
                  className={styles.prefixProxyTextarea}
                  rows={10}
                  readOnly
                  value={updatedText}
                />
              </div>
              <div className={styles.prefixProxyFields}>
                <Input
                  label={t('auth_files.prefix_label')}
                  value={editor.prefix}
                  disabled={disableControls || editor.saving || !editor.json}
                  onChange={(e) => onChange('prefix', e.target.value)}
                />
                <Input
                  label={t('auth_files.proxy_url_label')}
                  value={editor.proxyUrl}
                  placeholder={t('auth_files.proxy_url_placeholder')}
                  disabled={disableControls || editor.saving || !editor.json}
                  onChange={(e) => onChange('proxyUrl', e.target.value)}
                />
                <Input
                  label={t('auth_files.priority_label')}
                  value={editor.priority}
                  placeholder={t('auth_files.priority_placeholder')}
                  hint={t('auth_files.priority_hint')}
                  disabled={disableControls || editor.saving || !editor.json}
                  onChange={(e) => onChange('priority', e.target.value)}
                />
                <div className="form-group">
                  <label>{t('auth_files.excluded_models_label')}</label>
                  <textarea
                    className="input"
                    value={editor.excludedModelsText}
                    placeholder={t('auth_files.excluded_models_placeholder')}
                    rows={4}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('excludedModelsText', e.target.value)}
                  />
                  <div className="hint">{t('auth_files.excluded_models_hint')}</div>
                </div>
                {!editor.isNotionFile && (
                  <Input
                    label={t('auth_files.disable_cooling_label')}
                    value={editor.disableCooling}
                    placeholder={t('auth_files.disable_cooling_placeholder')}
                    hint={t('auth_files.disable_cooling_hint')}
                    disabled={disableControls || editor.saving || !editor.json}
                    onChange={(e) => onChange('disableCooling', e.target.value)}
                  />
                )}
                {editor.isCodexFile && (
                  <div className="form-group">
                    <label>{t('ai_providers.codex_websockets_label')}</label>
                    <ToggleSwitch
                      checked={Boolean(editor.websocket)}
                      disabled={disableControls || editor.saving || !editor.json}
                      ariaLabel={t('ai_providers.codex_websockets_label')}
                      onChange={(value) => onChange('websocket', value)}
                    />
                    <div className="hint">{t('ai_providers.codex_websockets_hint')}</div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </Modal>
  );
}
