import { fileURLToPath } from 'node:url';

/** @type {import('next').NextConfig} */
const nextConfig = {
    distDir: process.env.AUTH_E2E_DIST_DIR ?? '.next',
    output: 'standalone',
    outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
    reactStrictMode: true,
    transpilePackages: ['@languon/contracts'],
    async headers() {
        return [
            {
                headers: [
                    {
                        key: 'Content-Security-Policy',
                        value: "frame-ancestors 'none'",
                    },
                    { key: 'X-Frame-Options', value: 'DENY' },
                ],
                source: '/:path*',
            },
        ];
    },
};

export default nextConfig;
