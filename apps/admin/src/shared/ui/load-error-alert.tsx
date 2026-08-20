import { Alert, Button } from 'antd';

export interface LoadErrorAlertProps {
    error: unknown;
    message: string;
    offlineDescription: string;
    onRetry: () => void;
    retryDescription: string;
    retryLabel: string;
}

export function LoadErrorAlert({
    error,
    message,
    offlineDescription,
    onRetry,
    retryDescription,
    retryLabel,
}: LoadErrorAlertProps) {
    return (
        <Alert
            action={
                <Button onClick={onRetry} size='small'>
                    {retryLabel}
                </Button>
            }
            description={
                isOfflineFailure(error) ? offlineDescription : retryDescription
            }
            message={message}
            showIcon
            type='error'
        />
    );
}

export function isOfflineFailure(error: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return true;
    }
    return (
        typeof error === 'object' &&
        error !== null &&
        'statusCode' in error &&
        error.statusCode === 0
    );
}
