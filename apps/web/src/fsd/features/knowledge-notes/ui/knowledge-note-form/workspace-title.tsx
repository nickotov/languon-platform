'use client';

import {
    useLayoutEffect,
    useRef,
    type ChangeEvent,
    type KeyboardEvent,
} from 'react';
import { useI18n } from '@/fsd/shared/i18n';
import styles from './knowledge-note-form.module.css';

export function WorkspaceTitle({
    value,
    disabled,
    onChange,
    onVisibilityChange,
}: {
    value: string;
    disabled: boolean;
    onChange(value: string): void;
    onVisibilityChange?: ((visible: boolean) => void) | undefined;
}) {
    const { t } = useI18n();
    const ref = useRef<HTMLTextAreaElement>(null);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element) return;
        function measure() {
            if (!element) return;
            element.style.height = 'auto';
            element.style.height = `${element.scrollHeight}px`;
        }
        measure();
        const observer = new ResizeObserver(measure);
        observer.observe(element);
        return () => observer.disconnect();
    }, [value]);
    useLayoutEffect(() => {
        const element = ref.current;
        if (!element || !onVisibilityChange) return;
        const root = element.closest('[data-workspace-scroll]');
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry) onVisibilityChange(entry.isIntersecting);
            },
            { root, threshold: 0 },
        );
        observer.observe(element);
        return () => observer.disconnect();
    }, [onVisibilityChange]);
    function change(event: ChangeEvent<HTMLTextAreaElement>) {
        onChange(event.target.value.replace(/\n/g, ' '));
    }
    function keyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
        if (event.key !== 'Enter' || event.nativeEvent.isComposing) return;
        event.preventDefault();
        ref.current
            ?.closest('article')
            ?.querySelector<HTMLElement>('[role="textbox"]')
            ?.focus();
    }
    return (
        <textarea
            ref={ref}
            rows={1}
            className={styles.title}
            value={value}
            disabled={disabled}
            maxLength={200}
            aria-label={t('knowledge.noteTitle')}
            placeholder={t('knowledge.untitled')}
            onChange={change}
            onKeyDown={keyDown}
        />
    );
}
