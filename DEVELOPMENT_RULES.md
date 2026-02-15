## 🧠 Copilot Development Rule: Product Schema Consistency

When you add or modify any Product field (e.g., expiryDate, barcode, unitOfMeasure, reorderLevel, trackExpiry):

1) UI Coverage
- Include the field across all Product-related components: create/edit modals, list/grid views, details popups, and selectors used in GR/PO/stock adjustments.

2) Centralized Validation/Logic
- Implement validation and computed logic in shared Zod schemas/utilities in `shared/zod` (or a shared `useProductValidation()` hook). Import and reuse everywhere; do not duplicate per page.

3) Auto-Update Components
- If any Product component is missing the field, update it to include it with proper labels, help text, and accessibility.

4) No Page-Specific Expiry Checks
- Do not implement expiry validation solely in GR (or any single page). Move it to shared so rules apply uniformly across UIs.

5) Types/DTO Sync
- Update `shared/types` (Product, ProductDTO, etc.) and synchronize API DTOs with backend schemas and database fields.

6) End-to-End Completeness
- Ensure frontend schemas updated, backend validation and DB migration (in `shared/sql`) added as needed, and UI bound correctly in forms/tables/selectors.

Reminder: Product fields must propagate globally across all product views. Avoid hardcoded field subsets.

