import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { authFilesApi } from '@/services/api';
import type { AuthFileItem } from '@/types';
import { useNotificationStore } from '@/stores';
import { formatFileSize } from '@/utils/format';
import { MAX_AUTH_FILE_SIZE } from '@/utils/constants';
import {
  normalizeExcludedModels,
  parseDisableCoolingValue,
  parseExcludedModelsText,
  parsePriorityValue,
} from '@/features/authFiles/constants';

export type PrefixProxyEditorField =
  | 'fileName'
  | 'tokenV2'
  | 'spaceId'
  | 'userId'
  | 'baseUrl'
  | 'headersText'
  | 'prefix'
  | 'proxyUrl'
  | 'priority'
  | 'excludedModelsText'
  | 'disableCooling'
  | 'websocket';

export type PrefixProxyEditorFieldValue = string | boolean;

export type PrefixProxyEditorState = {
  fileName: string;
  providerType: string;
  isNew: boolean;
  isCodexFile: boolean;
  isNotionFile: boolean;
  loading: boolean;
  saving: boolean;
  error: string | null;
  originalText: string;
  rawText: string;
  json: Record<string, unknown> | null;
  tokenV2: string;
  spaceId: string;
  userId: string;
  baseUrl: string;
  headersText: string;
  prefix: string;
  proxyUrl: string;
  priority: string;
  excludedModelsText: string;
  disableCooling: string;
  websocket: boolean;
};

export type UseAuthFilesPrefixProxyEditorOptions = {
  disableControls: boolean;
  loadFiles: () => Promise<void>;
  loadKeyStats: () => Promise<void>;
  existingFileNames: string[];
};

export type UseAuthFilesPrefixProxyEditorResult = {
  prefixProxyEditor: PrefixProxyEditorState | null;
  prefixProxyUpdatedText: string;
  prefixProxyDirty: boolean;
  prefixProxyValidationError: string | null;
  openPrefixProxyEditor: (file: Pick<AuthFileItem, 'name' | 'type' | 'provider'>) => Promise<void>;
  openNewNotionEditor: () => void;
  closePrefixProxyEditor: () => void;
  handlePrefixProxyChange: (
    field: PrefixProxyEditorField,
    value: PrefixProxyEditorFieldValue
  ) => void;
  handlePrefixProxySave: () => Promise<void>;
};

type HeadersParseResult = {
  headers: Record<string, string>;
  valid: boolean;
};

const createEmptyEditorState = (
  fileName: string,
  providerType: string,
  options?: Partial<PrefixProxyEditorState>
): PrefixProxyEditorState => ({
  fileName,
  providerType,
  isNew: false,
  isCodexFile: false,
  isNotionFile: false,
  loading: false,
  saving: false,
  error: null,
  originalText: '',
  rawText: '',
  json: {},
  tokenV2: '',
  spaceId: '',
  userId: '',
  baseUrl: '',
  headersText: '',
  prefix: '',
  proxyUrl: '',
  priority: '',
  excludedModelsText: '',
  disableCooling: '',
  websocket: false,
  ...options,
});

const normalizeProviderType = (value: unknown): string =>
  String(value ?? '')
    .trim()
    .toLowerCase();

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const buildDefaultNotionFileName = (now = new Date()): string => {
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0'),
  ];
  return `notion-${parts.join('')}.json`;
};

const stringifyJSON = (value: Record<string, unknown>): string => JSON.stringify(value, null, 2);

const normalizeHeadersRecord = (value: unknown): HeadersParseResult => {
  if (!isPlainObject(value)) {
    return { headers: {}, valid: false };
  }
  const headers: Record<string, string> = {};
  for (const [rawKey, rawValue] of Object.entries(value)) {
    const key = String(rawKey ?? '').trim();
    if (!key) continue;
    if (rawValue === null || rawValue === undefined) continue;
    if (typeof rawValue === 'object') {
      return { headers: {}, valid: false };
    }
    const headerValue = String(rawValue).trim();
    if (!headerValue) continue;
    headers[key] = headerValue;
  }
  return { headers, valid: true };
};

const parseHeadersText = (value: string): HeadersParseResult => {
  const trimmed = value.trim();
  if (!trimmed) {
    return { headers: {}, valid: true };
  }
  try {
    return normalizeHeadersRecord(JSON.parse(trimmed) as unknown);
  } catch {
    return { headers: {}, valid: false };
  }
};

const buildHeadersText = (value: unknown): string => {
  if (!isPlainObject(value)) return '';
  return stringifyJSON(value);
};

const applyTrimmedStringField = (
  target: Record<string, unknown>,
  key: string,
  value: string,
  force = false
) => {
  const trimmed = value.trim();
  if (trimmed) {
    target[key] = trimmed;
    return;
  }
  if (force || key in target) {
    delete target[key];
  }
};

const buildPrefixProxyUpdatedText = (editor: PrefixProxyEditorState | null): string => {
  if (!editor?.json) return editor?.rawText ?? '';

  const next: Record<string, unknown> = { ...editor.json };

  if (editor.isNotionFile) {
    next.type = 'notion';
    applyTrimmedStringField(next, 'token_v2', editor.tokenV2, true);
    applyTrimmedStringField(next, 'space_id', editor.spaceId, true);
    applyTrimmedStringField(next, 'user_id', editor.userId, true);
    applyTrimmedStringField(next, 'base_url', editor.baseUrl);

    const parsedHeaders = parseHeadersText(editor.headersText);
    if (parsedHeaders.valid) {
      if (Object.keys(parsedHeaders.headers).length > 0) {
        next.headers = parsedHeaders.headers;
      } else if ('headers' in next) {
        delete next.headers;
      }
    }
  }

  applyTrimmedStringField(next, 'prefix', editor.prefix);
  applyTrimmedStringField(next, 'proxy_url', editor.proxyUrl);

  const parsedPriority = parsePriorityValue(editor.priority);
  if (parsedPriority !== undefined) {
    next.priority = parsedPriority;
  } else if ('priority' in next) {
    delete next.priority;
  }

  const excludedModels = parseExcludedModelsText(editor.excludedModelsText);
  if (excludedModels.length > 0) {
    next.excluded_models = excludedModels;
  } else if ('excluded_models' in next) {
    delete next.excluded_models;
  }

  if (!editor.isNotionFile) {
    const parsedDisableCooling = parseDisableCoolingValue(editor.disableCooling);
    if (parsedDisableCooling !== undefined) {
      next.disable_cooling = parsedDisableCooling;
    } else if ('disable_cooling' in next) {
      delete next.disable_cooling;
    }
  }

  if (editor.isCodexFile) {
    next.websocket = editor.websocket;
  }

  return stringifyJSON(next);
};

const getValidationErrorKey = (
  editor: PrefixProxyEditorState | null,
  existingFileNames: Set<string>
): string | null => {
  if (!editor || editor.loading || editor.error || !editor.json) return null;

  const fileName = editor.fileName.trim();
  if (!fileName) return 'file_name_required';
  if (fileName.includes('/') || fileName.includes('\\')) return 'file_name_invalid';
  if (!fileName.toLowerCase().endsWith('.json')) return 'file_name_extension';
  if (editor.isNew && existingFileNames.has(fileName.toLowerCase())) return 'file_name_exists';

  if (editor.isNotionFile) {
    if (!editor.tokenV2.trim() || !editor.spaceId.trim() || !editor.userId.trim()) {
      return 'notion_required';
    }
    if (!parseHeadersText(editor.headersText).valid) {
      return 'headers_invalid';
    }
  }

  return null;
};

const getValidationErrorMessage = (
  t: ReturnType<typeof useTranslation>['t'],
  validationKey: string | null
): string | null => {
  switch (validationKey) {
    case 'file_name_required':
      return t('auth_files.file_name_required', { defaultValue: '文件名不能为空。' });
    case 'file_name_invalid':
      return t('auth_files.file_name_invalid', {
        defaultValue: '文件名不能包含路径分隔符。',
      });
    case 'file_name_extension':
      return t('auth_files.file_name_extension', {
        defaultValue: '文件名必须以 .json 结尾。',
      });
    case 'file_name_exists':
      return t('auth_files.file_name_exists', {
        defaultValue: '同名认证文件已存在，请更换文件名。',
      });
    case 'notion_required':
      return t('auth_files.notion_required_fields', {
        defaultValue: 'Notion 凭证需要填写 token_v2、space_id 和 user_id。',
      });
    case 'headers_invalid':
      return t('auth_files.headers_invalid', {
        defaultValue: 'Headers 必须是 JSON 对象，例如 {\"x-test\":\"value\"}。',
      });
    default:
      return null;
  }
};

export function useAuthFilesPrefixProxyEditor(
  options: UseAuthFilesPrefixProxyEditorOptions
): UseAuthFilesPrefixProxyEditorResult {
  const { disableControls, loadFiles, loadKeyStats, existingFileNames } = options;
  const { t } = useTranslation();
  const showNotification = useNotificationStore((state) => state.showNotification);

  const [prefixProxyEditor, setPrefixProxyEditor] = useState<PrefixProxyEditorState | null>(null);

  const normalizedFileNames = new Set(existingFileNames.map((item) => item.trim().toLowerCase()));
  const prefixProxyUpdatedText = buildPrefixProxyUpdatedText(prefixProxyEditor);
  const prefixProxyDirty =
    Boolean(prefixProxyEditor?.json) &&
    prefixProxyUpdatedText !== (prefixProxyEditor?.originalText ?? '');
  const prefixProxyValidationError = getValidationErrorMessage(
    t,
    getValidationErrorKey(prefixProxyEditor, normalizedFileNames)
  );

  const closePrefixProxyEditor = useCallback(() => {
    setPrefixProxyEditor(null);
  }, []);

  const openNewNotionEditor = useCallback(() => {
    if (disableControls) return;
    const fileName = buildDefaultNotionFileName();
    const json = { type: 'notion' } satisfies Record<string, unknown>;
    setPrefixProxyEditor(
      createEmptyEditorState(fileName, 'notion', {
        isNew: true,
        isNotionFile: true,
        json,
        rawText: stringifyJSON(json),
        originalText: '',
      })
    );
  }, [disableControls]);

  const openPrefixProxyEditor = async (file: Pick<AuthFileItem, 'name' | 'type' | 'provider'>) => {
    const name = file.name;
    const normalizedType = normalizeProviderType(file.type);
    const normalizedProvider = normalizeProviderType(file.provider);
    const isCodexFile = normalizedType === 'codex' || normalizedProvider === 'codex';
    const isNotionFile = normalizedType === 'notion' || normalizedProvider === 'notion';

    if (disableControls) return;
    if (prefixProxyEditor?.fileName === name && !prefixProxyEditor.isNew) {
      setPrefixProxyEditor(null);
      return;
    }

    setPrefixProxyEditor(
      createEmptyEditorState(name, normalizedProvider || normalizedType || 'unknown', {
        isCodexFile,
        isNotionFile,
        loading: true,
        json: null,
      })
    );

    try {
      const rawText = await authFilesApi.downloadText(name);
      const trimmed = rawText.trim();

      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed) as unknown;
      } catch {
        setPrefixProxyEditor((prev) => {
          if (!prev || prev.fileName !== name) return prev;
          return {
            ...prev,
            loading: false,
            error: t('auth_files.prefix_proxy_invalid_json'),
            rawText: trimmed,
            originalText: trimmed,
          };
        });
        return;
      }

      if (!isPlainObject(parsed)) {
        setPrefixProxyEditor((prev) => {
          if (!prev || prev.fileName !== name) return prev;
          return {
            ...prev,
            loading: false,
            error: t('auth_files.prefix_proxy_invalid_json'),
            rawText: trimmed,
            originalText: trimmed,
          };
        });
        return;
      }

      const json = { ...parsed };
      const providerType =
        normalizeProviderType(json.type) || normalizedProvider || normalizedType || 'unknown';
      const resolvedIsCodexFile = isCodexFile || providerType === 'codex';
      const resolvedIsNotionFile = isNotionFile || providerType === 'notion';
      if (resolvedIsCodexFile) {
        const websocketValue = parseDisableCoolingValue(json.websocket);
        json.websocket = websocketValue ?? false;
      }

      const originalText = stringifyJSON(json);
      const prefix = typeof json.prefix === 'string' ? json.prefix : '';
      const proxyUrl = typeof json.proxy_url === 'string' ? json.proxy_url : '';
      const priority = parsePriorityValue(json.priority);
      const excludedModels = normalizeExcludedModels(json.excluded_models);
      const disableCoolingValue = parseDisableCoolingValue(json.disable_cooling);
      const websocketValue = parseDisableCoolingValue(json.websocket);
      const tokenV2 =
        typeof json.token_v2 === 'string'
          ? json.token_v2
          : typeof json['token-v2'] === 'string'
            ? (json['token-v2'] as string)
            : typeof json.api_key === 'string'
              ? (json.api_key as string)
              : '';
      const spaceId =
        typeof json.space_id === 'string'
          ? json.space_id
          : typeof json['space-id'] === 'string'
            ? (json['space-id'] as string)
            : '';
      const userId =
        typeof json.user_id === 'string'
          ? json.user_id
          : typeof json['user-id'] === 'string'
            ? (json['user-id'] as string)
            : '';
      const baseUrl =
        typeof json.base_url === 'string'
          ? json.base_url
          : typeof json['base-url'] === 'string'
            ? (json['base-url'] as string)
            : '';

      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileName !== name) return prev;
        return {
          ...prev,
          providerType,
          isCodexFile: resolvedIsCodexFile,
          isNotionFile: resolvedIsNotionFile,
          loading: false,
          originalText,
          rawText: originalText,
          json,
          tokenV2,
          spaceId,
          userId,
          baseUrl,
          headersText: buildHeadersText(json.headers),
          prefix,
          proxyUrl,
          priority: priority !== undefined ? String(priority) : '',
          excludedModelsText: excludedModels.join('\n'),
          disableCooling:
            disableCoolingValue === undefined ? '' : disableCoolingValue ? 'true' : 'false',
          websocket: websocketValue ?? false,
          error: null,
        };
      });
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : t('notification.download_failed');
      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileName !== name) return prev;
        return { ...prev, loading: false, error: errorMessage, rawText: '' };
      });
      showNotification(`${t('notification.download_failed')}: ${errorMessage}`, 'error');
    }
  };

  const handlePrefixProxyChange = (
    field: PrefixProxyEditorField,
    value: PrefixProxyEditorFieldValue
  ) => {
    setPrefixProxyEditor((prev) => {
      if (!prev) return prev;
      switch (field) {
        case 'fileName':
          return { ...prev, fileName: String(value) };
        case 'tokenV2':
          return { ...prev, tokenV2: String(value) };
        case 'spaceId':
          return { ...prev, spaceId: String(value) };
        case 'userId':
          return { ...prev, userId: String(value) };
        case 'baseUrl':
          return { ...prev, baseUrl: String(value) };
        case 'headersText':
          return { ...prev, headersText: String(value) };
        case 'prefix':
          return { ...prev, prefix: String(value) };
        case 'proxyUrl':
          return { ...prev, proxyUrl: String(value) };
        case 'priority':
          return { ...prev, priority: String(value) };
        case 'excludedModelsText':
          return { ...prev, excludedModelsText: String(value) };
        case 'disableCooling':
          return { ...prev, disableCooling: String(value) };
        default:
          return { ...prev, websocket: Boolean(value) };
      }
    });
  };

  const handlePrefixProxySave = async () => {
    if (!prefixProxyEditor?.json) return;
    if (!prefixProxyDirty) return;
    if (prefixProxyValidationError) {
      showNotification(prefixProxyValidationError, 'error');
      return;
    }

    const name = prefixProxyEditor.fileName.trim();
    const payload = prefixProxyUpdatedText;
    const fileSize = new Blob([payload]).size;
    if (fileSize > MAX_AUTH_FILE_SIZE) {
      showNotification(
        t('auth_files.upload_error_size', { maxSize: formatFileSize(MAX_AUTH_FILE_SIZE) }),
        'error'
      );
      return;
    }

    setPrefixProxyEditor((prev) => {
      if (!prev || prev.fileName !== prefixProxyEditor.fileName) return prev;
      return { ...prev, saving: true };
    });

    try {
      await authFilesApi.uploadText(name, payload);
      showNotification(
        prefixProxyEditor.isNew
          ? t('auth_files.notion_create_success', {
              name,
              defaultValue: `已创建认证文件 "${name}"`,
            })
          : t('auth_files.prefix_proxy_saved_success', { name }),
        'success'
      );
      await loadFiles();
      await loadKeyStats();
      setPrefixProxyEditor(null);
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : '';
      showNotification(`${t('notification.upload_failed')}: ${errorMessage}`, 'error');
      setPrefixProxyEditor((prev) => {
        if (!prev || prev.fileName !== prefixProxyEditor.fileName) return prev;
        return { ...prev, saving: false };
      });
    }
  };

  return {
    prefixProxyEditor,
    prefixProxyUpdatedText,
    prefixProxyDirty,
    prefixProxyValidationError,
    openPrefixProxyEditor,
    openNewNotionEditor,
    closePrefixProxyEditor,
    handlePrefixProxyChange,
    handlePrefixProxySave,
  };
}
