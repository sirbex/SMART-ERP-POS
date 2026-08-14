/**
 * Global FormSection — progressive field bundle (shared chrome).
 *
 * Modules supply a FormSectionDef catalog from shared/* SSOT.
 * Do not copy accordion markup into pages.
 */

import { createContext, useContext, type ReactNode } from 'react';
import {
  getFormSection,
  type FormSectionDef,
} from '@shared/ui/formSectionsSsot';
import { AdaptiveFormLayout } from '../adaptive/AdaptiveFormLayout';
import { useFormSections, type UseFormSectionsResult } from '../../hooks/useFormSections';

type FormSectionCatalogContextValue = UseFormSectionsResult & {
  sections: readonly FormSectionDef[];
};

const FormSectionCatalogContext = createContext<FormSectionCatalogContextValue | null>(null);

export function useFormSectionCatalog(): FormSectionCatalogContextValue {
  const ctx = useContext(FormSectionCatalogContext);
  if (!ctx) {
    throw new Error(
      'useFormSectionCatalog requires <FormSectionCatalog> — do not invent local form bundles'
    );
  }
  return ctx;
}

type FormSectionCatalogProps = {
  sections: readonly FormSectionDef[];
  /** Module key → formSections.open.{key} in localStorage (optional). */
  persistKey?: string;
  children: ReactNode;
  className?: string;
};

/**
 * Provider for a form's section catalog. Wrap the form once; children use <FormSection id="…"/>.
 */
export function FormSectionCatalog({
  sections,
  persistKey,
  children,
  className = '',
}: FormSectionCatalogProps) {
  const api = useFormSections(sections, { persistKey });
  return (
    <FormSectionCatalogContext.Provider value={{ ...api, sections }}>
      <div className={`space-y-3 ${className}`.trim()} data-form-sections="catalog">
        {children}
      </div>
    </FormSectionCatalogContext.Provider>
  );
}

type FormSectionProps = {
  /** Must exist in the catalog passed to FormSectionCatalog. */
  id: string;
  children: ReactNode;
  /** Override catalog default for this mount only (rare). */
  forceOpen?: boolean;
  /** Extra classes on the adaptive field grid when open. */
  contentClassName?: string;
};

/**
 * One collapsible field bundle. Label/description come from shared catalog SSOT.
 */
export function FormSection({
  id,
  children,
  forceOpen,
  contentClassName = 'gap-3',
}: FormSectionProps) {
  const { sections, isOpen, toggle } = useFormSectionCatalog();
  const meta = getFormSection(sections, id);
  const open = forceOpen ?? isOpen(id);

  return (
    <section
      className="border border-gray-200 rounded-lg overflow-hidden"
      data-form-section={id}
      data-form-section-open={open ? 'true' : 'false'}
    >
      <button
        type="button"
        onClick={() => toggle(id)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-gray-50 hover:bg-gray-100 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block text-xs font-semibold uppercase tracking-wide text-gray-600">
            {meta.label}
          </span>
          {meta.description ? (
            <span className="block text-[11px] text-gray-400 font-normal normal-case tracking-normal mt-0.5 truncate">
              {meta.description}
            </span>
          ) : null}
        </span>
        <span className="text-xs text-gray-400 shrink-0">{open ? 'Hide' : 'Show'}</span>
      </button>
      {open ? (
        <div className="p-3">
          <AdaptiveFormLayout gapClassName={contentClassName} columnsOverride={3}>
            {children}
          </AdaptiveFormLayout>
        </div>
      ) : null}
    </section>
  );
}
