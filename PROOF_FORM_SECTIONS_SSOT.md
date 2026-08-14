# PROOF_FORM_SECTIONS_SSOT

Global progressive form field bundles.

- SSOT types/helpers: `shared/ui/formSectionsSsot.ts`
- Domain catalogs: e.g. `shared/hr/employeeFormSections.ts`
- UI: `FormSectionCatalog` + `FormSection` (AdaptiveFormLayout density)
- Hook: `useFormSections` with optional persist key

```json
{
  "globalSsot": "shared/ui/formSectionsSsot.ts",
  "hrCatalog": "shared/hr/employeeFormSections.ts",
  "react": "components/ui/FormSection.tsx + hooks/useFormSections.ts",
  "sectionCount": 7,
  "openByDefault": [
    "employment",
    "contract"
  ]
}
```
