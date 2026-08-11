# Footer Menu — optional live seed

The footer menu renders from the code default (`lib/footer-menu-default.ts`) until an
admin saves the Footer Menu editor (Admin → Header/Footer → Footer). No migration or
data fill is required.

If you want the `integrations.footer_menu` row pre-populated directly in the live DB
(e.g. before handing the editor to a non-technical admin), run this once. Replace the
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
