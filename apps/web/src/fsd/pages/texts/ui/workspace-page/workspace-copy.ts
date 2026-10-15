import { useI18n } from '@/fsd/shared/i18n';
import type { textsWorkspaceEn } from '@/fsd/shared/i18n/messages/texts-workspace';
export type WorkspaceCopyKey =
    keyof typeof textsWorkspaceEn extends `texts.workspace.${infer K}`
        ? K
        : never;
export function useWorkspaceCopy() {
    const { t, locale } = useI18n();
    return {
        locale,
        copy: (key: WorkspaceCopyKey) =>
            t(`texts.workspace.${key}` as Parameters<typeof t>[0]),
    };
}
