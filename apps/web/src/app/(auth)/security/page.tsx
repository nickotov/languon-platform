import type { Metadata } from 'next';

import { SecurityPage } from '@/fsd/pages/security/ui/security-page';

export const metadata: Metadata = { title: 'Security · Languon' };

export default function Page() {
    return <SecurityPage />;
}
