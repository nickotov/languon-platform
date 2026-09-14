import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AudioPlayer } from './audio-player';
export default {
    title: 'UI/Audio player',
    component: AudioPlayer,
} satisfies Meta<typeof AudioPlayer>;
export const Default: StoryObj<typeof AudioPlayer> = {
    args: {
        src: '/audio/example.mp3',
        label: '¿Dónde está la estación de tren?',
    },
};
export const CompactDisabled: StoryObj<typeof AudioPlayer> = {
    args: {
        src: '/audio/example.mp3',
        label: 'la casa',
        size: 'sm',
        disabled: true,
    },
};
