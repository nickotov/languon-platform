import type { Metadata } from 'next';

import { SecurityPage } from '@/fsd/pages/security/ui/security-page';
import { localizedMetadata } from '@/fsd/shared/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
    return localizedMetadata('meta.security');
}

export default function Page() {
    return <SecurityPage />;
}
