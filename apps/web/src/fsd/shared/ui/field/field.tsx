import {
    cloneElement,
    isValidElement,
    type ReactElement,
    type ReactNode,
    useId,
} from 'react';

import styles from './field.module.css';

type ControlProps = {
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    'data-validation'?: 'success';
    id?: string;
    required?: boolean;
};

export function Field({
    children,
    error,
    hint,
    label,
    optionalLabel,
    required,
    success,
}: {
    children: ReactElement<ControlProps>;
    error?: string;
    hint?: string;
    label: ReactNode;
    optionalLabel?: string;
    required?: boolean;
    success?: string;
}) {
    const generatedId = useId();
    const controlId = children.props.id ?? `${generatedId}-control`;
    const descriptionId =
        error || success || hint ? `${generatedId}-description` : undefined;
    const controlProps: ControlProps = { id: controlId };
    if (descriptionId)
        controlProps['aria-describedby'] = [
            children.props['aria-describedby'],
            descriptionId,
        ]
            .filter(Boolean)
            .join(' ');
    if (error) controlProps['aria-invalid'] = true;
    if (success && !error) controlProps['data-validation'] = 'success';
    if (required) controlProps.required = true;
    const control = isValidElement(children)
        ? cloneElement(children, controlProps)
        : children;

    return (
        <div className={styles.field}>
            <label
                className={styles.label}
                data-required={required || undefined}
                htmlFor={controlId}
            >
                {label}
                {!required && optionalLabel ? (
                    <span className={styles.optional}> {optionalLabel}</span>
                ) : null}
            </label>
            {control}
            {error ? (
                <span className={styles.error} id={descriptionId}>
                    {error}
                </span>
            ) : success ? (
                <span className={styles.success} id={descriptionId}>
                    <span aria-hidden='true'>✓ </span>
                    {success}
                </span>
            ) : hint ? (
                <span className={styles.hint} id={descriptionId}>
                    {hint}
                </span>
            ) : null}
        </div>
    );
}
