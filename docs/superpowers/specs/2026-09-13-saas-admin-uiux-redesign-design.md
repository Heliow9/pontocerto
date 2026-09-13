# SaaS Admin UI/UX Redesign Design

## Objective
Modernize the entire SaaS Admin visual layer without changing business rules, API contracts, routes, roles, or existing operational behavior.

## Approved scope
Apply one consistent product-grade SaaS shell to Dashboard, Clients/Companies, Plans, Subscriptions & Resources, Proposals, Contracts, SaaS Audit, SaaS Settings, Email Settings, and Password.

## Visual architecture
- Replace the horizontal SaaS navigation with a desktop sidebar and responsive mobile navigation.
- Introduce shared visual primitives through CSS/classes rather than a new UI dependency.
- Use consistent page headers, summary cards, filters, data panels, badges, action groups, empty states, forms, and modals.
- Preserve current routes and hash navigation (`#saas/...`).
- Reuse the existing logo and React components.

## Interaction principles
- Primary action is visually dominant and located in the page header.
- Secondary/destructive actions are visually differentiated.
- Filters live inside dedicated filter panels.
- Statuses use semantic badges.
- Dense tables remain horizontally scrollable on small screens.
- Modals use structured sections and clearer action grouping.
- Loading, error, empty and saved states remain accessible and readable.

## Responsive behavior
- >= 1024px: fixed sidebar + content workspace.
- 720–1023px: narrower sidebar / compressed content.
- < 720px: compact top bar, horizontally scrollable nav drawer-style region, single-column forms/cards.

## Non-goals
- No backend changes.
- No database migrations.
- No feature or entitlement changes.
- No new npm dependencies.
