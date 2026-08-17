export const themePreferences = ['light', 'dark', 'system'] as const;
export type ThemePreference = (typeof themePreferences)[number];
export const themeCookieName = 'languon-theme';
export function isThemePreference(value: string): value is ThemePreference {
    return themePreferences.includes(value as ThemePreference);
}
export function preferredTheme(value: string | undefined): ThemePreference {
    return value && isThemePreference(value) ? value : 'system';
}
