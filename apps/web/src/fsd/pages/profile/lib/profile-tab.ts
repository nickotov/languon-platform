export type ProfileTab = 'account' | 'billing' | 'credits' | 'security';

export function isProfileTab(value: string | null): value is ProfileTab {
    return (
        value === 'account' ||
        value === 'security' ||
        value === 'billing' ||
        value === 'credits'
    );
}
