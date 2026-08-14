import type { Metadata } from 'next';

import { ForgotPasswordPage } from '@/fsd/pages/forgot-password/ui/forgot-password-page';
import { localizedMetadata } from '@/fsd/shared/i18n/metadata';

export async function generateMetadata(): Promise<Metadata> {
    return localizedMetadata('meta.forgotPassword');
}

export default function Page() {
    return <ForgotPasswordPage />;
}
