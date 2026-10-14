import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
    // Keep the development indicator away from the pinned sidebar footer.
    devIndicators: { position: 'bottom-right' },
    distDir: process.env.AUTH_E2E_DIST_DIR ?? '.next',
    output: 'standalone',
    outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
    reactStrictMode: true,
    transpilePackages: ['@languon/contracts'],
    async rewrites() {
        if (process.env.NODE_ENV !== 'development') return [];

        const target = new URL(
            process.env.WEB_API_PROXY_TARGET ?? 'http://localhost:4000',
        );
        const isLocalBackend =
            ['localhost', '127.0.0.1'].includes(target.hostname) ||
            (target.hostname === 'backend' && target.port === '4000');
        if (
            target.protocol !== 'http:' ||
            !isLocalBackend ||
            target.username !== '' ||
            target.password !== '' ||
            target.pathname !== '/' ||
            target.search !== '' ||
            target.hash !== ''
        ) {
            throw new Error(
                'WEB_API_PROXY_TARGET must be a credential-free loopback HTTP origin or http://backend:4000.',
            );
        }
        return [
            { source: '/api/:path*', destination: `${target.origin}/:path*` },
        ];
    },
    async headers() {
        return [
            {
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: "frame-ancestors 'none'; media-src 'self' blob:",
                    },
                    { key: 'X-Frame-Options', value: 'DENY' },
                ],
                source: '/:path*',
            },
        ];
    },
};

export default nextConfig;
