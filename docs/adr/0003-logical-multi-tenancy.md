# Logical multi-tenancy via tenant_id on every record

The system uses logical multi-tenancy: one codebase with every data record scoped to a `tenant_id`. Each tenant (organization) has isolated data — their own HCPs, assessments, users, criteria sets, specialties, and configuration. Other tenants' data is invisible. SAs manage users only within their own tenant.

**Considered Options:**
- Single-tenant per deployment (one customer = one instance; simpler but prevents shared infrastructure)
- Logical multi-tenancy with `tenant_id` on every record (chosen — one codebase, one deployment, data isolation via scoping)
- Physical separation per tenant (separate databases or instances; maximum isolation but highest operational cost)

**Consequences:** Every database query must scope by `tenant_id`. Migrations add the column to every table. The SA role is per-tenant rather than global. Authentication must resolve the tenant context (from SSO claims in enterprise mode, from user profile in standalone mode). This adds a small but constant overhead to every operation.
