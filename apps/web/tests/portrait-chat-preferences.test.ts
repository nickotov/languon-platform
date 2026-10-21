import { expect, it } from 'vitest';
import { ChatPreferencesSchema } from '@languon/contracts';
import {
    inheritPortraitField,
    mergeDisplayedPreferences,
} from '../src/fsd/features/conversation-preferences/lib/portrait-preferences';

it('writes one explicit manual override without persisting other inherited values as manual defaults', () => {
    const manual = ChatPreferencesSchema.parse({
        mode: 'practice',
        replyLanguage: 'en',
        tone: 'academic',
        detail: 'concise',
        wording: 'academic',
        approach: 'theory-first',
        portrait: {
            enabled: true,
            inheritedFields: [
                'replyLanguage',
                'tone',
                'detail',
                'wording',
                'approach',
            ],
        },
    });
    const displayed = {
        ...manual,
        replyLanguage: 'es',
        tone: 'conversational' as const,
        detail: 'detailed' as const,
        wording: 'simple' as const,
        approach: 'examples-first' as const,
    };
    const changed = mergeDisplayedPreferences(manual, displayed, {
        ...displayed,
        wording: 'balanced',
    });
    expect(changed).toMatchObject({
        mode: 'practice',
        replyLanguage: 'en',
        tone: 'academic',
        detail: 'concise',
        wording: 'balanced',
        approach: 'theory-first',
    });
    expect(changed.portrait?.inheritedFields).toEqual([
        'replyLanguage',
        'tone',
        'detail',
        'approach',
    ]);
});

it('adopting or resetting portrait fields preserves manual fallback and independent mode', () => {
    const manual = ChatPreferencesSchema.parse({
        mode: 'correct',
        wording: 'academic',
        portrait: { enabled: true, inheritedFields: [] },
    });
    const adopted = mergeDisplayedPreferences(
        manual,
        manual,
        inheritPortraitField(manual),
    );
    expect(adopted.wording).toBe('academic');
    expect(adopted.mode).toBe('correct');
    expect(adopted.portrait?.inheritedFields).toHaveLength(6);
    const reset = inheritPortraitField(
        { ...manual, portrait: { enabled: true, inheritedFields: ['tone'] } },
        'wording',
    );
    expect(reset.portrait?.inheritedFields).toEqual(['tone', 'wording']);
});

it('excluding a portrait preserves manual defaults and inheritance for later explicit use', () => {
    const manual = ChatPreferencesSchema.parse({
        tone: 'academic',
        portrait: { enabled: true, inheritedFields: ['tone'] },
    });
    const effective = { ...manual, tone: 'conversational' as const };
    const next = mergeDisplayedPreferences(manual, effective, {
        ...effective,
        portrait: { ...manual.portrait!, enabled: false },
    });
    expect(next.tone).toBe('academic');
    expect(next.portrait).toEqual({
        enabled: false,
        inheritedFields: ['tone'],
    });
});

it('Automatic clears an optional override without changing other manual fallbacks', () => {
    const manual = ChatPreferencesSchema.parse({
        mode: 'explain',
        detail: 'concise',
        wording: 'academic',
    });
    const next = mergeDisplayedPreferences(manual, manual, {
        ...manual,
        detail: undefined,
    });
    expect(next.detail).toBeUndefined();
    expect(next.wording).toBe('academic');
    expect(next.mode).toBe('explain');
});

it('manual Automatic wording cannot re-inherit the portrait through the legacy explanation level', () => {
    const manual = ChatPreferencesSchema.parse({
        explanationLevel: 'auto',
        wording: 'academic',
        portrait: {
            enabled: true,
            inheritedFields: ['explanationLevel', 'wording', 'detail'],
        },
    });
    const displayed = {
        ...manual,
        explanationLevel: 'beginner' as const,
        wording: 'simple' as const,
    };
    const changed = mergeDisplayedPreferences(manual, displayed, {
        ...displayed,
        wording: undefined,
    });
    expect(changed.explanationLevel).toBe('auto');
    expect(changed.wording).toBeUndefined();
    expect(changed.portrait?.inheritedFields).toEqual(['detail']);
});
