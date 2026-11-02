export const APP_INFO_CHANNEL = 'studio:get-app-info';

export interface AppInfo {
  name: string;
  version: string;
  platform: string;
}

export interface StudioBridge {
  getAppInfo(): Promise<AppInfo>;
}
