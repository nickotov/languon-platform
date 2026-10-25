import { Coins, RefreshCw } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { compactCreditAmount } from '@/fsd/shared/lib/credit-amount';
import { Button, Card, InlineAlert, LoadingState } from '@/fsd/shared/ui';
import { useCreditBalance } from '../../hooks/use-credit-balance';
import styles from './credit-balance.module.css';

export function CreditBalance() {
    const { t, locale } = useI18n();
    const balance = useCreditBalance();
    const data = balance.data;
    const hasBalance = !balance.isError && data !== undefined;
    const showExact = data?.mode === 'limited';
    const exactBalance = data?.mode === 'limited' ? data.availableCredits : '';

    const value =
        data?.mode === 'limited'
            ? compactCreditAmount(data.availableCredits, locale)
            : t('profile.balanceUnlimited');
    function refresh() {
        void balance.refetch();
    }
    return (
        <Card variant='outlined' className={styles.card}>
            <div className={styles.header}>
                <div className={styles.title}>
                    <Coins size={20} aria-hidden='true' />
                    <h2>{t('profile.balanceTitle')}</h2>
                </div>
                <Button
                    variant='quiet'
                    size='compact'
                    onClick={refresh}
                    disabled={balance.isFetching}
                    leadingIcon={<RefreshCw />}
                >
                    {t('profile.balanceRefresh')}
                </Button>
            </div>
            {balance.isPending && (
                <LoadingState>{t('profile.balanceLoading')}</LoadingState>
            )}
            {balance.isError && (
                <InlineAlert tone='warning'>
                    {t('profile.balanceError')}
                </InlineAlert>
            )}
            {hasBalance && (
                <>
                    <dl className={styles.balance}>
                        <dt>{t('profile.balanceAvailable')}</dt>
                        <dd>{value}</dd>
                    </dl>
                    {showExact && (
                        <p className={styles.exact}>
                            {t('profile.balanceExact')}: {exactBalance}
                        </p>
                    )}
                </>
            )}
        </Card>
    );
}
