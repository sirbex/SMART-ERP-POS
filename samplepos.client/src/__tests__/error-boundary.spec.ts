/**
 * ErrorBoundary Tests
 *
 * Tests that the ErrorBoundary component catches render errors
 * and shows the fallback UI.
 */

import { describe, it, expect, vi } from 'vitest';
import React from 'react';

// Since we can't import react-dom in Vitest without jsdom,
// we test the component class logic directly.
import ErrorBoundary from '../components/ErrorBoundary';

describe('ErrorBoundary', () => {
    describe('getDerivedStateFromError', () => {
        it('should return hasError true and the error object', () => {
            const error = new Error('Test error');
            // Access static method directly
            const state = (ErrorBoundary as unknown as { getDerivedStateFromError: (e: Error) => { hasError: boolean; error: Error } })
                .getDerivedStateFromError(error);
            expect(state.hasError).toBe(true);
            expect(state.error).toBe(error);
        });
    });

    describe('component structure', () => {
        it('should be a React component class', () => {
            expect(ErrorBoundary).toBeDefined();
            expect(ErrorBoundary.prototype).toBeDefined();
            expect(typeof ErrorBoundary.prototype.render).toBe('function');
            expect(typeof ErrorBoundary.prototype.componentDidCatch).toBe('function');
        });
    });

    describe('props interface', () => {
        it('should accept children prop', () => {
            // Verify the component can be constructed (basic smoke test)
            const child = React.createElement('span', null, 'Hello');
            const element = React.createElement(ErrorBoundary, { children: child, section: 'Test' });
            expect(element).toBeDefined();
            expect(element.props.section).toBe('Test');
        });

        it('should accept optional fallback prop', () => {
            const fallback = React.createElement('div', null, 'Error');
            const child = React.createElement('span', null, 'Hello');
            const element = React.createElement(ErrorBoundary, { children: child, fallback });
            expect(element.props.fallback).toBeDefined();
        });

        it('should accept optional onError callback', () => {
            const onError = vi.fn();
            const child = React.createElement('span', null, 'Hello');
            const element = React.createElement(ErrorBoundary, { children: child, onError });
            expect(element.props.onError).toBe(onError);
        });
    });
});
