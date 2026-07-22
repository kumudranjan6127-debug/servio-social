# LinkedIn rules (personal profile)

<!--
HOW THIS FILE IS USED (plain English):
The pipeline pastes this into the writing prompt only when the day's calendar
entry includes LinkedIn. Posts go to a PERSONAL LinkedIn profile, not a company
page — so the voice is a person sharing hard-won knowledge, not a brand
broadcasting.
-->

## Voice

- Write as a professional sharing what they know — first person is natural here.
  Practical, generous, credible. No corporate "we are thrilled to announce" tone.
- The reader is a small-business owner scrolling between meetings. Respect their
  time: one idea, developed properly, then the CTA.

## Format

- **Length: aim for the ~1,300 character sweet spot. Hard maximum 3,000 characters.**
  1,300 is where LinkedIn posts tend to perform best — long enough to say something
  real, short enough to hold attention.
- **The first line is the hook.** LinkedIn cuts the post off after roughly the first
  200 characters with a "...see more" link, so the opening line must earn the click
  on its own. Lead with the sharpest fact or the reader's pain point — never with
  "In today's world..." style throat-clearing.
- Use short paragraphs (1–3 lines) with blank lines between them. Walls of text die
  on LinkedIn.
- **3–5 hashtags, placed at the end of the post.** Specific beats generic
  (#SmallBusinessIndia beats #Business).
- Include the CTA link with `utm_source=linkedin` in the tracking suffix.
- Emojis: none to a couple, only where they genuinely help. This is the most
  professional of the four platforms.

## Character escaping (important technical detail)

LinkedIn's posting API treats these characters as formatting controls:
`( ) [ ] { } < > @ # * _ ~ |`

**Escape each of them with a backslash when they appear in normal sentence text**
— for example write `\(around 40%\)` instead of `(around 40%)`. 

**Exception:** do NOT escape the `#` that starts an intended hashtag — escaping it
would break the hashtag.

## Uniqueness reminder

This text must be written fresh for LinkedIn — different opening, different
structure, different emphasis from every other platform's version of this post.
