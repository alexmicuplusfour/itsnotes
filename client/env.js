import { APP_BASE_PATH, withAppBasePath } from './src/config/appBasePath';

const getConfig = () => {
  if (typeof window !== 'undefined') {
    const { hostname, protocol, port } = window.location;

    // Vite dev server runs on port 3000 — connect directly to the server
    if (port === '3000') {
      const serverPort = process.env.REACT_APP_SERVER_PORT || '5000';
      return {
        SERVER_BASE_URL: `${protocol}//${hostname}:${serverPort}`,
        API_BASE_URL: `${protocol}//${hostname}:${serverPort}/api`,
        SOCKET_URL: `${protocol}//${hostname}:${serverPort}`,
        SOCKET_PATH: '/socket.io',
        IS_DOCKER: false,
      };
    }

    // Docker / production — Nginx proxies /api and /socket.io to the server
    return {
      SERVER_BASE_URL: APP_BASE_PATH,
      API_BASE_URL: withAppBasePath('api'),
      SOCKET_URL: '',
      SOCKET_PATH: withAppBasePath('socket.io'),
      IS_DOCKER: true,
    };
  }

  // Build-time fallback (Node.js / SSR)
  return {
    SERVER_BASE_URL: APP_BASE_PATH,
    API_BASE_URL: withAppBasePath('api'),
    SOCKET_URL: '',
    SOCKET_PATH: withAppBasePath('socket.io'),
    IS_DOCKER: true,
  };
};

export default getConfig();
