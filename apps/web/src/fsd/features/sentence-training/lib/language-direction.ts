'use client';

export function languageDirection(language: string) {
    return /^(ar|he|fa|ur)(-|$)/i.test(language) ? 'rtl' : 'ltr';
}
