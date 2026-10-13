---
name: Managed PostgreSQL environments
description: Replit-managed database connection and schema rules for Student Housing Finder.
---

For this project, let Replit provide `DATABASE_URL` per environment. A shared custom `DATABASE_URL` can send published code to the development database; do not set a shared override.

**Why:** production settings requests resolved the development-only host `helium`, and Replit confirmed no production database had been provisioned.

**How to apply:** check runtime-managed status without displaying the connection value, verify schema in development, and use Publish to create and update production database schema. Never run table-creation or alteration SQL from request/startup code or directly against production.
