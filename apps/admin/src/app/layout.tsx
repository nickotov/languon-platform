import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import './globals.css';

export const metadata: Metadata = {
    description: 'Languon operations and content administration.',
    title: 'Languon Admin',
};

export default function RootLayout({ children }: { children: ReactNode }) {
    return (
        <html lang='en'>
            <body>{children}</body>
        </html>
    );
}
