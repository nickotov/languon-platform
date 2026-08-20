import { ConfigProvider, theme as antdTheme } from 'antd';
import {
    createContext,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from 'react';

export type ThemePreference = 'dark' | 'light' | 'system';

interface ThemeContextValue {
    preference: ThemePreference;
    resolved: 'dark' | 'light';
    setPreference(value: ThemePreference): void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);
const storageKey = 'languon-admin-theme';

export function AdminThemeProvider({ children }: { children: ReactNode }) {
    const [preference, setPreferenceState] = useState<ThemePreference>(() => {
        const stored = localStorage.getItem(storageKey);
        return stored === 'dark' || stored === 'light' || stored === 'system'
            ? stored
            : 'system';
    });
    const [systemDark, setSystemDark] = useState(
        () => matchMedia('(prefers-color-scheme: dark)').matches,
    );
    useEffect(() => {
        const media = matchMedia('(prefers-color-scheme: dark)');
        const listener = () => setSystemDark(media.matches);
        media.addEventListener('change', listener);
        return () => media.removeEventListener('change', listener);
    }, []);
    const resolved =
        preference === 'system' ? (systemDark ? 'dark' : 'light') : preference;
    useEffect(() => {
        document.documentElement.dataset.theme = resolved;
        document.documentElement.style.colorScheme = resolved;
    }, [resolved]);
    const setPreference = (value: ThemePreference) => {
        localStorage.setItem(storageKey, value);
        setPreferenceState(value);
    };
    const value = useMemo(
        () => ({ preference, resolved, setPreference }),
        [preference, resolved],
    );
    return (
        <ThemeContext.Provider value={value}>
            <ConfigProvider
                theme={{
                    algorithm:
                        resolved === 'dark'
                            ? antdTheme.darkAlgorithm
                            : antdTheme.defaultAlgorithm,
                    token: {
                        borderRadius: 10,
                        colorPrimary:
                            resolved === 'dark' ? '#bba6ff' : '#5c3ccb',
                        colorError: resolved === 'dark' ? '#ff8b8b' : '#b42318',
                        fontFamily:
                            'Manrope, ui-sans-serif, system-ui, -apple-system, sans-serif',
                    },
                }}
            >
                {children}
            </ConfigProvider>
        </ThemeContext.Provider>
    );
}

export function useAdminTheme(): ThemeContextValue {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('AdminThemeProvider is missing.');
    return context;
}
