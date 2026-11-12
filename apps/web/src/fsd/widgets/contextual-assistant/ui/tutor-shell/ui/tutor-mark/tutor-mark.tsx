'use client';
import { Sparkles, GraduationCap } from 'lucide-react';
import styles from '../../../styles/tutor-shell-common.module.css';

export function TutorMark({ workspace = false }: { workspace?: boolean }) {
    return (
        <span className={styles.mark} aria-hidden>
            {workspace ? <GraduationCap /> : <Sparkles />}
        </span>
    );
}
