# Style Recipes

Use one recipe per page. Do not mix directions unless the user explicitly requests it.

## Recipe A: Warm Minimalism

- Mood: calm, approachable, soft contrast.
- Palette: `#F6F2EA` `#E7DED0` `#C9B9A7` `#7B5E4B` `#2E1F17`
- Typography: "Fraunces" (display) + "Work Sans" (body)
- Layout: centered column, generous padding, large section gaps.
- Signature: oversized serif headline + thin rule divider.
- Background: subtle paper-like gradient.

## Recipe B: Editorial Contrast

- Mood: confident, premium, high-contrast.
- Palette: `#F7F7F2` `#111111` `#E04F2F` `#C9C9C9` `#4A4A4A`
- Typography: "DM Serif Display" (display) + "IBM Plex Sans" (body)
- Layout: strong vertical axis with asymmetric blocks.
- Signature: large headline with compact subhead.
- Background: off-white with a single bold color block.

## Recipe C: Soft Tech

- Mood: modern, friendly, slightly futuristic.
- Palette: `#0F172A` `#1E293B` `#38BDF8` `#A7F3D0` `#F8FAFC`
- Typography: "Space Grotesk" (display) + "Inter Tight" (body)
- Layout: modular cards, clear grid, mid spacing.
- Signature: gradient chips and glowing dividers.
- Background: deep navy gradient with blurred circles.

## Recipe D: Neo Brutalist

- Mood: bold, playful, raw geometry.
- Palette: `#FFF5E1` `#111111` `#FF6B35` `#2EC4B6` `#FFE066`
- Typography: "Archivo Black" (display) + "Space Mono" (body)
- Layout: thick borders, hard shadows, angled callouts.
- Signature: offset cards with high-contrast outlines.
- Background: flat color with a dotted pattern.

## Recipe E: Quiet Luxury

- Mood: refined, understated, tactile.
- Palette: `#F2EEE9` `#3A2F2A` `#B58E6B` `#D8CFC4` `#8A7E74`
- Typography: "Cormorant Garamond" (display) + "Source Sans 3" (body)
- Layout: wide margins, restrained grid, slim separators.
- Signature: small caps labels + soft shadow.
- Background: warm gradient with subtle noise.

## CSS Token Starter

```css
:root {
  --bg: #f7f7f2;
  --surface: #ffffff;
  --text: #111111;
  --muted: #6b6b6b;
  --primary: #e04f2f;
  --accent: #2ec4b6;
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 28px;
  --space-1: 6px;
  --space-2: 12px;
  --space-3: 18px;
  --space-4: 28px;
  --space-5: 42px;
  --shadow-soft: 0 10px 30px rgba(0, 0, 0, 0.08);
}
```

## Layout Motifs

- Split hero: copy left, visual right, with a strong vertical line.
- Full-bleed band: one section spans full width with contrast color.
- Card stack: overlapping cards with a single diagonal offset.
- Typographic block: oversized headline with a narrow, aligned body column.

## Motion Patterns

- Page-load: fade + translate up 12px, stagger by 90-120ms.
- Section reveal: clip-path or scale from 98% to 100%.
- Focus states: border color shift + soft shadow increase.
