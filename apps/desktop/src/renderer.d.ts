import type { StudioBridge } from './shared/bridge';

declare global {
  interface Window {
    readonly studio: StudioBridge;
  }

  const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
  const MAIN_WINDOW_VITE_NAME: string;
}
