import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
        if (oldEnvironment === undefined) {
            delete process.env.NODE_ENV;
        } else {
            process.env.NODE_ENV = oldEnvironment;
        }

        if (oldTarget === undefined) {
            delete process.env.WEB_API_PROXY_TARGET;
        } else {
            process.env.WEB_API_PROXY_TARGET = oldTarget;
        }
    }
});

test('only the isolated website wrapper can frame external HTTPS origins', async () => {
    const rules = await nextConfig.headers();
    const policyFor = (source) =>
        rules
            .find((rule) => rule.source === source)
            ?.headers.find((header) => header.key === 'Content-Security-Policy')
            ?.value;
    const appPolicy = policyFor('/:path*');
    assert.match(appPolicy, /frame-ancestors 'none'/);
    assert.match(
        appPolicy,
        /frame-src 'self' https:\/\/www\.youtube-nocookie\.com;/,
    );

    const wrapperPolicy = policyFor('/knowledge-website-preview.html');
    assert.match(wrapperPolicy, /default-src 'none'/);
    assert.match(wrapperPolicy, /frame-ancestors 'self'/);
    assert.match(wrapperPolicy, /sandbox allow-scripts;/);
    const markup = await readFile(
        new URL('../public/knowledge-website-preview.html', import.meta.url),
        'utf8',
    );

    for (const tag of ['script', 'style']) {
        const content = markup.match(
            new RegExp(`<${tag}>([\\s\\S]+?)</${tag}>`),
        )[1];
        const hash = createHash('sha256').update(content).digest('base64');
        assert.ok(wrapperPolicy.includes(`${tag}-src 'sha256-${hash}'`));
    }
});
