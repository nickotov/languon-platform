import { Suspense } from 'react';
import { PortraitIntroPage } from '@/fsd/pages/learner-portrait';

export default function Page() {
    return <Suspense fallback={null}><PortraitIntroPage /></Suspense>;
}
