import type { StorybookConfig } from '@storybook/nextjs-vite';
const config: StorybookConfig = {
    addons: ['@storybook/addon-a11y'],
    framework: '@storybook/nextjs-vite',
    // Inferred recursive contract props stall automatic documentation transforms.
    // Stories declare their controls and remain executable without prop extraction.
    typescript: { reactDocgen: false },
    stories: ['../src/**/*.stories.@(ts|tsx)'],
};

export default config;
