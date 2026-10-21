import { Suspense } from 'react';
import { PortraitManualPage } from '@/fsd/pages/learner-portrait';

export default function Page() {
    return <Suspense fallback={null}><PortraitManualPage /></Suspense>;
}
