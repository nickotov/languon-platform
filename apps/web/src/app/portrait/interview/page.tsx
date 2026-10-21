import { Suspense } from 'react';
import { PortraitInterviewPage } from '@/fsd/pages/learner-portrait';

export default function Page() {
    return <Suspense fallback={null}><PortraitInterviewPage /></Suspense>;
}
