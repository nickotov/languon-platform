import { DictionarySharing } from '@/fsd/features/dictionary-sharing';
import { BottomSheet } from '@/fsd/shared/ui';
import type { ComponentProps } from 'react';
import type { EditorViewFields } from '../../lib/editor-workspace';

export function EditorSharingSheet({
    model,
}: {
    model: Pick<
        EditorViewFields,
        't' | 'sharingOpen' | 'setSharingOpen' | 'share' | 'current'
    >;
}) {
    const { t, sharingOpen, setSharingOpen, share, current } = model;

    const handleClose: ComponentProps<typeof BottomSheet>['onClose'] = () =>
        setSharingOpen(false);

    const handleRevoke: ComponentProps<
        typeof DictionarySharing
    >['onRevoke'] = async () => {
        await share.mutateAsync('revoke');
    };

    const handleRotate: ComponentProps<
        typeof DictionarySharing
    >['onRotate'] = async () => {
        const response = await share.mutateAsync('rotate');
        if (!response.capability) throw new Error('Capability unavailable');
        return response.capability;
    };

    return (
        <BottomSheet
            open={sharingOpen}
            onClose={handleClose}
            title={t('dictionary.editor.sharing')}
            closeLabel={t('common.cancel')}
        >
            <DictionarySharing
                dictionary={current}
                onRevoke={handleRevoke}
                onRotate={handleRotate}
                pending={share.isPending}
            />
        </BottomSheet>
    );
}
