# Database Migrations Workflow (CF-WC-104)

This directory contains database migrations for the Content Factory system.

## Migration System

We use **Prisma Migrate** for database schema management.

### Creating a New Migration

```bash
# Create a new migration
pnpm run db:migrate:create --name=add_content_table

# Apply migrations
pnpm run db:migrate

# Reset database (CAUTION: destroys all data)
pnpm run db:migrate:reset
```

### Migration Files

Migrations are stored in `prisma/migrations/` and include:
- SQL files with schema changes
- Migration metadata

### Best Practices

1. **Never modify existing migrations** - Always create new ones
2. **Test migrations locally** before deploying
3. **Include rollback strategy** in complex migrations
4. **Use transactions** for multi-step migrations
5. **Document breaking changes** in migration comments

### Migration Checklist

Before deploying a migration:
- [ ] Test on local database
- [ ] Test on staging environment
- [ ] Backup production database
- [ ] Review for data loss scenarios
- [ ] Prepare rollback plan
- [ ] Document in changelog

### Common Commands

```bash
# Check migration status
pnpm run db:migrate:status

# Generate Prisma Client
pnpm run db:generate

# View current schema
pnpm run db:studio

# Seed database
pnpm run db:seed
```

### Environment-Specific Migrations

**Development**: Auto-apply migrations
```bash
DATABASE_URL=postgresql://localhost/cf_dev pnpm run db:migrate
```

**Staging**: Review before applying
```bash
DATABASE_URL=$STAGING_DB_URL pnpm run db:migrate
```

**Production**: Manual review + approval required
```bash
# Dry run first
DATABASE_URL=$PROD_DB_URL pnpm run db:migrate --create-only

# Review generated SQL, then apply
DATABASE_URL=$PROD_DB_URL pnpm run db:migrate
```

### CI/CD Integration

Migrations are automatically:
1. Validated in CI on PR
2. Applied to staging on merge to `develop`
3. Applied to production on merge to `master` (with approval)

See `.github/workflows/content-factory-ci.yml` for details.
