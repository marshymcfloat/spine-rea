import { contextBridge, ipcRenderer } from 'electron';
import { APP_INFO_CHANNEL, type AppInfo, type StudioBridge } from './shared/bridge';

const bridge: StudioBridge = Object.freeze({
  getAppInfo: (...args: unknown[]): Promise<AppInfo> => {
    if (args.length !== 0) {
      return Promise.reject(new Error('getAppInfo accepts no arguments.'));
    }
    return ipcRenderer.invoke(APP_INFO_CHANNEL) as Promise<AppInfo>;
  },
});

contextBridge.exposeInMainWorld('studio', bridge);
