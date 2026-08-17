import { cookies } from 'next/headers';
import { preferredTheme, themeCookieName, type ThemePreference } from './theme';
export async function getRequestTheme(): Promise<ThemePreference> {
    return preferredTheme((await cookies()).get(themeCookieName)?.value);
}
