import type { AdminApiError } from '@/shared/api/admin-api';
import { LoadErrorAlert } from '@/shared/ui/load-error-alert';
import {
    useCustom,
    useCustomMutation,
    useLogout,
    useTranslate,
    type BaseRecord,
} from '@refinedev/core';
import { Alert, App, Button, Card, Empty, Skeleton, Typography } from 'antd';
import { useState } from 'react';

import sharedStyles from '../shared/page.module.css';
import type { AiSettingsMutationRequest, AiSettingsResponse } from './types';
import { AiSettingsForm } from './ui/ai-settings-form/ai-settings-form';

type MutationState = 'conflict' | 'recent-auth' | 'unauthorized' | null;

export function AiSettingsPage() {
    const { message } = App.useApp();
    const logout = useLogout();
    const translate = useTranslate();
    const [mutationError, setMutationError] = useState<Error | null>(null);
    const [mutationState, setMutationState] = useState<MutationState>(null);
    const settingsQuery = useCustom<AiSettingsResponse & BaseRecord>({
        method: 'get',
        url: 'ai-settings',
    });
    const saveSettings = useCustomMutation<
        AiSettingsResponse & BaseRecord,
        AdminApiError,
        AiSettingsMutationRequest
    >();
    const response = settingsQuery.query.data?.data;

    const handleReload = async () => {
        await settingsQuery.query.refetch();
    };

    const handleLogout = () => logout.mutate();

    const handleSubmit = async (request: AiSettingsMutationRequest) => {
        setMutationError(null);
        setMutationState(null);
        try {
            await saveSettings.mutateAsync({
                method: 'patch',
                url: 'ai-settings',
                values: request,
            });
            await message.success(translate('aiSettings.saved'));
            await settingsQuery.query.refetch();
        } catch (error) {
            setMutationState(mutationErrorState(error));
            setMutationError(
                error instanceof Error
                    ? error
                    : new Error(translate('errors.retry')),
            );
        }
    };

    const hasProviders = (response?.providers.length ?? 0) > 0;

    return (
        <main className={sharedStyles.stack}>
            <header className={sharedStyles.heading}>
                <div>
                    <Typography.Text className={sharedStyles.eyebrow}>
                        {translate('aiSettings.eyebrow')}
                    </Typography.Text>
                    <Typography.Title>
                        {translate('aiSettings.heading')}
                    </Typography.Title>
                </div>
                <Typography.Text type='secondary'>
                    {translate('aiSettings.summary')}
                </Typography.Text>
            </header>

            {settingsQuery.query.isError ? (
                <LoadErrorAlert
                    error={settingsQuery.query.error}
                    message={translate('aiSettings.error')}
                    offlineDescription={translate('errors.offline')}
                    onRetry={() => void handleReload()}
                    retryDescription={translate('errors.retry')}
                    retryLabel={translate('actions.retry')}
                />
            ) : null}

            <Skeleton active loading={settingsQuery.query.isLoading}>
                {response && !hasProviders ? (
                    <Card>
                        <Empty description={translate('aiSettings.empty')} />
                    </Card>
                ) : null}

                {response && hasProviders ? (
                    <>
                        {mutationState ? (
                            <MutationAlert
                                error={mutationError}
                                onLogout={handleLogout}
                                onReload={handleReload}
                                state={mutationState}
                            />
                        ) : mutationError ? (
                            <Alert
                                description={translate('errors.retry')}
                                message={mutationError.message}
                                showIcon
                                type='error'
                            />
                        ) : null}
                        <AiSettingsForm
                            key={response.settings.version}
                            onSubmit={handleSubmit}
                            response={response}
                            saving={saveSettings.mutation.isPending}
                        />
                    </>
                ) : null}
            </Skeleton>
        </main>
    );
}

function MutationAlert({
    error,
    onLogout,
    onReload,
    state,
}: {
    error: Error | null;
    onLogout(): void;
    onReload(): Promise<void>;
    state: Exclude<MutationState, null>;
}) {
    const translate = useTranslate();
    const conflict = state === 'conflict';
    const title = conflict
        ? translate('aiSettings.conflictTitle')
        : state === 'recent-auth'
          ? translate('aiSettings.recentAuthenticationTitle')
          : translate('aiSettings.unauthorizedTitle');
    const description = conflict
        ? translate('aiSettings.conflictDescription')
        : state === 'recent-auth'
          ? translate('aiSettings.recentAuthenticationDescription')
          : translate('aiSettings.unauthorizedDescription');
    const action = conflict ? (
        <Button onClick={() => void onReload()}>
            {translate('aiSettings.reloadConflict')}
        </Button>
    ) : (
        <Button onClick={onLogout}>
            {translate('aiSettings.signInAgain')}
        </Button>
    );
    return (
        <Alert
            action={action}
            description={error?.message ?? description}
            message={title}
            showIcon
            type='error'
        />
    );
}

function mutationErrorState(error: unknown): MutationState {
    if (!isAdminApiError(error)) return null;
    const code = String(error.detail.code);
    if (code === 'ai_settings_conflict' || code === 'settings_conflict') {
        return 'conflict';
    }
    if (code === 'recent_authentication_required') return 'recent-auth';
    if (code === 'admin_access_denied' || code === 'authentication_required') {
        return 'unauthorized';
    }
    return null;
}

function isAdminApiError(error: unknown): error is AdminApiError {
    return (
        typeof error === 'object' &&
        error !== null &&
        'detail' in error &&
        typeof error.detail === 'object' &&
        error.detail !== null &&
        'code' in error.detail
    );
}
