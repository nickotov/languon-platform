/** Browser calls use the same public API path in every environment. */
export function resolveApiUrl(
    _nodeEnvironment: string | undefined,
    configuredUrl: string | undefined,
): string {
    return (configuredUrl ?? '/api').replace(/\/$/, '');
}
