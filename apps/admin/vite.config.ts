import { fileURLToPath, URL } from 'node:url';

import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
    build: {
        sourcemap: false,
        target: 'es2023',
    },
    define: {
        __RELEASE_SHA__: JSON.stringify(
            process.env.RELEASE_SHA ?? 'development',
        ),
    },
    plugins: [
        react(),
        {
            generateBundle() {
                this.emitFile({
                    fileName: 'healthz',
                    source: JSON.stringify({
                        release: process.env.RELEASE_SHA ?? 'development',
                        service: 'admin',
                        status: 'ok',
                    }),
                    type: 'asset',
                });
            },
            name: 'admin-release-health',
        },
    ],
    resolve: {
        alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
        port: 3001,
        proxy: {
            '/api': {
                changeOrigin: true,
                rewrite: (requestPath) =>
                    requestPath.replace(/^\/api(?=\/|$)/, ''),
                target:
                    process.env.ADMIN_API_PROXY_TARGET ??
                    'http://127.0.0.1:4000',
            },
        },
        strictPort: true,
    },
    test: {
        environment: 'jsdom',
        exclude: [...configDefaults.exclude, 'tests/e2e/**'],
        setupFiles: ['./tests/setup.ts'],
    },
});
