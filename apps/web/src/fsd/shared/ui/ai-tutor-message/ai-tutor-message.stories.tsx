import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { AiTutorMessage } from './ai-tutor-message';
export default {
    title: 'UI/AI tutor message',
    component: AiTutorMessage,
} satisfies Meta<typeof AiTutorMessage>;
export const States: StoryObj<typeof AiTutorMessage> = {
    render: () => (
        <div style={{ display: 'grid', gap: 20 }}>
            <AiTutorMessage
                tutorName='Sofía'
                timestamp='2:14 PM'
                message='¡Buenos días! ¿Cómo estás hoy?'
                translation='Good morning! How are you today?'
                translationVisible
                onPlayAudio={() => {}}
                onToggleTranslation={() => {}}
            />
            <AiTutorMessage status='typing' />
            <AiTutorMessage status='error' onRetry={() => {}} />
        </div>
    ),
};
