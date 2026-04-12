import { apiClient } from './client';

export interface PluginConnectionSettings {
  token: string;
  autoEnableOnUpdate: boolean;
}

export const pluginConnectionApi = {
  async getSettings(): Promise<PluginConnectionSettings> {
    const [tokenData, autoEnableData] = await Promise.all([
      apiClient.get<Record<string, unknown>>('/plugin-connection-token'),
      apiClient.get<Record<string, unknown>>('/plugin-auto-enable-on-update'),
    ]);

    const tokenValue = tokenData?.['plugin-connection-token'];
    const autoEnableValue = autoEnableData?.['plugin-auto-enable-on-update'];

    return {
      token: typeof tokenValue === 'string' ? tokenValue : '',
      autoEnableOnUpdate: typeof autoEnableValue === 'boolean' ? autoEnableValue : true,
    };
  },

  updateToken(value: string) {
    return apiClient.put('/plugin-connection-token', { value });
  },

  updateAutoEnableOnUpdate(value: boolean) {
    return apiClient.put('/plugin-auto-enable-on-update', { value });
  },

  async saveSettings(settings: PluginConnectionSettings) {
    await Promise.all([
      apiClient.put('/plugin-connection-token', { value: settings.token }),
      apiClient.put('/plugin-auto-enable-on-update', { value: settings.autoEnableOnUpdate }),
    ]);
  },
};
