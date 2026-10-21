import type { NavigationResource } from '@languon/contracts';
export function resourceMetadata(
    resource: NavigationResource,
    locale: string,
    section: string,
) {
    const pieces = [section, resource.description ?? resource.language];
    if (resource.lastOpenedAt) {
        const minutes = Math.max(
            0,
            Math.floor(
                (Date.now() - Date.parse(resource.lastOpenedAt)) / 60_000,
            ),
        );
        const format = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
        if (minutes < 60) pieces.push(format.format(-minutes, 'minute'));
        else if (minutes < 1440)
            pieces.push(format.format(-Math.floor(minutes / 60), 'hour'));
        else pieces.push(format.format(-Math.floor(minutes / 1440), 'day'));
    }
    return pieces.filter(Boolean).join(' · ');
}
