import { useState } from 'react';
import { MessageSquarePlus } from 'lucide-react';
import { useI18n } from '@/fsd/shared/i18n';
import { ButtonLink, InlineAlert, Switch } from '@/fsd/shared/ui';
import type { PortraitManagement } from '../../hooks/use-portrait-management';
import { portraitCopy } from '../../lib/copy';
import styles from '../common.module.css';

export function PortraitUseControl({
    management,
}: {
    management: PortraitManagement;
}) {
    const { locale } = useI18n();
    const [justDisabled, setJustDisabled] = useState(false);
    const state = management.query.data;
    async function change(enabled: boolean) {
        const result = await management.setUse(enabled);
        if (result) setJustDisabled(!enabled);
    }
    function dismiss() {
        setJustDisabled(false);
    }
    if (!state?.approved) return null;
    return (
        <section className={`${styles.panel} ${styles.compactStack}`}>
            <Switch
                checked={state.useEnabled}
                onCheckedChange={change}
                disabled={management.pending}
                label={portraitCopy(locale, 'use')}
                description={portraitCopy(
                    locale,
                    state.useEnabled ? 'useOn' : 'useOff',
                )}
            />
            {justDisabled && !state.useEnabled && (
                <InlineAlert
                    title={portraitCopy(locale, 'turnedOff')}
                    onDismiss={dismiss}
                    actions={
                        <ButtonLink
                            href='/knowledge'
                            size='compact'
                            variant='secondary'
                            leadingIcon={
                                <MessageSquarePlus aria-hidden size={16} />
                            }
                        >
                            {portraitCopy(locale, 'fresh')}
                        </ButtonLink>
                    }
                >
                    {portraitCopy(locale, 'history')}{' '}
                    {portraitCopy(locale, 'freshHelp')}
                </InlineAlert>
            )}
        </section>
    );
}
