## Summary

- What does this PR change?
- Why is it needed?

## Checklist

- [ ] Followed layered architecture: Controller → Service → Repository
- [ ] Used Zod schemas from `shared/zod/` (no duplicated validation)
- [ ] All SQL is parameterized (no string interpolation)
- [ ] No ORM usage (Prisma/Sequelize/TypeORM/etc.)
- [ ] API responses follow `{ success, data?, error? }`
- [ ] Error handling with try/catch
- [ ] No business logic in repositories
- [ ] No database access outside repositories
- [ ] No frontend logic in backend / no backend logic in frontend
- [ ] Product field changes propagated across all Product views (UI forms, lists, selectors) and synchronized in schemas/types/migrations

## Product Schema Consistency (required if Product fields changed)

If this PR adds/edits Product fields (e.g., expiryDate, barcode, unitOfMeasure, reorderLevel, trackExpiry):

- [ ] Updated shared Zod schema(s) in `shared/zod/product.ts`
- [ ] Added required DB migration(s) in `shared/sql/`
- [ ] Updated UI components (forms, lists, selectors) to include/bind the field
- [ ] Centralized validation/logic in shared utilities (no page-specific copies)
- [ ] Verified DTOs/types are in sync (`shared/types` and backend DTOs)

## Testing

- [ ] Unit/integration tests updated or added where applicable
- [ ] Manual verification steps included below

### Manual Verification

1. 
2. 
3. 
