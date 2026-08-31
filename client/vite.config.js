// client/vite.config.js

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs'; // <-- Import the Node.js file system module
import path from 'path'; // <-- Import the Node.js path module
import { normalizeAppBasePath } from './src/config/normalizeBasePath.js';

export default defineConfig(({ mode }) => {
  // Check if SSL certificates exist (for local development)
  const keyPath = path.resolve(__dirname, 'cert/key.pem');
  const certPath = path.resolve(__dirname, 'cert/cert.pem');
  const hasSSLCerts = fs.existsSync(keyPath) && fs.existsSync(certPath);

  return {
    // Set VITE_BASE_PATH=/itsnotes/ when serving the app below a proxy path.
    base: normalizeAppBasePath(process.env.VITE_BASE_PATH),
    plugins: [react()],
    server: {
      port: 3000,
      open: true,
      host: true,  // Correctly set for network access

      // --- Add the HTTPS configuration only if certificates exist ---
      ...(hasSSLCerts && {
        https: {
          // Read the key file content
          key: fs.readFileSync(keyPath),
          // Read the certificate file content
          cert: fs.readFileSync(certPath)
        }
      }),
      // -----------------------------------

      // Disable caching (your existing settings)
      fs: {
        strict: true,
      },
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'Pragma': 'no-cache',
      },
    },

    // Define environment variables (your existing settings)
    define: {
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.REACT_APP_SERVER_PORT': JSON.stringify(process.env.REACT_APP_SERVER_PORT || '5000'),
      __DISABLE_CONSOLE__: mode === 'production'
    },

    // Build options (your existing settings)
    build: {
      rollupOptions: {
        output: {
          manualChunks: {
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-tiptap': [
              '@tiptap/react', '@tiptap/starter-kit',
              '@tiptap/extension-bubble-menu', '@tiptap/extension-details',
              '@tiptap/extension-details-content', '@tiptap/extension-details-summary',
              '@tiptap/extension-gapcursor', '@tiptap/extension-heading',
              '@tiptap/extension-highlight', '@tiptap/extension-link',
              '@tiptap/extension-placeholder', '@tiptap/extension-table',
              '@tiptap/extension-table-cell', '@tiptap/extension-table-header',
              '@tiptap/extension-table-row', '@tiptap/extension-task-item',
              '@tiptap/extension-task-list', '@tiptap/extension-underline',
              '@tiptap/suggestion',
            ],
            'vendor-ui': ['framer-motion', 'styled-components', '@dnd-kit/core', '@dnd-kit/sortable', '@dnd-kit/utilities'],
            'vendor-utils': ['lodash-es', 'date-fns', 'axios', 'socket.io-client', 'jszip'],
          },
          entryFileNames: `assets/[name]-[hash].js`,
          chunkFileNames: `assets/[name]-[hash].js`,
          assetFileNames: `assets/[name]-[hash].[ext]`,
        },
      },
      assetsInlineLimit: 0,
      chunkSizeWarningLimit: 800,
      sourcemap: true,
    },

    // Test configuration for vitest
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: [],
      coverage: {
        reporter: ['text', 'json', 'html'],
      },
    },
  };
});
