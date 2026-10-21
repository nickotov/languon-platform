import { FileText, Languages, Lightbulb } from 'lucide-react';
import type { NavigationResourceKind } from '@languon/contracts';
export const navigationSections = [
    {
        kind: 'dictionary',
        path: '/dictionaries',
        label: 'home.dictionaries',
        createLabel: 'dictionary.library.create',
        emptyLabel: 'shell.emptyDictionary',
        icon: Languages,
    },
    {
        kind: 'text',
        path: '/texts',
        label: 'texts.manage.navigation',
        createLabel: 'shell.newText',
        emptyLabel: 'shell.emptyText',
        icon: FileText,
    },
    {
        kind: 'knowledge',
        path: '/knowledge',
        label: 'knowledge.title',
        createLabel: 'shell.newKnowledge',
        emptyLabel: 'shell.emptyKnowledge',
        icon: Lightbulb,
    },
] as const;
export type NavigationSection = (typeof navigationSections)[number];
export function currentResourceId(
    kind: NavigationResourceKind,
    pathname: string,
): string | undefined {
    const path = pathname.split('/');
    if (kind === 'dictionary' && path[1] === 'dictionaries') return path[2];
    if (kind === 'knowledge' && path[1] === 'knowledge') return path[2];
    if (kind === 'text' && path[1] === 'texts')
        return path[2] === 'folders' ? path[5] : path[2];
    return undefined;
}
