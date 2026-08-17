'use client';
import {
    createContext,
    type ReactNode,
    useContext,
    useEffect,
    useMemo,
    useState,
} from 'react';
import type { ThemePreference } from './theme';
const ThemeContext = createContext<{
    preference: ThemePreference;
    setPreference(value: ThemePreference): void;
} | null>(null);
export function ThemeProvider({
    children,
    preference: initialPreference,
}: {
    children: ReactNode;
    preference: ThemePreference;
}) {
    const [preference, setPreference] = useState(initialPreference);
    useEffect(() => {
        document.documentElement.dataset.theme = preference;
    }, [preference]);
    const value = useMemo(() => ({ preference, setPreference }), [preference]);
    return (
        <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
    );
}
export function useTheme() {
    const value = useContext(ThemeContext);
    if (!value) throw new Error('useTheme must be used within ThemeProvider');
    return value;
}
