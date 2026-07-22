# assets/ — logos, fonts, and image templates

Everything the system needs to make posts *look* like Servio lives in this folder.

## What goes where

### `logo/`
The Servio logo files. Already here:

- `servio-icon-512.png` — the square icon, used as the profile picture on
  platforms and as the small logo stamped on generated images.
- `servio-favicon.png` — the tiny browser-tab version, kept for reference.

Add new logo variants here if they're ever made (e.g. a wide/horizontal
version). PNG with a transparent background is preferred.

### `fonts/`
Empty for now — the font files get added in **Phase 1**, when image generation
is built. The two brand fonts are:

- **Fraunces** — the display font, used for headlines on images.
- **Inter** — the body font, used for smaller supporting text.

Both are free Google Fonts. They must live here as actual font files because the
image renderer runs on GitHub's servers with no internet fonts available — it can
only use what's in this folder.

### `templates/`
Empty for now — filled in **Phase 1**. Each file here is an SVG template: a
reusable design (think "fill-in-the-blanks poster") with placeholder slots for a
headline, supporting text, and the logo. The generator picks a template, fills
the slots with the post's text, and renders the result to a final image.

A calendar entry chooses its template by name: `image: template:tip-card` means
"use `templates/tip-card.svg`".

## Image template specs (for whoever designs a template)

- **Output:** 1080 × 1080 pixels (square), saved as **JPEG**. Square works on all
  four platforms, and Instagram *requires* the image to be between 4:5 and
  1.91:1 — square sits safely inside that range.
- **Brand colors** (use only these):
  - Copper `#B87333` — primary accent
  - Zari gold `#C99A3B` — secondary accent
  - Peacock teal `#0F6F6C` — deep accent
  - Sandstone `#F5F0E8` — light background
  - Ink `#1C1815` — text / dark background
- **Fonts:** Fraunces for the headline, Inter for everything else (from `fonts/`).
- Keep headline space generous — headlines are written by the AI and vary in
  length, so the design should still look right with one short line or three
  longer ones.
- Always leave room for the Servio logo (from `logo/`) in a consistent corner.

## House rules

- No stock photos with watermarks, and nothing whose license we don't have.
- Never put keys, passwords, or personal data in this folder — it ships inside
  every generated image workflow.
