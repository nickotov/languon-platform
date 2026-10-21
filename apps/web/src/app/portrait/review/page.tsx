import { Suspense } from 'react';
import { PortraitReviewPage } from '@/fsd/pages/learner-portrait';

export default function Page() {
    return <Suspense fallback={null}><PortraitReviewPage /></Suspense>;
}
