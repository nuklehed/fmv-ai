---
name: design-principles
description: >
  Expert UI/UX rules for Vue 3, Tailwind CSS, and PrimeIcons. Enforces strict
  typography (Tailwind defaults only), 3-role color palette, default spacing scale,
  whitespace-first layout, and a pre-generation checklist. Use when generating or
  reviewing frontend UI code, templates, styles, or design decisions — especially on
  Vue component layouts, CSS classes, icon usage, or visual consistency audits.
---

# Design Principles

## Typography

Use **ONLY** Tailwind's default type utilities: `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`, `text-3xl`.
Line-height: `leading-tight`, `leading-snug`, `leading-normal`, `leading-relaxed`.

❌ Never use arbitrary sizes (e.g. `text-[15px]`) or inline styles.

## Color

Limit the palette to **3 roles**: primary (CTAs/active), secondary (muted text/icons), neutral (bg/borders/text).
Add semantic colors **ONLY** when required: success (green), error (red), warning (amber/yellow).

- Use Tailwind's built-in palette (`slate-900` for dark text, `slate-100` for backgrounds).
- Never hardcode hex values.
- PrimeIcons use standard text color classes (e.g., `text-slate-500`, `text-primary-600`).
- Enforce visual hierarchy through **font weight and size**, not color saturation.

## Layout & Spacing

Use Tailwind's default spacing scale exclusively (4px increments): `p-2`, `m-3`, `gap-4`, `py-6`, etc.
Prioritize **whitespace over borders/shadows**. If a section feels dense, increase padding/gap before adding visual weight.
Wrap elements in consistent structural containers (`flex`, `grid`, `flex-col`, `items-center`) with explicit gaps.

## Output Requirement — Checklist

Before generating any code, output a brief checklist verifying:

- [ ] No arbitrary typography or spacing values used
- [ ] Colors are functional and rely on the Tailwind default palette
- [ ] Spacing relies on the default Tailwind scale

After the checklist, output clean Vue 3 template. Ensure PrimeIcons use standard structure:
```html
<i class="pi pi-search text-slate-500 text-lg"></i>
```
No inline styles or arbitrary CSS values unless explicitly justified in a comment.
