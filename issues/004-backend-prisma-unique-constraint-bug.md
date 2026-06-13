# Issue #4 — Prisma `ApplicationSetting` unique constraint mismatch

## Problem
The code in `applicationSettings.ts` and `userSettings.ts` uses `key_tenantId` compound query:

```typescript
await prisma.applicationSetting.upsert({
  where: {
    key_tenantId: { key, tenantId: req.tenantId! }
  }, ...
})
```

But the Prisma schema has **no** `@@unique([key, tenantId])` constraint:

```prisma
model ApplicationSetting {
  key      String
  tenantId String
  // No @@unique([key, tenantId])
}
```

This means `key_tenantId` won't exist in the generated Prisma client, causing runtime failures when upserting settings.

## Files
- `apps/backend/prisma/schema.prisma` — missing `@@unique`
- `apps/backend/src/routes/applicationSettings.ts` — line ~55
- `apps/backend/src/routes/userSettings.ts` — line ~47

## Proposed Solution
Add the composite unique to the schema:

```prisma
model ApplicationSetting {
  // ... fields ...
  @@unique([key, tenantId])
}
```

Then run `npx prisma migrate dev` to create the migration.

## Acceptance Criteria
- Schema has `@@unique([key, tenantId])`
- Migration exists and has been applied
- `npx prisma generate` succeeds
- Upsert operations work at runtime
