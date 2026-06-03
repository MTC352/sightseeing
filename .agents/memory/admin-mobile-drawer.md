---
name: Admin shell mobile drawer
description: How the admin sidebar behaves responsively and the collapse-state gotcha
---

The admin shell (`app/admin/layout.tsx`) sidebar is a responsive overlay drawer.

- Mobile (< `md`): `<aside>` is a fixed overlay (`-translate-x-full` default, `translate-x-0` when `mobileOpen`) with a dark backdrop. A `md:hidden` top bar holds the hamburger. Drawer closes on backdrop click, the in-drawer X, and on `pathname` change.
- Desktop (`md+`): static push column with a desktop-only Collapse toggle (`hidden md:flex`).

**Rule:** the persisted desktop `collapsed` state must NOT drive mobile drawer rendering. Use `effectiveCollapsed = isDesktop && collapsed` (isDesktop from `matchMedia("(min-width: 768px)")`) for every label/width/justify/submenu decision; keep the raw `collapsed` only on the desktop-only toggle button.

**Why:** if `collapsed` (true after collapsing on desktop) drives mobile render, resizing to mobile opens the drawer in icon-only mode with no mobile control to expand it — caught in architect review. **How to apply:** any new collapse-sensitive markup added to the admin sidebar must read `effectiveCollapsed`, not `collapsed`.
