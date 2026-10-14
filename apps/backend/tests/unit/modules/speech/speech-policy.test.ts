import { describe, expect, it } from 'vitest';
import {
    normalizeSpeechText,
    inspectSpeechText,
    speechTextIdentity,
    speechPrice,
} from '../../../../src/modules/speech/domain/speech-policy';

describe('shared pronunciation normalization and pricing', () => {
    it('normalizes Unicode and horizontal whitespace without changing pronunciation distinctions', () => {
        expect(
            normalizeSpeechText(
                '  e\u0301tude\t  française\r\nDeuxième ligne  ',
            ),
        ).toBe('étude française\nDeuxième ligne');
        for (const text of [
            'I',
            'İ',
            'ı',
            'i',
            'résumé',
            'resume',
            'Hello!',
            'hello',
            '👩‍👧',
        ])
            expect(normalizeSpeechText(text)).toBe(text);
    });
    it('uses language and conservative text in shared identity, independently of actors', () => {
        const key = (text: string, language = 'fr') =>
            speechTextIdentity(
                'synthetic-secret',
                language,
                normalizeSpeechText(text),
            );
        expect(key('  e\u0301tude  ')).toBe(key('étude'));
        expect(key('Hello')).not.toBe(key('hello'));
        expect(key('resume')).not.toBe(key('résumé'));
        expect(key('pain', 'fr')).not.toBe(key('pain', 'en'));
        expect(key('hello!')).not.toBe(key('hello'));
    });
    it('separates fixture tones from pronunciation while preserving normalized sharing and legacy identity', () => {
        const key = (
            text: string,
            recordingClass?: 'fixture' | 'pronunciation',
        ) =>
            speechTextIdentity(
                'synthetic-secret',
                'fr',
                normalizeSpeechText(text),
                recordingClass,
            );
        expect(key('  e\u0301tude  ', 'pronunciation')).toBe(
            key('étude', 'pronunciation'),
        );
        expect(key('  e\u0301tude  ', 'fixture')).toBe(key('étude', 'fixture'));
        expect(key('étude', 'fixture')).not.toBe(key('étude', 'pronunciation'));
        expect(key('étude')).not.toBe(key('étude', 'pronunciation'));
        expect(key('étude')).not.toBe(key('étude', 'fixture'));
    });
    it('preserves vertical separators as line breaks in normalized text and cache identity', () => {
        const key = (text: string) =>
            speechTextIdentity(
                'synthetic-secret',
                'en',
                normalizeSpeechText(text),
            );
        for (const separator of [
            '\n',
            '\r\n',
            '\r',
            '\v',
            '\f',
            '\u0085',
            '\u2028',
            '\u2029',
        ]) {
            expect(normalizeSpeechText(`First${separator}Second`)).toBe(
                'First\nSecond',
            );
            expect(key(`First${separator}Second`)).toBe(key('First\nSecond'));
            expect(key(`First${separator}Second`)).not.toBe(
                key('First Second'),
            );
            expect(
                normalizeSpeechText(`First${separator}${separator}Second`),
            ).toBe('First\n\nSecond');
        }
        for (const horizontal of [' ', '\t', '\u00a0', '\u2003', '\u202f'])
            expect(
                normalizeSpeechText(`First${horizontal}${horizontal}Second`),
            ).toBe('First Second');
    });
    it('requires both inclusive free thresholds', () => {
        expect(inspectSpeechText('one '.repeat(10), 'en').free).toBe(true);
        expect(inspectSpeechText('one '.repeat(11), 'en').free).toBe(false);
        expect(inspectSpeechText('x'.repeat(100), 'en').free).toBe(true);
        expect(inspectSpeechText('x'.repeat(101), 'en').free).toBe(false);
        expect(inspectSpeechText('𐐀'.repeat(100), 'en').characterCount).toBe(
            100,
        );
    });
    it('segments Chinese and Japanese without relying on spaces', () => {
        expect(
            inspectSpeechText('我喜欢学习新的语言', 'zh-Hans').wordCount,
        ).toBeGreaterThan(1);
        expect(
            inspectSpeechText('今日は学校で日本語を勉強します', 'ja').wordCount,
        ).toBeGreaterThan(1);
    });
    it('prices the entire text with exact integer ceiling and minimum', () => {
        expect(speechPrice(101, 100, 1)).toBe(11n);
        expect(speechPrice(1000, 100, 1)).toBe(100n);
        expect(speechPrice(1, 1, 5)).toBe(5n);
        expect(speechPrice(2000, 1_000_000_000, 1)).toBe(2_000_000_000n);
        expect(() => speechPrice(100, 0.1, 1)).toThrow();
    });
});
