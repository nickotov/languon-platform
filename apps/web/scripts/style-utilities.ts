export function findUtilityClasses(
    value: string,
    classContext: boolean,
): string[] {
    const additionalExact = new Set([
        'visible',
        'invisible',
        'collapse',
        'table',
        'table-caption',
        'table-cell',
        'table-column',
        'table-column-group',
        'table-footer-group',
        'table-header-group',
        'table-row-group',
        'table-row',
        'flow-root',
        'uppercase',
        'lowercase',
        'capitalize',
        'normal-case',
        'not-italic',
        'overline',
        'line-through',
        'no-underline',
        'subpixel-antialiased',
        'filter',
        'backdrop-filter',
        'resize',
    ]);
    const exact =
        /^(?:flex|grid|block|inline|inline-block|inline-flex|inline-grid|hidden|relative|absolute|fixed|sticky|static|contents|isolate|truncate|italic|underline|antialiased|container|group|peer|sr-only|not-sr-only|grow|shrink|transition|transform|border|rounded|shadow)$/;
    const prefixed =
        /^(?:p[trblxyse]?|m[trblxyse]?|gap|gap-x|gap-y|space-x|space-y|w|h|min-w|max-w|min-h|max-h|size|inset|top|right|bottom|left|z|order|flex|grid|col|row|items|justify|content|self|place-items|place-content|place-self|overflow|overscroll|object|text|font|leading|tracking|bg|border|rounded|shadow|opacity|ring|outline|cursor|select|pointer-events|whitespace|break|transition|duration|ease|delay|animate|translate|scale|rotate|origin|stroke|fill|decoration|aspect|basis|grow|shrink|snap|touch|resize)-[^\s]+$/;

    return value.split(/\s+/).filter((token) => {
        const base = utilityBase(token);
        if (!classContext && isNonClassLiteral(base)) {
            return false;
        }

        return (
            prefixed.test(base) ||
            /^(?:list|divide|columns|float|clear|line-clamp|box|appearance|accent|caret|scroll|backdrop|blur|brightness|contrast|grayscale|hue-rotate|invert|saturate|sepia|drop-shadow)-[^\s]+$/.test(
                base,
            ) ||
            (classContext &&
                (exact.test(base) ||
                    additionalExact.has(base) ||
                    /^(?:p[trblxyse]?|m[trblxyse]?|w|h|gap|bg|text|font|border|rounded|shadow|opacity|z|inset|top|right|bottom|left|translate-[xy]|scale|rotate|duration|delay)-$/.test(
                        base,
                    )))
        );
    });
}

function utilityBase(token: string): string {
    let bracketDepth = 0;
    let variantEnd = -1;
    for (let index = 0; index < token.length; index++) {
        if (token[index] === '[') {
            bracketDepth++;
        }

        if (token[index] === ']') {
            bracketDepth--;
        }

        if (token[index] === ':' && bracketDepth === 0) {
            variantEnd = index;
        }
    }

    return token.slice(variantEnd + 1).replace(/^(?:!|-)/, '');
}

function isNonClassLiteral(base: string): boolean {
    // HTTP headers, placement-library values and query keys aren't classes.
    if (/^content-(?:type|disposition|length)$/.test(base)) {
        return true;
    }

    if (
        /^(?:top|bottom|left|right)-(?:start|end|left|right|top|bottom)$/.test(
            base,
        )
    ) {
        return true;
    }

    // Domain resource and copied-material discriminators are not color utilities.
    if (
        base === 'text-folders' ||
        base === 'text-reference' ||
        base === 'text-selection'
    ) {
        return true;
    }

    // Exercise formats are domain values, not SVG fill classes.
    if (base === 'fill-in-the-blank') {
        return true;
    }

    // AI SDK protocol discriminants are not class names. JSX class contexts stay checked.
    if (/^text-(?:start|delta|end)$/.test(base)) {
        return true;
    }

    if (/^text-ai-(?:request|preference|catalog)$/.test(base)) {
        return true;
    }

    return false;
}
