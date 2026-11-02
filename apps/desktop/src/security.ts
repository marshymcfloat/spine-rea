import path from 'node:path';

export const STUDIO_URL = 'app://studio/index.html';
export const PRODUCTION_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "frame-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export function isTrustedRendererUrl(candidate: string, devServerUrl?: string): boolean {
  try {
    return new URL(candidate).href === new URL(devServerUrl ?? STUDIO_URL).href;
  } catch {
    return false;
  }
}

export function resolveRendererAsset(requestUrl: string, rendererRoot: string): string | null {
  try {
    const url = new URL(requestUrl);
    if (url.protocol !== 'app:' || url.host !== 'studio') return null;
    const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
    if (/[\0\\:]/.test(pathname) || pathname.split('/').some((part) => part === '.' || part === '..')) {
      return null;
    }
    const resolved = path.resolve(rendererRoot, `.${pathname}`);
    const relative = path.relative(rendererRoot, resolved);
    return relative.startsWith('..') || path.isAbsolute(relative) ? null : resolved;
  } catch {
    return null;
  }
}
