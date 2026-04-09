/**
 * Kajabi Theme Reference Library
 * 
 * Comprehensive reference for all valid section settings, block types,
 * block settings, HTML structure, and global settings from the
 * Pro Encore theme's section.liquid schema.
 * 
 * Used by AI edge functions (ai-generate, ai-tweak, ai-transform)
 * to ensure generated JSON uses only valid Kajabi values.
 */

// ── SECTION SETTINGS (from section.liquid {% schema %}) ──────────────────

export const SECTION_SETTINGS_REFERENCE = `## SECTION SETTINGS (from section.liquid schema — these are the ONLY valid settings)

### Background
  bg_type: "none" | "image" | "video" (default: "none")
  bg_video: video URL
  bg_image: image URL
  bg_position: "top" | "center" | "bottom" (default: "center")
  background_fixed: true | false (default: "false")
  background_color: color string e.g. "#1A2C47" or "RGBA(22,30,42,0.86)"

### Desktop Layout
  hide_on_desktop: true | false (default: "false")
  padding_desktop: { top, right, bottom, left } in px (defaults: 100, 40, 100, 40)
  vertical: "start" | "center" | "end" (default: "center")
  horizontal: "left" | "center" | "right" | "between" | "around" (default: "center")
  equal_height: true | false (default: "false")
  full_width: true | false (default: false) — NEVER set to true
  full_height: true | false (default: false)

### Mobile Layout
  hide_on_mobile: true | false (default: "false")
  padding_mobile: { top, right, bottom, left } in px (defaults: 40, 10, 40, 10)

### Columns
  multiple_columns_on_desktop: "no" | "two" | "three" (default: "no")
  column_one_width: grid 1-12 (default: "4")
  column_two_width: grid 1-12 (default: "4")
  column_three_width: grid 1-12 (default: "4")
  multiple_column_gap: range 0-150 in px (default: "0")
  slider_column: "first" | "second" | "third" (default: "first")

### CSS Class
  custom_css_class: text string

### Time Reveal (advanced — rarely used)
  reveal_event: event ID
  reveal_offset: number string
  reveal_units: "seconds" | "minutes" | "hours" | "days" (default: "seconds")

### Pro Slider (advanced — DO NOT use unless explicitly asked)
  enable_slider: true | false (default: "false")
  blocks_per_slide: 1-12 (default: 3)
  slider_preset: "default" | "modern" (default: "modern")
  show_arrows: true | false (default: true)
  arrow_color: color (default: "#333333")
  show_dots: true | false (default: true)
  dot_color: color
  transition_effect: "slide" | "coverflow" (default: "slide")
  transition_speed: 100-3000ms (default: 500)
  autoplay: true | false (default: false)
  autoplay_delay: 500-10000ms (default: 3000)
  loop: true | false (default: false)

### Use as Tab (advanced — rarely used)
  use_as_tab: true | false (default: "false")
  default_tab: true | false (default: "false")
  tab_slug: text
  tab_fade_effect: true | false (default: "true")`;


// ── BLOCK TYPES & SETTINGS ───────────────────────────────────────────────

export const BLOCK_TYPES_REFERENCE = `## ALL VALID BLOCK TYPES
text, cta, image, feature, feature_icon, card, accordion, video, video_embed,
form, countdown, pricing, image_icon, code, code_tabs, audio, blog, event,
event_video, offer, multi_video, external_widget, link_list, social_icons,
search_filter, search_form, assessment, coaching_scheduling_widget, course_outline

## BLOCK SETTINGS BY TYPE

### Text (type: "text")
  width: grid 1-12 (default: "8")
  text: rich HTML (e.g. "<h1>Heading</h1><p>Body</p>")
  text_align: "left" | "center" | "right"
  mobile_text_align: "left" | "center" | "right"
  Custom typography per block:
    select_custom_heading_font: "inherit" | "primary" | "accent"
    select_custom_body_font: "inherit" | "primary" | "accent"
    custom_heading_color: color
    custom_body_color: color
    heading_font_weight / body_font_weight: "inherit"|"100"-"800"
    heading_font_size_desktop / body_font_size_desktop: "inherit"|"8px"-"145px"
    heading_font_size_mobile / body_font_size_mobile: "inherit"|"8px"-"145px"
    heading_line_height / body_line_height: "inherit"|".5"-"2.0"
    heading_letter_spacing / body_letter_spacing: "inherit"|"-2px"-"2px"
  Block has optional inline button:
    use_btn: true | false (default: false)
    btn_text, btn_action, btn_style, btn_size, btn_background_color, btn_text_color, btn_border_radius

### Call to Action (type: "cta")
  width: grid 1-12 (default: "4")
  btn_text: text (default: "Call To Action")
  btn_action: URL
  new_tab: true | false
  btn_background_color: color
  btn_text_color: color
  btn_width: "full" | "auto"
  btn_style: "solid" | "outline" | "text"
  btn_type: "dark" | "light" (default: "dark")
  btn_size: "small" | "medium" | "large"
  btn_border_radius: text (e.g. "8px")
  Advanced button customization:
    btn_override_shadow: "inherit" | "on" | "off"
    btn_inverse_on_hover: "inherit" | "normal" | "inverse"
    btn_uppercase: "inherit" | "on" | "off"
    select_custom_btn_font: "inherit" | "primary" | "accent"
    btn_font_weight: "inherit"|"100"-"800"
    custom_button_font_size_desktop / mobile: "inherit"|"8px"-"145px"
    button_border_thickness: "inherit"|"0px"-"10px"
    button_vertical_padding / button_horizontal_padding: "inherit"|"0px"-"50px"
    custom_button_top_margin / custom_button_bottom_margin: "inherit"|"-25px"-"60px"
  CTA Popup (optional):
    cta_popup_edit: true | false
    cta_popup_text: rich_text
    cta_popup_text_align: "left" | "center" | "right"
    cta_popup_text_color / cta_popup_background_color: color

### Image (type: "image")
  width: grid 1-12 (default: "12")
  image: URL
  img_action: URL
  new_tab: true | false
  img_alt: alt text
  image_border_radius: range 0-50 (default: 0)
  box_shadow: "none" | "small" | "medium" | "large"

### Feature (type: "feature")
  width: grid 1-12 (default: "4")
  text: rich HTML (title + description)
  image: URL
  image_position: "left" | "right" | "top" | "bottom" (default: "left")
  image_width: range 1-11 (default: 5)
  hide_image: true | false (default: false)
  text_align / mobile_text_align
  use_btn: true | false, btn_text, btn_action, btn_style, etc.

### Feature Icon (type: "feature_icon")
  width: grid 1-12 (default: "4")
  text: rich HTML (title + description)
  feature_icon_code: SVG HTML string
  feature_icon_size: range 10-200 (default: 48)
  feature_icon_color: color
  icon_position: "left" | "right" | "top" | "bottom" (default: "top")
  text_align / mobile_text_align
  use_btn: true | false, btn_text, btn_action, btn_style, etc.

### Card (type: "card")
  width: grid 1-12 (default: "4")
  action: URL (whole card link)
  new_tab: true | false
  image: URL
  description: rich HTML (default includes h4 + p)
  show_cta: true | false (default: true)
  btn_text, btn_background_color, btn_text_color, btn_style, btn_size, btn_border_radius
  card_border_radius: range 0-50
  card_border_color: color
  box_shadow: "none" | "small" | "medium" | "large"

### Accordion (type: "accordion")
  width: grid 1-12 (default: "8")
  heading: text
  body: rich HTML

### Video (type: "video")
  width: grid 1-12 (default: "10")
  video: video URL
  autoplay / loop / muted: true | false

### Video Embed (type: "video_embed")
  width: grid 1-12 (default: "10")
  code: embed HTML code
  aspect_ratio: "16:9" | "4:3" | "1:1"

### Image Icon (type: "image_icon")
  width: grid 1-12 (default: "12")
  image: URL
  image_width: range 10-1000 (default: 100)
  img_action: URL
  img_alt: text

### Custom Code (type: "code")
  width: grid 1-12 (default: "6")
  code: raw HTML/JS

### Pricing Card (type: "pricing")
  width: grid 1-12 (default: "4")
  title: text (default: "Basic")
  price: text (default: "$9")
  interval: text (default: "/month")
  description: rich HTML
  show_cta: true | false
  btn_text, btn_action, btn_style, btn_size, btn_background_color, btn_text_color
  pricing_border_radius: range 0-50
  pricing_border_color: color

### Form (type: "form")
  width: grid 1-12 (default: "8")
  form: form ID
  show_name_field: true | false (default: true)
  btn_text: text (default: "Submit")
  btn_style, btn_size, btn_background_color, btn_text_color

### Countdown (type: "countdown")
  width: grid 1-12 (default: "10")
  event: event ID
  style: "" | "boxed"
  enable_end_action: true | false
  end_action: URL
  remove_section_on_complete: true | false`;


// ── SHARED BLOCK SETTINGS (apply to ALL block types via block_styles.liquid) ──

export const SHARED_BLOCK_SETTINGS = `## SHARED BLOCK SETTINGS (all block types)
These settings are available on EVERY block type:

### Layout
  width: grid 1-12 (how many columns the block spans in the row)
  block_column: "first" | "second" | "third"
    (which column to place the block in — requires section multiple_columns_on_desktop != "no")
  flush: true | false (removes block padding)

### Block Styling
  background_color: color
  border_style: "none" | "solid" | "dashed" | "dotted" (MUST default to "none")
  border_color: color (default: "#000000")
  border_width: range 0-10 (default: 4)
  border_radius: text (e.g. "8px")
  box_shadow: "none" | "small" | "medium" | "large" (MUST default to "none")
  block_padding: padding value

### Typography Alignment
  text_align: "left" | "center" | "right"
  mobile_text_align: "left" | "center" | "right"

### Visibility
  hide_block_on_desktop: true | false (default: "false")
  hide_block_on_mobile: true | false (default: "false")

### Animation
  block_reveal: "none" | "fade-in" | "slide-up" | "slide-down" | "slide-left" | "slide-right"
  block_reveal_delay: range 0-2000ms`;


// ── HTML STRUCTURE ───────────────────────────────────────────────────────

export const KAJABI_HTML_STRUCTURE = `## KAJABI HTML STRUCTURE
All sections render via section.liquid with this structure:

### Section wrapper
\`\`\`html
<div id="section-{sectionId}" data-section-id="{sectionId}">
  <style>/* per-section CSS */</style>
  <section class="section {bg_class}" id="section-{sectionId}">
    <div class="sizer">
      <div class="section__overlay" style="background-color: {background_color}"></div>
      <div class="container">
        <div class="row">
          <!-- blocks go here -->
        </div>
      </div>
    </div>
  </section>
</div>
\`\`\`

### Block wrapper
\`\`\`html
<div id="block-{blockId}" class="block-type--{type} text-{text_align} col-{width}">
  <div class="block">
    <!-- block content (type-specific snippet) -->
  </div>
</div>
\`\`\`

### Key CSS selectors
- Section: \`#section-{id} > section.section\`
- Background overlay: \`#section-{id} .section__overlay\`
- Padding container: \`#section-{id} .sizer\`
- Content container: \`#section-{id} .container > .row\`
- Block: \`#block-{blockId}.block-type--{type}\`
- Block content: \`#block-{blockId} .block\`
- Text content: \`#block-{blockId} .block h1, h2, h3, p\`
- Buttons: \`.btn.btn--{size}.btn--{style}\`
- Features: \`.feature > .feature__image + .feature__text\`
- Feature icons: \`.feature > .feature-icon + .feature__text\`

### NEVER use made-up CSS classes
- NO: .hero__heading, .text-column__heading, .feature-block
- YES: .section, .sizer, .container, .row, .block, .btn, .feature

### NEVER use made-up section IDs
- NO: "hero", "about_section", "cta_section"
- YES: 13-digit numeric IDs like "1596053476562"`;


// ── KAJABI ID FORMAT ─────────────────────────────────────────────────────

export const KAJABI_ID_RULES = `## KAJABI ID FORMAT
- Section IDs MUST be 13-digit numeric strings (timestamp format)
  Example: "1596053476562"
  NEVER use words like "hero_section" or "about"
- Block IDs MUST follow the pattern "{sectionId}_{index}"
  Example: "1596053476562_0", "1596053476562_1"
- These are enforced by post-processing — word IDs will be auto-converted`;


// ── LAYOUT RULES ─────────────────────────────────────────────────────────

export const LAYOUT_RULES = `## LAYOUT & STRUCTURAL RULES

### Full Width
- NEVER set full_width to true. Always false.
- Only exception: a section whose sole purpose is a full-bleed background image with no text.

### Block Column Assignment (CRITICAL)
- ALWAYS default block_column to "first" (or omit it entirely — "first" is default)
- A block assigned to "second" or "third" in a single-column section will DISAPPEAR
- Only use "second"/"third" when the section has multiple_columns_on_desktop = "two" or "three"
- Even in multi-column sections, most blocks should stay in "first" — only move a block
  to another column when you specifically need side-by-side layout

### Multiple Columns
- Valid values: "no" | "two" | "three" (NOT "yes")
- The default section is single-column (multiple_columns_on_desktop = "no")
- If ANY block uses block_column "second" or "third", the section MUST have
  multiple_columns_on_desktop = "two" (or "three" for 3 columns).
  Without this, those blocks will be invisible.
- For two-column content/image splits:
    section: multiple_columns_on_desktop = "two", column_one_width = "4", column_two_width = "4"
    text/CTA blocks: width "12", block_column "first", text_align "left"
    image block: width "12", block_column "second"

### Custom CSS Targeting
- Each section has a custom_css_class setting — set it to a class name WITHOUT the leading dot
  Example: custom_css_class: "my-hero"
- Then use addCssOverride with ".my-hero h1 { font-size: 3rem; }" to target only that section
- This is the preferred way to apply section-specific CSS without relying on section IDs

### Section Structure
- Related content belongs in the SAME section (heading + cards below = one section, not two)
- Pattern: heading block width "12" + card blocks width "4" each in the same section
- For card rows, use width directly (e.g. three cards = "4" each) — no need for multiple_columns_on_desktop

### Background Colors
- Do NOT set background_color unless deliberately creating a dark/colored section
- Transparent or unnecessary bg colors cause text visibility issues
- If you want a white/light section, leave background_color OUT completely
- Never use faint/low-opacity RGBA backgrounds

### Text Contrast
- Body text on light sections must be dark and readable
- Never use very light or washed-out paragraph text on light backgrounds

### Block Defaults (CRITICAL for valid HTML)
- border_style MUST be "none" if not intentionally styled — otherwise renders broken CSS
- box_shadow MUST be "none" if not set — otherwise renders invalid class
- Do NOT set background_color to empty string on blocks — omit the key entirely
- Do NOT set explicit zero padding overrides — omit padding keys to use defaults`;


// ── GLOBAL SETTINGS ──────────────────────────────────────────────────────

export const GLOBAL_SETTINGS_REFERENCE = `## GLOBAL SETTINGS (settings_schema.json — theme-wide settings)

### Key Global Settings
  primary_font: font name (heading font)
  secondary_font: font name (body font)  
  heading_color: hex color
  body_color: hex color
  accent_color: hex color
  color_primary: hex color (primary brand color)
  background_color: hex color (page background)
  
### Global Button Settings
  btn_background_color: hex color
  btn_text_color: hex color
  btn_border_radius: text (e.g. "8px")
  btn_style: "solid" | "outline" | "text"
  btn_size: "small" | "medium" | "large"
  
### Navigation
  Link lists are stored in settings_data.current.link_lists
  Format: { "main-menu": { links: [{ name: "Home", url: "/" }, ...] } }`;


// ── OPERATION TYPES (for AI patch/generation output) ─────────────────────

export const OPERATION_TYPES = `## OPERATION TYPES

### updateGlobalSetting
{ type: "updateGlobalSetting", key: "primary_font", value: "Playfair Display", label: "Set heading font" }

### updateSectionSetting  
{ type: "updateSectionSetting", sectionId: "1596053476562", key: "background_color", value: "#1A2C47", label: "Dark hero bg" }

### updateBlockSetting
{ type: "updateBlockSetting", sectionId: "1596053476562", blockId: "1596053476562_0", key: "text_align", value: "left", label: "Left align text" }

### replaceText
{ type: "replaceText", sectionId: "1596053476562", blockId: "1596053476562_0", key: "text", value: "<h1>New Heading</h1><p>New body</p>", label: "Update hero text" }

### hideSection / showSection
{ type: "hideSection", sectionId: "1575400116835" }
{ type: "showSection", sectionId: "1575400116835" }

### addCssOverride
{ type: "addCssOverride", css: "#section-1596053476562 h1 { color: #fff; }", label: "Hero text white" }

### updateNavigation
{ type: "updateNavigation", menuId: "main-menu", links: [{ name: "Home", url: "/" }] }

### addSection
{ type: "addSection", sectionId: "1596053476562", section: { type: "section", settings: {...}, blocks: {...}, block_order: [...] }, label: "Hero section" }`;


// ── COMBINED PROMPT REFERENCE ────────────────────────────────────────────

/**
 * Returns the full Kajabi reference for use in AI system prompts.
 * Pass `compact: true` to get a shorter version for token-limited contexts.
 */
export function getKajabiReference(options?: { compact?: boolean }): string {
  if (options?.compact) {
    return [
      SECTION_SETTINGS_REFERENCE,
      SHARED_BLOCK_SETTINGS,
      KAJABI_HTML_STRUCTURE,
      KAJABI_ID_RULES,
      LAYOUT_RULES,
    ].join('\n\n');
  }
  
  return [
    SECTION_SETTINGS_REFERENCE,
    BLOCK_TYPES_REFERENCE,
    SHARED_BLOCK_SETTINGS,
    KAJABI_HTML_STRUCTURE,
    KAJABI_ID_RULES,
    LAYOUT_RULES,
    GLOBAL_SETTINGS_REFERENCE,
    OPERATION_TYPES,
  ].join('\n\n');
}
