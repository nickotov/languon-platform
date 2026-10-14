import assert from 'node:assert/strict';
import { test } from 'node:test';
import nextConfig from '../next.config.mjs';

test('development proxies /api without changing backend route paths', async () => {
    const oldEnvironment = process.env.NODE_ENV;
    const oldTarget = process.env.WEB_API_PROXY_TARGET;
    try {
        process.env.NODE_ENV = 'development';
        delete process.env.WEB_API_PROXY_TARGET;
        assert.deepEqual(await nextConfig.rewrites(), [
            {
                source: '/api/:path*',
                destination: 'http://localhost:4000/:path*',
            },
        ]);
        process.env.WEB_API_PROXY_TARGET = 'http://127.0.0.1:4005/';
        assert.deepEqual(await nextConfig.rewrites(), [
            {
                source: '/api/:path*',
                destination: 'http://127.0.0.1:4005/:path*',
            },
        ]);
        process.env.WEB_API_PROXY_TARGET = 'http://backend:4000';
        assert.deepEqual(await nextConfig.rewrites(), [
            {
                source: '/api/:path*',
                destination: 'http://backend:4000/:path*',
            },
        ]);
        for (const invalid of [
            'http://backend:4001',
            'http://backend',
            'http://backend.example:4000',
            'https://external.example',
            'http://localhost:4000/api',
            'http://user:password@localhost:4000',
            'http://localhost:4000?secret=1',
            'http://localhost:4000/#fragment',
        ]) {
            process.env.WEB_API_PROXY_TARGET = invalid;
            await assert.rejects(nextConfig.rewrites(), /loopback HTTP origin/);
        }
        process.env.NODE_ENV = 'production';
        assert.deepEqual(await nextConfig.rewrites(), []);
    } finally {
        if (oldEnvironment === undefined) delete process.env.NODE_ENV;
        else process.env.NODE_ENV = oldEnvironment;
        if (oldTarget === undefined) delete process.env.WEB_API_PROXY_TARGET;
        else process.env.WEB_API_PROXY_TARGET = oldTarget;
    }
});
