import { Suspense } from 'react';
import { PortraitOverviewPage } from '@/fsd/pages/learner-portrait';

export default function Page() {
    return <Suspense fallback={null}><PortraitOverviewPage /></Suspense>;
}
