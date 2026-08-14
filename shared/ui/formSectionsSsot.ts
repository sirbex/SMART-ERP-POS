/**
 * Global form-section SSOT — progressive field bundles for every module.
 *
 * Screens MUST NOT invent local FormBundle / accordion section metadata.
 * Domain catalogs (HR, expenses, assets…) declare `FormSectionDef[]` and render
 * via the shared FormSection / useFormSections primitives.
 *
 * Open/closed is presentation only — never hides required validation.
 */

export type FormSectionDef = {
  /** Stable id — also used as React key and persistence map key. */
  id: string;
  /** Operator-facing section title. */
  label: string;
  /** Initial open state when no persisted preference exists. */
  defaultOpen: boolean;
  /** Optional one-line hint under the title when open. */
  description?: string;
};

export type FormSectionIdOf<T extends readonly FormSectionDef[]> = T[number]['id'];

/** Seed open map from catalog defaults (pure). */
export function buildOpenSectionsMap(
  sections: readonly FormSectionDef[]
): Record<string, boolean> {
  const map: Record<string, boolean> = {};
  for (const s of sections) {
    map[s.id] = s.defaultOpen;
  }
  return map;
}

/** Fail-loud lookup — refuse unknown section ids (typos / drift). */
export function getFormSection(
  sections: readonly FormSectionDef[],
  id: string
): FormSectionDef {
  const found = sections.find((s) => s.id === id);
  if (!found) {
    throw new Error(
      `Unknown form section '${id}' — not in catalog [${sections.map((s) => s.id).join(', ')}]`
    );
  }
  return found;
}

export function isFormSectionId(
  sections: readonly FormSectionDef[],
  id: string
): boolean {
  return sections.some((s) => s.id === id);
}

/**
 * Merge persisted prefs onto catalog defaults.
 * Unknown persisted keys are dropped (catalog is SSOT).
 */
export function mergeFormSectionOpenState(
  sections: readonly FormSectionDef[],
  persisted: Record<string, boolean> | null | undefined
): Record<string, boolean> {
  const base = buildOpenSectionsMap(sections);
  if (!persisted || typeof persisted !== 'object') return base;
  for (const s of sections) {
    if (typeof persisted[s.id] === 'boolean') {
      base[s.id] = persisted[s.id];
    }
  }
  return base;
}

/** localStorage key helper — one namespace for all modules. */
export function formSectionsStorageKey(moduleKey: string): string {
  if (!moduleKey.trim()) {
    throw new Error('formSectionsStorageKey requires a non-empty moduleKey');
  }
  return `formSections.open.${moduleKey.trim()}`;
}
