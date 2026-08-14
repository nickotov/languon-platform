'use client';

import { useAuth } from '../model/auth-provider';
import { FormMessage } from './auth-shell';
import { useI18n } from '@/fsd/shared/i18n';

export function CapabilityState() {
    const { t } = useI18n();
    const { capabilities, capabilitiesError, refreshCapabilities } = useAuth();
    if (!capabilities && !capabilitiesError) {
        return (
            <p className='loading-state' role='status'>
                {t('auth.capabilitiesChecking')}
            </p>
        );
    }
    if (!capabilitiesError) return null;

    return (
        <FormMessage>
            <p>{capabilitiesError}</p>
            <button
                className='text-button'
                onClick={() => void refreshCapabilities()}
                type='button'
            >
                {t('common.retry')}
            </button>
        </FormMessage>
    );
}
