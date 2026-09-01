import { normalizeAppBasePath } from './normalizeBasePath';

export { normalizeAppBasePath } from './normalizeBasePath';

const trimTrailingSlash = (value) => value.replace(/\/+$/, '');

export const APP_BASE_URL = normalizeAppBasePath(import.meta.env.BASE_URL);
export const APP_BASE_PATH = APP_BASE_URL === '/' ? '' : trimTrailingSlash(APP_BASE_URL);

export const withAppBasePath = (path = '') => {
  const relativePath = String(path).replace(/^\/+/, '');
  return `${APP_BASE_URL}${relativePath}`;
};
