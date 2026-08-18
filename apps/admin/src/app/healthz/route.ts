function releaseSha(): string {
    const value = process.env.RELEASE_SHA;
    return value && /^(development|[0-9a-f]{7,64})$/.test(value)
        ? value
        : 'development';
}

export function GET(): Response {
    return Response.json(
        { release: releaseSha(), service: 'admin', status: 'ok' },
        { headers: { 'Cache-Control': 'no-store' } },
    );
}
