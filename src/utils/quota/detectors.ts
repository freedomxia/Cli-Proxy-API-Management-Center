import type { TFunction } from 'i18next';
import type { AuthFileItem } from '@/types';
import { apiCallApi } from '@/services/api';
import { CODEX_REQUEST_HEADERS, CODEX_USAGE_URL } from './constants';
import { normalizeAuthIndex, parseCodexUsagePayload } from './parsers';
import { resolveCodexChatgptAccountId } from './resolvers';

export type CodexLimitDetectionResult = {
  limited: boolean;
  error?: string;
  statusCode?: number;
};

export async function detectCodexLimitReached(
  file: AuthFileItem,
  t: TFunction
): Promise<CodexLimitDetectionResult> {
  const rawAuthIndex = file['auth_index'] ?? file.authIndex;
  const authIndex = normalizeAuthIndex(rawAuthIndex);
  if (!authIndex) {
    return { limited: false, error: t('codex_quota.missing_auth_index') };
  }

  const accountId = resolveCodexChatgptAccountId(file);
  if (!accountId) {
    return { limited: false, error: t('codex_quota.missing_account_id') };
  }

  const result = await apiCallApi.request({
    authIndex,
    method: 'GET',
    url: CODEX_USAGE_URL,
    header: {
      ...CODEX_REQUEST_HEADERS,
      'Chatgpt-Account-Id': accountId,
    },
  });
  const statusCode = result.statusCode;

  const payload = parseCodexUsagePayload(result.body ?? result.bodyText);
  const rateLimit = payload?.rate_limit ?? payload?.rateLimit ?? null;
  const allowed = rateLimit?.allowed;
  const limitReached = rateLimit?.limit_reached ?? rateLimit?.limitReached;
  const limitedByPayload = allowed === false || limitReached === true;

  const rawBody = result.body as { error?: { type?: string } } | null;
  const errorType = rawBody?.error?.type ?? '';
  const bodyText = result.bodyText ?? '';
  const limitedByError =
    errorType === 'usage_limit_reached' || bodyText.includes('usage_limit_reached');
  const limited = limitedByPayload || limitedByError;

  if (statusCode >= 200 && statusCode < 300) {
    return limited ? { limited: true, statusCode } : { limited: false, statusCode };
  }

  return limited
    ? { limited: true, statusCode }
    : { limited: false, statusCode, error: bodyText || `HTTP ${statusCode}` };
}
