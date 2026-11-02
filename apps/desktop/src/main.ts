import { app, BrowserWindow, ipcMain, Menu, net, protocol, session } from 'electron';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { APP_INFO_CHANNEL, type AppInfo } from './shared/bridge';
import { isTrustedRendererUrl, PRODUCTION_CSP, resolveRendererAsset, STUDIO_URL } from './security';

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
]);

let mainWindow: BrowserWindow | null = null;
const devServerUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL;

async function createWindow(): Promise<void> {
  const window = new BrowserWindow({
    title: 'Slot Animation Studio',
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: '#17191c',
    show: process.env.STUDIO_SMOKE_TEST !== '1',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  });
  mainWindow = window;
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => {
    if (!isTrustedRendererUrl(event.url, devServerUrl)) event.preventDefault();
  });
  window.webContents.on('will-attach-webview', (event) => event.preventDefault());
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
  });
  await window.loadURL(devServerUrl ?? STUDIO_URL);
}

app.whenReady().then(async () => {
  const rendererRoot = path.join(__dirname, '..', 'renderer', MAIN_WINDOW_VITE_NAME);
  protocol.handle('app', async (request) => {
    const asset = request.method === 'GET' ? resolveRendererAsset(request.url, rendererRoot) : null;
    if (!asset) return new Response('Not found', { status: 404 });
    try {
      const response = await net.fetch(pathToFileURL(asset).href);
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', PRODUCTION_CSP);
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
  session.defaultSession.setPermissionCheckHandler(() => false);
  ipcMain.handle(APP_INFO_CHANNEL, (event, ...args: unknown[]): AppInfo => {
    if (!mainWindow || event.sender !== mainWindow.webContents ||
        event.senderFrame !== mainWindow.webContents.mainFrame ||
        !isTrustedRendererUrl(event.senderFrame.url, devServerUrl) || args.length !== 0) {
      throw new Error('Untrusted application information request.');
    }
    return { name: 'Slot Animation Studio', version: app.getVersion(), platform: process.platform };
  });
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: 'File', submenu: [{ role: 'quit' }] },
    { label: 'Edit', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: 'View', submenu: [{ role: 'reload' }, ...(devServerUrl ? [{ role: 'toggleDevTools' as const }] : []), { role: 'togglefullscreen' }] },
  ]));
  await createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) void createWindow();
  });
}).catch((error: unknown) => {
  console.error('Could not start Slot Animation Studio:', error);
  app.exit(1);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
