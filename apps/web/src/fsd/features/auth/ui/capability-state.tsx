'use client';

import { useAuth } from '../model/auth-provider';
import { FormMessage } from './auth-shell';
import { useI18n } from '@/fsd/shared/i18n';
import { Button, LoadingState } from '@/fsd/shared/ui';

export function CapabilityState() {
    const { t } = useI18n();
    const { capabilities, capabilitiesError, refreshCapabilities } = useAuth();
    if (!capabilities && !capabilitiesError) {
        return <LoadingState>{t('auth.capabilitiesChecking')}</LoadingState>;
    }
    if (!capabilitiesError) return null;

    return (
        <FormMessage>
            <p>{capabilitiesError}</p>
            <Button
                onClick={() => void refreshCapabilities()}
                type='button'
                variant='ghost'
            >
                {t('common.retry')}
            </Button>
        </FormMessage>
    );
}
