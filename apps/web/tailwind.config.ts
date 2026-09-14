import type { Config } from 'tailwindcss';

const tokenColors = [
    'background-canvas',
    'background-surface',
    'background-subtle',
    'background-elevated',
    'text-primary',
    'text-secondary',
    'text-tertiary',
    'text-disabled',
    'text-on-primary',
    'text-on-danger',
    'border-default',
    'border-strong',
    'border-focus',
    'primary-default',
    'primary-hover',
    'primary-pressed',
    'primary-subtle',
    'success-default',
    'success-subtle',
    'warning-default',
    'warning-subtle',
    'danger-default',
    'danger-subtle',
    'info-default',
    'selection',
    'overlay',
    'state-selected-bg',
    'state-correct',
    'state-incorrect',
    'state-hint-bg',
    'vocabulary-term',
    'grammar-concept',
    'ai-message-bg',
    'user-message-bg',
    'progress-fill',
    'progress-track',
    'completed',
    'review-due',
    'locked',
] as const;

const colors = Object.fromEntries(
    tokenColors.map((name) => [name, `var(--${name})`]),
);

for (const family of [
    'neutral',
    'primary',
    'success',
    'warning',
    'danger',
    'info',
]) {
    for (const step of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) {
        colors[`${family}-${step}`] = `var(--${family}-${step})`;
    }
}

const config: Config = {
    content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
    darkMode: ['selector', '[data-theme="dark"]'],
    theme: {
        extend: {
            colors,
            fontFamily: {
                body: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
                heading: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
                sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
            },
            borderRadius: {
                'token-xs': 'var(--radius-xs)',
                'token-sm': 'var(--radius-sm)',
                'token-md': 'var(--radius-md)',
                'token-lg': 'var(--radius-lg)',
                'token-xl': 'var(--radius-xl)',
                'token-full': 'var(--radius-full)',
            },
            boxShadow: {
                'elevation-sm': 'var(--elevation-sm)',
                'elevation-md': 'var(--elevation-md)',
                'elevation-lg': 'var(--elevation-lg)',
            },
            maxWidth: {
                form: 'var(--size-max-width-form)',
                reading: 'var(--size-max-width-reading)',
                app: 'var(--size-max-width-app)',
            },
            minHeight: {
                'touch-target': 'var(--size-touch-target-min)',
                control: 'var(--size-control-default)',
            },
            height: {
                'control-compact': 'var(--size-control-compact)',
                control: 'var(--size-control-default)',
                'control-large': 'var(--size-control-large)',
            },
            width: {
                'control-compact': 'var(--size-control-compact)',
                control: 'var(--size-control-default)',
            },
            transitionDuration: {
                fast: 'var(--duration-fast)',
                normal: 'var(--duration-normal)',
                slow: 'var(--duration-slow)',
            },
            transitionTimingFunction: {
                standard: 'var(--easing-standard)',
                decelerate: 'var(--easing-decelerate)',
                accelerate: 'var(--easing-accelerate)',
            },
        },
    },
};

export default config;
