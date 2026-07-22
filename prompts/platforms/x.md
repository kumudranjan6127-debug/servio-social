# X (Twitter) rules

<!--
HOW THIS FILE IS USED (plain English):
The pipeline pastes this into the writing prompt only when the day's calendar
entry includes X. One standalone post — no threads.
-->

## The one hard limit

**Maximum 280 characters — and that INCLUDES every character of the link.**
Count the full link as written, tracking suffix and all. (X shortens links
internally, but we budget the full written length so a post can never overflow.)
A link with the tracking suffix typically eats 80–100 characters, so in practice
you have roughly 170–190 characters for the words. Plan for that from the start.

## Voice and format

- **One punchy idea.** X rewards a single sharp point, not a compressed essay.
  The strongest fact from the fact sheet, or the reader's pain point, stated
  plainly — then the CTA link.
- **1–2 hashtags maximum.** More than that reads as spam on X. It is fine to use
  none if the post is tighter without them.
- **The link goes in the post text** (this is an approved decision — we pay X's
  standard rate for posts with links). Use `utm_source=x` in the tracking suffix.
- No threads, no "1/5", no reply-with-link tricks. One self-contained post.
- Emojis: at most one, and only if it earns its place.

## Alt text for the image

This post carries the day's branded image, and the image's `alt` field (in the
JSON output) is what a screen reader speaks aloud. Make sure the alt text works
on its own for someone who cannot see the image: describe what is shown, include
any text rendered on the image, one or two plain sentences, and do not start
with "Image of".

## Uniqueness reminder

X REJECTS duplicate posts outright — if this text matches any other platform's
text (or a recent X post), publishing fails. Write it fresh: different opening,
different structure, different emphasis.
