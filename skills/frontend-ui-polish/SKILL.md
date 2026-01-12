---
name: frontend-ui-polish
description: Create or upgrade frontend UI pages to feel polished, comfortable, and visually intentional. Use when asked to design, beautify, restyle, or improve the look-and-feel of web pages, landing pages, dashboards, or component libraries, including tasks like typography selection, color systems, layout, spacing, and motion.
---

# Frontend UI Polish

## Overview

Design and implement a cohesive visual direction for frontend pages, then execute it with clear typography, color systems, spacing, layout, and motion that feel intentional and comfortable.

## Workflow

1. Confirm scope and constraints: page type, content density, brand cues, target device(s), and any framework limits.
2. Pick one visual direction and commit to it. Use `references/style-recipes.md` if you need a quick, coherent theme.
3. Define a small design system: type scale, color tokens, spacing scale, radii, and shadow/blur rules.
4. Compose the layout: set a grid, clear hierarchy, whitespace rhythm, and at least one signature element.
5. Add controlled motion: page-load reveal, staggered sections, and one micro-interaction if it adds clarity.
6. Validate: responsive behavior, contrast, readability, and visual consistency.

## Implementation Guidelines

- Typography: choose expressive font pairings; avoid default system stacks when possible; set `line-height`, `letter-spacing`, and a tight type scale.
- Color: define 1 primary, 1 accent, 3 neutrals, and 1 semantic color; use CSS variables.
- Layout: use a grid with purposeful asymmetry or a strong axis; keep consistent margins and section spacing.
- Background: avoid flat fills; prefer gradients, soft noise, or large shapes to add depth.
- Components: unify radii, borders, and shadow style; avoid mixing styles across components.
- Motion: prefer meaningful transitions (enter, reveal, focus) over constant animation.

## Quality Bar

- One clear visual story (do not mix multiple style directions).
- Readable and comfortable on mobile and desktop.
- Consistent spacing and hierarchy across sections.
- The page feels designed, not merely formatted.

## Resources

### references/

- `references/style-recipes.md`: Visual directions, palettes, typography pairings, layout motifs, and CSS token examples.
