'use client';
import { useMemo, useRef } from 'react';
import { createLearningApi } from '../../../api/learning-api';
import { FlashcardPracticeLauncher } from '../flashcard-practice-launcher/flashcard-practice-launcher';
import { type TrainingLauncherProps } from '../types';

export function TrainingLauncher(props: TrainingLauncherProps) {
    function resolveTargetIdentity() {
        if (props.target.kind === 'owner') {
            return `owner:${props.target.dictionaryId}`;
        }

        return `shared:${props.target.shareId}:${props.target.shareKey}`;
    }

    const targetIdentity = resolveTargetIdentity();

    const key = `${props.identity}:${props.signedIn}:${targetIdentity}`;

    return <DictionaryLauncher key={key} {...props} />;
}

function DictionaryLauncher(props: TrainingLauncherProps) {
    const targetRef = useRef(props.target);
    const { signedIn, requestWithSession } = props;
    const api = useMemo(
        () =>
            createLearningApi({
                target: targetRef.current,
                signedIn,
                requestWithSession,
            }),
        [signedIn, requestWithSession],
    );

    return <FlashcardPracticeLauncher {...props} api={api} />;
}
