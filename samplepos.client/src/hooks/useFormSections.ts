/**
 * Shared hook: open/close form section bundles from a global catalog.
 * Optional persistence via formSectionsStorageKey (shared/ui/formSectionsSsot).
 *
 * Screens must pass a domain catalog (e.g. EMPLOYEE_FORM_SECTIONS) — never invent section ids inline.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  buildOpenSectionsMap,
  formSectionsStorageKey,
  getFormSection,
  mergeFormSectionOpenState,
  type FormSectionDef,
} from '@shared/ui/formSectionsSsot';

export type UseFormSectionsResult = {
  open: Record<string, boolean>;
  isOpen: (id: string) => boolean;
  toggle: (id: string) => void;
  setOpen: (id: string, next: boolean) => void;
  getSection: (id: string) => FormSectionDef;
  resetToDefaults: () => void;
};

function readPersisted(
  storageKey: string | null,
  sections: readonly FormSectionDef[]
): Record<string, boolean> {
  const defaults = buildOpenSectionsMap(sections);
  if (!storageKey || typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return defaults;
    return mergeFormSectionOpenState(sections, JSON.parse(raw) as Record<string, boolean>);
  } catch {
    return defaults;
  }
}

export function useFormSections(
  sections: readonly FormSectionDef[],
  opts?: { persistKey?: string }
): UseFormSectionsResult {
  const storageKey = opts?.persistKey ? formSectionsStorageKey(opts.persistKey) : null;

  const [open, setOpenMap] = useState<Record<string, boolean>>(() =>
    readPersisted(storageKey, sections)
  );

  // Catalog drift: keep only known ids; apply new defaults for new sections
  useEffect(() => {
    setOpenMap((prev) => mergeFormSectionOpenState(sections, prev));
  }, [sections]);

  useEffect(() => {
    if (!storageKey || typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(open));
    } catch {
      /* quota / private mode — non-fatal */
    }
  }, [storageKey, open]);

  const toggle = useCallback(
    (id: string) => {
      getFormSection(sections, id);
      setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
    },
    [sections]
  );

  const setOpen = useCallback(
    (id: string, nextVal: boolean) => {
      getFormSection(sections, id);
      setOpenMap((prev) => ({ ...prev, [id]: nextVal }));
    },
    [sections]
  );

  const isOpen = useCallback((id: string) => Boolean(open[id]), [open]);

  const getSection = useCallback((id: string) => getFormSection(sections, id), [sections]);

  const resetToDefaults = useCallback(() => {
    const defaults = buildOpenSectionsMap(sections);
    setOpenMap(defaults);
    if (storageKey && typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(defaults));
      } catch {
        /* ignore */
      }
    }
  }, [sections, storageKey]);

  return useMemo(
    () => ({ open, isOpen, toggle, setOpen, getSection, resetToDefaults }),
    [open, isOpen, toggle, setOpen, getSection, resetToDefaults]
  );
}
