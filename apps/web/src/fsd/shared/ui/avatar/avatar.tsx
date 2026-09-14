'use client';

import { UserIcon } from 'lucide-react';
import { useState } from 'react';
import styles from './avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg';
export interface AvatarProps {
    src?: string;
    name?: string;
    initials?: string;
    size?: AvatarSize;
    className?: string;
}

export function getInitials(name?: string): string {
    const parts = name?.trim().split(/\s+/).filter(Boolean) ?? [];
    if (!parts.length) return '';
    return (
        parts.length === 1
            ? parts[0]!.slice(0, 2)
            : `${parts[0]![0]}${parts.at(-1)?.[0]}`
    ).toUpperCase();
}

export function Avatar({
    src,
    name,
    initials,
    size = 'md',
    className,
}: AvatarProps) {
    const [failed, setFailed] = useState(false);
    const showImage = Boolean(src) && !failed;
    const fallback = initials ?? getInitials(name);
    return (
        <span
            className={[styles.avatar, styles[size], className]
                .filter(Boolean)
                .join(' ')}
            role={showImage ? undefined : 'img'}
            aria-label={showImage ? undefined : name || 'User avatar'}
        >
            {showImage ? (
                <img
                    src={src}
                    alt={name ? `${name}'s avatar` : 'User avatar'}
                    onError={() => setFailed(true)}
                />
            ) : fallback ? (
                <span aria-hidden='true'>{fallback}</span>
            ) : (
                <UserIcon aria-hidden='true' />
            )}
        </span>
    );
}
