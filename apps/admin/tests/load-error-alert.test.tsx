import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
    isOfflineFailure,
    LoadErrorAlert,
} from '../src/shared/ui/load-error-alert';

describe('LoadErrorAlert', () => {
    it('renders an accessible retry button and invokes the retry action', () => {
        const retry = vi.fn();
        render(
            <LoadErrorAlert
                error={{ statusCode: 503 }}
                message='Users could not be loaded.'
                offlineDescription='You are offline.'
                onRetry={retry}
                retryDescription='The service did not respond.'
                retryLabel='Retry'
            />,
        );

        fireEvent.click(screen.getByRole('button', { name: 'Retry' }));

        expect(retry).toHaveBeenCalledOnce();
        expect(screen.getByText('The service did not respond.')).toBeVisible();
    });

    it('distinguishes a status-zero network failure', () => {
        expect(isOfflineFailure({ statusCode: 0 })).toBe(true);
        expect(isOfflineFailure({ statusCode: 500 })).toBe(false);
    });
});
