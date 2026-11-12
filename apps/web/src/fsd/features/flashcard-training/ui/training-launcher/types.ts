'use client';
import type { FlashcardItem, Presentation } from '../../types';
import type { ReactNode } from 'react';
import { type MenuItem } from '@/fsd/shared/ui';
import type {
    RequestWithSession,
    TrainingTarget,
    LearningApi,
} from '../../types';
import type { TrainingLanguage } from '../manual-selection/manual-selection';

export interface TrainingLauncherProps {
    renderAudio?(item: FlashcardItem, presentation: Presentation): ReactNode;
    target: TrainingTarget;
    requestWithSession: RequestWithSession;
    signedIn: boolean;
    identity: string;
    dictionaryTitle: string;
    sourceLanguage: TrainingLanguage;
    targetLanguage: TrainingLanguage;
    activeCount: number;
    archived?: boolean;
    className?: string;
    triggerClassName?: string | undefined;
    desktopIconOnly?: boolean;
    placement?: 'top' | 'bottom';
    /** Higher-level composition supplies other learning journeys. */
    additionalItems?: MenuItem[];
    menuTrigger?: ReactNode;
    menuLabel?: string | undefined;
}

export type FlashcardPracticeLauncherProps = Omit<
    TrainingLauncherProps,
    'target' | 'requestWithSession'
> & { api: LearningApi };
