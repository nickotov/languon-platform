import type { Metadata } from 'next';
import { Suspense } from 'react';

import { ProfilePage, ProfilePageFallback } from '@/fsd/pages/profile';
import { localizedMetadata } from '@/fsd/shared/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
    return localizedMetadata('meta.profile');
}

export default function Page() {
    return <Suspense fallback={<ProfilePageFallback />}><ProfilePage /></Suspense>;
}
