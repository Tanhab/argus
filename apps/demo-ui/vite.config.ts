import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

function redirectRootToDemo() {
  return {
    name: 'redirect-root-to-demo',
    configureServer(server: {
      middlewares: {
        use: (
          fn: (
            req: { url?: string },
            res: {
              writeHead: (code: number, headers: Record<string, string>) => void;
              end: () => void;
            },
            next: () => void,
          ) => void,
        ) => void;
      };
    }) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/' || req.url === '/index.html') {
          res.writeHead(302, { Location: '/demo/' });
          res.end();
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), redirectRootToDemo()],
  base: '/demo/',
  server: {
    port: 5173,
    open: '/demo/',
    proxy: {
      '/v1': 'http://localhost:3000',
      '/docs': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
