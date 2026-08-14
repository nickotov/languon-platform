'use client';

import { useAuth } from '../model/auth-provider';
import { FormMessage } from './auth-shell';

export function CapabilityState() {
    const { capabilities, capabilitiesError, refreshCapabilities } = useAuth();
    if (!capabilities && !capabilitiesError) {
        return (
            <p className='loading-state' role='status'>
                Checking available sign-in methods…
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
                Retry
            </button>
        </FormMessage>
    );
}
