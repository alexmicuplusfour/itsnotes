export const normalizeAppBasePath = (value = '/') => {
  const path = String(value || '/').trim();

  if (path === '/' || path === '') return '/';

  return `/${path.replace(/^\/+/, '').replace(/\/+$/, '')}/`;
};
