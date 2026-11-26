import type { Meta, StoryObj } from '@storybook/nextjs-vite';
import { userEvent } from 'storybook/test';
import { EmbedCard } from './ui/embed-card/embed-card';
import { KnowledgeEmbed } from './knowledge-embed';
import styles from './knowledge-embed-common.module.css';

const meta = {
    component: KnowledgeEmbed,
    title: 'Knowledge/Document embeds',
} satisfies Meta<typeof KnowledgeEmbed>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Website: Story = {
    args: { type: 'websiteEmbed', src: 'https://lessons.example.org/reading' },
};

// The isolated card uses local artwork so the dialog story runs without an external host.
const imageFixture =
    'data:image/svg+xml,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="540" height="360" viewBox="0 0 540 360"><rect width="540" height="360" fill="#e5ecdb"/><circle cx="113" cy="105" r="46" fill="#eeb56a"/><path d="M0 274L178 135L332 271L420 185L540 268V360H0Z" fill="#6e8769"/><path d="M0 322L226 231L345 277L540 233V360H0Z" fill="#384e43"/></svg>',
    );

export const ExpandedImage: Story = {
    args: {
        type: 'imageEmbed',
        src: 'https://lessons.example.org/landscape.png',
    },
    render: (args) => (
        <EmbedCard {...args} title='Image · lessons.example.org'>
            <img alt='Landscape' className={styles.image} src={imageFixture} />
        </EmbedCard>
    ),
    play: async ({ canvas }) => {
        await userEvent.click(
            canvas.getByRole('button', {
                name: /Load preview|Загрузить предпросмотр/,
            }),
        );

        await userEvent.click(
            canvas.getByRole('button', { name: /Expand|Развернуть/ }),
        );
    },
};

export const UnavailableImage: Story = {
    args: { type: 'imageEmbed', src: 'https://lessons.example.org/image.png' },
    render: (args) => (
        <EmbedCard {...args} title='Image · lessons.example.org'>
            <span role='status' className={styles.failure}>
                The image could not be loaded.
            </span>
        </EmbedCard>
    ),
    play: async ({ canvas }) => {
        await userEvent.click(
            canvas.getByRole('button', {
                name: /Load preview|Загрузить предпросмотр/,
            }),
        );
    },
    globals: { viewport: { value: 'phone' } },
};
