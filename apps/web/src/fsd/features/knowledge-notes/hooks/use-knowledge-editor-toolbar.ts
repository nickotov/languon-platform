import { useState } from 'react';
import type { ChangeEvent } from 'react';
import type { Editor } from '@tiptap/react';
import { KnowledgeLinkSchema } from '@languon/contracts';
import {
    Bold,
    Italic,
    Underline,
    Strikethrough,
    List,
    ListOrdered,
    Quote,
    Undo2,
    Redo2,
    Link2,
    Table,
    Minus,
} from 'lucide-react';
import type { MessageKey } from '@/fsd/shared/i18n';

export function useKnowledgeEditorToolbar(editor: Editor) {
    const [linkOpen, setLinkOpen] = useState(false);
    const [link, setLink] = useState('');
    const [linkError, setLinkError] = useState(false);
    const controls: {
        key: MessageKey;
        icon: typeof Bold;
        active?: boolean;
        unavailable?: boolean;
        action(): void;
    }[] = [
        {
            key: 'knowledge.bold',
            icon: Bold,
            active: editor.isActive('bold'),
            action: () => {
                editor.chain().focus().toggleBold().run();
            },
        },
        {
            key: 'knowledge.italic',
            icon: Italic,
            active: editor.isActive('italic'),
            action: () => {
                editor.chain().focus().toggleItalic().run();
            },
        },
        {
            key: 'knowledge.underline',
            icon: Underline,
            active: editor.isActive('underline'),
            action: () => {
                editor.chain().focus().toggleUnderline().run();
            },
        },
        {
            key: 'knowledge.strike',
            icon: Strikethrough,
            active: editor.isActive('strike'),
            action: () => {
                editor.chain().focus().toggleStrike().run();
            },
        },
        {
            key: 'knowledge.bulletList',
            icon: List,
            active: editor.isActive('bulletList'),
            action: () => {
                editor.chain().focus().toggleBulletList().run();
            },
        },
        {
            key: 'knowledge.orderedList',
            icon: ListOrdered,
            active: editor.isActive('orderedList'),
            action: () => {
                editor.chain().focus().toggleOrderedList().run();
            },
        },
        {
            key: 'knowledge.blockquote',
            icon: Quote,
            active: editor.isActive('blockquote'),
            action: () => {
                editor.chain().focus().toggleBlockquote().run();
            },
        },
        {
            key: 'knowledge.link',
            icon: Link2,
            active: editor.isActive('link'),
            action: () => {
                setLink(String(editor.getAttributes('link').href ?? ''));
                setLinkError(false);
                setLinkOpen(true);
            },
        },
        {
            key: 'knowledge.table',
            icon: Table,
            unavailable: editor.isActive('table'),
            action: () => {
                editor
                    .chain()
                    .focus()
                    .insertTable({ rows: 3, cols: 2, withHeaderRow: true })
                    .run();
            },
        },
        {
            key: 'knowledge.horizontalRule',
            icon: Minus,
            action: () => {
                editor.chain().focus().setHorizontalRule().run();
            },
        },
        {
            key: 'knowledge.undo',
            icon: Undo2,
            unavailable: !editor.can().undo(),
            action: () => {
                editor.chain().focus().undo().run();
            },
        },
        {
            key: 'knowledge.redo',
            icon: Redo2,
            unavailable: !editor.can().redo(),
            action: () => {
                editor.chain().focus().redo().run();
            },
        },
    ];
    function applyLink() {
        const href = link.trim();
        if (!KnowledgeLinkSchema.safeParse(href).success) {
            setLinkError(true);
            return;
        }
        editor.chain().focus().extendMarkRange('link').setLink({ href }).run();
        setLinkOpen(false);
    }
    let paragraph = 'paragraph';
    if (editor.isActive('heading', { level: 1 })) paragraph = '1';
    if (editor.isActive('heading', { level: 2 })) paragraph = '2';
    if (editor.isActive('heading', { level: 3 })) paragraph = '3';
    function changeParagraph(event: ChangeEvent<HTMLSelectElement>) {
        const value = event.target.value;
        if (value === 'paragraph') editor.chain().focus().setParagraph().run();
        else if (value === '1' || value === '2' || value === '3')
            editor
                .chain()
                .focus()
                .setHeading({ level: Number(value) as 1 | 2 | 3 })
                .run();
    }
    function closeLink() {
        setLinkOpen(false);
    }
    function changeLink(event: ChangeEvent<HTMLInputElement>) {
        setLink(event.target.value);
    }
    function removeLink() {
        editor.chain().focus().extendMarkRange('link').unsetLink().run();
        setLinkOpen(false);
    }
    return {
        controls,
        paragraph,
        changeParagraph,
        linkOpen,
        link,
        linkError,
        applyLink,
        closeLink,
        changeLink,
        removeLink,
    };
}
