

# Plan: Dynamic Transformation Rules for Source-Faithful Output

## What the user reported (Original vs Export)

Comparing the Lovable source site to the Kajabi export, these issues were identified — all to be fixed via **dynamic rules**, not static patches:

1. **Hero**: Needs more vertical padding, overlay too heavy (should be gradient or lighter), word "Underwater" needs distinct font/style via inline CSS
2. **Stats**: Numbers (2,400+, 27, 12, 98%) not rendered in green/accent color; missing horizontal border lines above/below the stats row
3. **Programs "Our Programs" eyebrow**: Present in HTML but not rendering (likely the section type is wrong or the eyebrow is being lost); also the description text is too wide — should be ~6-9 columns
4. **Program cards**: White background in export but should be dark cards (matching testimonial card bg)
5. **Testimonials eyebrow**: "Testimonials" text should be styled in accent color with distinct font
6. **CTA band**: Too wide (12 cols → should be ~6-9), button is wrong color, background too light (should be darker, matching testimonial card bg)
7. **4th stat missing**: "98% Would Dive Again" not present (only 3 stats rendered, should be 4)

## Root Causes

- **`transformation-planner.ts`**: Hero padding is 120/120 but needs more. Overlay is `RGBA(11,18,20,0.65)` — too opaque. Stats hard-coded to 3 items (missing 4th). Programs section mapped to a Text & Image section with hidden image block — eyebrow gets lost in collapsed layout. Course cards not rendered as separate feature blocks with dark card shells.
- **`streamlined-home.ts` recipes**: Program card recipe defaults `background_color` to `#FFFFFF`. Testimonial recipe defaults `background_color` to `#FFFFFF`. CTA band recipe defaults panel `background_color` to `#FFFFFF` and `width` to `8` (still too wide, but main issue is the white color).
- **CSS overrides**: `.stat-number` class exists with green color, but stats HTML uses class names that may not survive Kajabi's rendering. No gradient overlay CSS for hero. No border rules for stats section.

## Changes

### 1. `src/lib/transformation-planner.ts`

**Hero improvements:**
- Increase padding to `{ top: '160', bottom: '160' }` desktop, `{ top: '100', bottom: '100' }` mobile
- Change overlay from solid RGBA to gradient: use CSS gradient overlay via `addCssOverride` instead of flat color
- In `buildHeroHtml()`: wrap the word matching `emphasisWord` (or detect "Underwater" from heading) in `<span>` with italic serif font style

**Stats section:**
- Add 4th stat (98% / Would Dive Again) — dynamically pull from `extracted.sections` stats data rather than hardcoding 3
- Wrap stat numbers in `<span style="color:${primaryHex}; font-size:48px; font-weight:700">` inline CSS (not just class-based, since Kajabi strips classes)
- Add section-level CSS borders: top and bottom `border: 1px solid rgba(255,255,255,0.08)` via section settings or CSS override

**Programs section:**
- Render programs as a proper section with a heading block (eyebrow + h2 + description) on its own row at narrower width (~8 columns), plus 3 feature blocks (width 4 each) for the cards
- Instead of collapsing into a Text & Image section, create via `addSection` with proper feature blocks

### 2. `src/lib/theme-recipes/streamlined-home.ts`

**Dark-site-aware card shell defaults:**
- Add a `isDarkSite` parameter (derived from body background luminance)
- When `isDarkSite` is true:
  - Program card `background_color` defaults to `#111a1e` (or a slightly lighter shade of the page bg) instead of `#FFFFFF`
  - Testimonial card `background_color` defaults to `#111a1e` instead of `#FFFFFF`
  - CTA band panel `background_color` defaults to `#111a1e` instead of `#FFFFFF`
  - `box_shadow` defaults to `none` instead of `medium` on dark sites

**CTA band width:**
- Change default CTA text block width from `'8'` to `'7'` or `'6'` for tighter, more centered look

**Eyebrow styling:**
- In any heading HTML that contains a `section-eyebrow` class, also add inline styles: `style="color:${accentColor}; font-size:12px; letter-spacing:0.25em; text-transform:uppercase"` so it survives even without CSS class support

### 3. `src/lib/transformation-planner.ts` — CSS overrides section

**Hero gradient overlay:**
```css
.section:first-of-type .section__overlay,
.section--hero .section__overlay {
  background: linear-gradient(180deg, rgba(0,0,0,0.3) 0%, rgba(11,18,20,0.7) 100%) !important;
}
```

**Stats borders:**
```css
/* Stats section borders */
.section:nth-of-type(2) { 
  border-top: 1px solid rgba(255,255,255,0.08) !important; 
  border-bottom: 1px solid rgba(255,255,255,0.08) !important; 
}
```

**CTA button color enforcement:**
- Ensure `.cta-card .btn` inherits the primary/accent color, not white

### 4. Dynamic detection rules (in `transformation-planner.ts`)

Rather than hardcoding values, build rules that detect:
- **`isDarkSite`**: If body bg luminance < 30%, use dark card shells everywhere
- **Stat count**: Pull actual count from `extracted.sections.filter(s => s.intent === 'stats')` items
- **Eyebrow text**: If a section has an eyebrow field, always render with inline accent color style
- **Hero emphasis word**: If `extracted.hero.emphasisWord` exists, wrap that word in styled `<span>`
- **CTA button color**: Always inherit from `extracted.buttonStyle.backgroundColor`

### 5. Stats rendering fix

- Change from hardcoded 3 stats to dynamic: read `section.items` from the stats/metrics extracted section
- Each stat rendered with inline styles for the number color (not relying on CSS classes alone)

### 6. Programs as feature blocks

- Instead of mapping programs to a Text & Image section (which hides the image side and collapses everything), create a new `addSection` with:
  - 1 text block (width 8, centered) for eyebrow + heading + description
  - 3 feature blocks (width 4 each) with dark card shell, images, and content

## Files modified
- `src/lib/transformation-planner.ts` — Hero, stats, programs, CTA dynamic rules
- `src/lib/theme-recipes/streamlined-home.ts` — Dark-site-aware card shell defaults

## Not changed
- No docs, preview, marketing copy, or new archetypes
- No export validation redesign
- No new generic recipes

