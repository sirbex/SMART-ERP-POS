import { useEffect, useRef } from 'react';

/**
 * Submits the active modal/form when Enter is pressed (excluding input/textarea focus).
 *
 * @param isOpen    - Whether the modal/dialog is currently open
 * @param canSubmit - Whether the form is valid and the submit action is allowed
 * @param onSubmit  - The submit callback to invoke
 *
 * @example
 * useSubmitOnEnter(isModalOpen, !isLoading && !!formData.name, handleSubmit);
 */
export function useSubmitOnEnter(
    isOpen: boolean,
    canSubmit: boolean,
    onSubmit: () => void
): void {
    // Keep a stable ref to onSubmit so the effect doesn't re-register on every render
    const onSubmitRef = useRef(onSubmit);
    useEffect(() => {
        onSubmitRef.current = onSubmit;
    });

    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key !== 'Enter' || e.shiftKey) return;
            const tag = (e.target as HTMLElement).tagName;
            if (tag === 'INPUT' || tag === 'TEXTAREA') return;
            if (!canSubmit) return;
            e.preventDefault();
            onSubmitRef.current();
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, canSubmit]);
}
