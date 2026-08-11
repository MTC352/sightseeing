# Footer Menu — live seed

The footer menu renders from the code default (`lib/footer-menu-default.ts`) until the
`integrations.footer_menu` row is populated (by an admin saving the Footer Menu editor,
or by the migration below).

## Recommended: run the data migration

A registered data migration seeds the row for you:

- **Admin → DB Migrations → `015-footer-menu` ("Footer menu (admin-managed)")** → Run.
- **If the row does not exist** it is created with the default menu.
- **If the row already exists** it is kept (admin edits preserved) on a normal run;
  re-run **with the Overwrite option** to reset the menu back to the current code
  default (e.g. after `lib/footer-menu-default.ts` changes).

The migration is DATA-only (INSERT/UPDATE on the existing `integrations` table, no DDL)
and idempotent.

## Alternative: manual SQL

If you prefer to pre-populate the row directly in the live DB, run this once. Replace the
JSON with the current default from `lib/footer-menu-default.ts` if it has changed.

```sql
INSERT INTO integrations (key, label, value, meta)
VALUES ('footer_menu', 'Footer Menu', '', '<PASTE FOOTER_MENU_DEFAULT AS JSON>'::jsonb)
ON CONFLICT (key) DO UPDATE SET meta = EXCLUDED.meta, updated_at = NOW();
```

To revert to the code default, simply delete the row:

```sql
DELETE FROM integrations WHERE key = 'footer_menu';
```
