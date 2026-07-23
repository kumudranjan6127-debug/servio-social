/**
 * generate-brand-images.mjs — writes 6 abstract branded 1080x1080 PNGs to
 * assets/pool/, with zero npm dependencies.
 *
 * The PNG encoder is hand-rolled on top of node:zlib (the same technique
 * classic icon-generator scripts use): signature + IHDR + one deflated IDAT
 * (filter byte 0 per scanline, 8-bit RGB) + IEND, each chunk CRC32-signed.
 *
 * Every image is pure math over (x, y) — vertical/radial/diagonal gradients in
 * the Servio blue family (#1E4FFF and friends) plus white, layered with simple
 * geometric shapes (circles, rings, bars, blocks). No text, no randomness:
 * running the script twice produces byte-identical files.
 *
 * Usage: node scripts/generate-brand-images.mjs   (or: npm run images)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

const WIDTH = 1080;
const HEIGHT = 1080;

const OUT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "pool");

// ---------------------------------------------------------------------------
// Brand palette (blue family + white). #1E4FFF is the anchor brand blue.
// ---------------------------------------------------------------------------

const BLUE_DEEP = [13, 32, 116]; // #0D2074 — near-navy
const BLUE_BRAND = [30, 79, 255]; // #1E4FFF — the Servio blue
const BLUE_MID = [58, 108, 255]; // #3A6CFF
const BLUE_LIGHT = [110, 140, 255]; // #6E8CFF
const BLUE_PALE = [230, 236, 255]; // #E6ECFF
const WHITE = [255, 255, 255]; // #FFFFFF

// ---------------------------------------------------------------------------
// PNG encoding (dependency-free)
// ---------------------------------------------------------------------------

/** Precomputed CRC32 table (standard PNG polynomial 0xEDB88320). */
const CRC_TABLE = new Int32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c;
}

/**
 * CRC32 of a buffer, as an unsigned 32-bit integer (PNG chunk checksum).
 * @param {Buffer} buf Bytes to checksum (chunk type + chunk data).
 * @returns {number} Unsigned CRC32.
 */
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Builds one PNG chunk: 4-byte length, 4-byte ASCII type, data, 4-byte CRC
 * over type + data.
 * @param {string} type Chunk type, e.g. "IHDR".
 * @param {Buffer} data Chunk payload (may be empty).
 * @returns {Buffer} The complete chunk.
 */
function chunk(type, data) {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}

/**
 * Encodes raw RGB pixels (width*height*3 bytes, row-major) as a complete PNG
 * file: 8-bit truecolor, no interlace, filter "None" on every scanline.
 * @param {Buffer} pixels Raw RGB bytes, length WIDTH*HEIGHT*3.
 * @returns {Buffer} PNG file bytes.
 */
function encodePng(pixels) {
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type 2 = truecolor RGB
  ihdr[10] = 0; // compression: deflate
  ihdr[11] = 0; // filter method 0
  ihdr[12] = 0; // no interlace

  // Each scanline is prefixed with a filter byte; 0 = None.
  const stride = WIDTH * 3;
  const raw = Buffer.alloc((stride + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (stride + 1)] = 0;
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  const idat = deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Tiny drawing toolkit (pure functions over x, y)
// ---------------------------------------------------------------------------

/**
 * Clamps a number into [0, 1].
 * @param {number} t Any number.
 * @returns {number} t limited to the 0..1 range.
 */
function clamp01(t) {
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/**
 * Linear blend of two RGB colors: a at t=0, b at t=1.
 * @param {number[]} a First color [r, g, b].
 * @param {number[]} b Second color [r, g, b].
 * @param {number} t Blend factor 0..1 (clamped).
 * @returns {number[]} Blended color.
 */
function mix(a, b, t) {
  const k = clamp01(t);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
}

/**
 * Composites `top` over `base` at the given opacity (simple alpha-over).
 * @param {number[]} base Background color.
 * @param {number[]} top Foreground color.
 * @param {number} alpha Foreground opacity 0..1.
 * @returns {number[]} Resulting color.
 */
function over(base, top, alpha) {
  return mix(base, top, alpha);
}

/**
 * Coverage (0..1) of a filled circle at (cx, cy) with the given radius, with a
 * small feathered edge so the rim is anti-aliased instead of jagged.
 * @param {number} x Pixel x.
 * @param {number} y Pixel y.
 * @param {number} cx Circle center x.
 * @param {number} cy Circle center y.
 * @param {number} r Circle radius in pixels.
 * @returns {number} 1 inside, 0 outside, ramp across the edge.
 */
function circle(x, y, cx, cy, r) {
  const feather = 2;
  const d = Math.hypot(x - cx, y - cy);
  return clamp01((r + feather - d) / (2 * feather));
}

/**
 * Coverage (0..1) of a circular ring (an outline) centered on (cx, cy).
 * @param {number} x Pixel x.
 * @param {number} y Pixel y.
 * @param {number} cx Ring center x.
 * @param {number} cy Ring center y.
 * @param {number} r Ring radius (to the middle of the stroke).
 * @param {number} thickness Stroke thickness in pixels.
 * @returns {number} 1 on the stroke, 0 elsewhere, feathered edges.
 */
function ring(x, y, cx, cy, r, thickness) {
  const feather = 2;
  const d = Math.abs(Math.hypot(x - cx, y - cy) - r);
  return clamp01((thickness / 2 + feather - d) / (2 * feather));
}

/**
 * Coverage (1 or 0) of an axis-aligned rectangle [x0, x1) x [y0, y1).
 * @param {number} x Pixel x.
 * @param {number} y Pixel y.
 * @param {number} x0 Left edge.
 * @param {number} y0 Top edge.
 * @param {number} x1 Right edge (exclusive).
 * @param {number} y1 Bottom edge (exclusive).
 * @returns {number} 1 inside, 0 outside.
 */
function rect(x, y, x0, y0, x1, y1) {
  return x >= x0 && x < x1 && y >= y0 && y < y1 ? 1 : 0;
}

/**
 * Coverage (0..1) of a diagonal band: pixels whose (x - y) falls in [lo, hi].
 * @param {number} x Pixel x.
 * @param {number} y Pixel y.
 * @param {number} lo Lower bound of x - y.
 * @param {number} hi Upper bound of x - y.
 * @returns {number} 1 inside the band, 0 outside, feathered edges.
 */
function diagonalBand(x, y, lo, hi) {
  const feather = 2;
  const s = x - y;
  const inLo = clamp01((s - lo + feather) / (2 * feather));
  const inHi = clamp01((hi - s + feather) / (2 * feather));
  return Math.min(inLo, inHi);
}

// ---------------------------------------------------------------------------
// The six designs — each maps (x, y) to an [r, g, b] color, deterministically.
// ---------------------------------------------------------------------------

/** Center of the canvas, used by the radial designs. */
const CX = WIDTH / 2;
const CY = HEIGHT / 2;
/** Distance from the center to a corner (for normalizing radial gradients). */
const CORNER_DIST = Math.hypot(CX, CY);

/**
 * Design 1 — vertical navy-to-brand gradient with a large white orb top-right
 * and a soft pale-blue orb bottom-left.
 * @param {number} x Pixel x. @param {number} y Pixel y.
 * @returns {number[]} RGB color.
 */
function designGradientOrb(x, y) {
  let c = mix(BLUE_DEEP, BLUE_BRAND, y / HEIGHT);
  c = over(c, BLUE_PALE, 0.5 * circle(x, y, 300, 810, 150));
  c = over(c, WHITE, 0.92 * circle(x, y, 770, 330, 240));
  return c;
}

/**
 * Design 2 — radial gradient (brand blue center, navy edges) with three
 * concentric white rings fading outward.
 * @param {number} x Pixel x. @param {number} y Pixel y.
 * @returns {number[]} RGB color.
 */
function designRadialRings(x, y) {
  const d = Math.hypot(x - CX, y - CY) / CORNER_DIST;
  let c = mix(BLUE_BRAND, BLUE_DEEP, d);
  c = over(c, WHITE, 0.85 * ring(x, y, CX, CY, 260, 26));
  c = over(c, WHITE, 0.45 * ring(x, y, CX, CY, 390, 18));
  c = over(c, WHITE, 0.25 * ring(x, y, CX, CY, 520, 12));
  return c;
}

/**
 * Design 3 — diagonal mid-blue-to-navy gradient crossed by three white
 * diagonal beams of decreasing strength.
 * @param {number} x Pixel x. @param {number} y Pixel y.
 * @returns {number[]} RGB color.
 */
function designDiagonalBeams(x, y) {
  let c = mix(BLUE_MID, BLUE_DEEP, (x + y) / (WIDTH + HEIGHT));
  c = over(c, WHITE, 0.8 * diagonalBand(x, y, -40, 60));
  c = over(c, WHITE, 0.4 * diagonalBand(x, y, 150, 210));
  c = over(c, WHITE, 0.28 * diagonalBand(x, y, -240, -190));
  return c;
}

/**
 * Design 4 — light-blue glow from the top-left corner falling into navy, with
 * two overlapping squares (pale blue under white) in the lower right.
 * @param {number} x Pixel x. @param {number} y Pixel y.
 * @returns {number[]} RGB color.
 */
function designCornerGlowBlocks(x, y) {
  const d = Math.hypot(x, y) / (CORNER_DIST * 2);
  let c = mix(BLUE_LIGHT, BLUE_DEEP, d * 1.15);
  c = over(c, BLUE_PALE, 0.35 * rect(x, y, 520, 540, 780, 800));
  c = over(c, WHITE, 0.9 * rect(x, y, 620, 640, 940, 960));
  return c;
}

/**
 * Design 5 — horizontal navy-to-brand gradient with translucent white vertical
 * bars and a solid white circle at the center.
 * @param {number} x Pixel x. @param {number} y Pixel y.
 * @returns {number[]} RGB color.
 */
function designVerticalBars(x, y) {
  let c = mix(BLUE_DEEP, BLUE_BRAND, x / WIDTH);
  c = over(c, WHITE, 0.22 * rect(x, y, 120, 0, 180, HEIGHT));
  c = over(c, WHITE, 0.45 * rect(x, y, 260, 0, 340, HEIGHT));
  c = over(c, WHITE, 0.35 * rect(x, y, 780, 0, 860, HEIGHT));
  c = over(c, WHITE, 0.2 * rect(x, y, 940, 0, 1000, HEIGHT));
  c = over(c, WHITE, 0.95 * circle(x, y, CX, CY, 110));
  return c;
}

/**
 * Design 6 — soft vertical gradient from brand blue down to pale blue, with a
 * deep-blue orb and a white orb overlapping in the upper left.
 * @param {number} x Pixel x. @param {number} y Pixel y.
 * @returns {number[]} RGB color.
 */
function designSoftHorizon(x, y) {
  let c = mix(BLUE_BRAND, BLUE_PALE, Math.pow(y / HEIGHT, 1.2));
  c = over(c, BLUE_DEEP, 0.55 * circle(x, y, 270, 300, 190));
  c = over(c, WHITE, 0.85 * circle(x, y, 440, 430, 150));
  return c;
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

/**
 * Renders a design function into a raw RGB pixel buffer.
 * @param {(x: number, y: number) => number[]} design Color function.
 * @returns {Buffer} WIDTH*HEIGHT*3 bytes of RGB data.
 */
function render(design) {
  const pixels = Buffer.alloc(WIDTH * HEIGHT * 3);
  let o = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const c = design(x, y);
      pixels[o++] = Math.max(0, Math.min(255, Math.round(c[0])));
      pixels[o++] = Math.max(0, Math.min(255, Math.round(c[1])));
      pixels[o++] = Math.max(0, Math.min(255, Math.round(c[2])));
    }
  }
  return pixels;
}

/** The pool, in file order. Names become servio-pool-01.png .. -06.png. */
const DESIGNS = [
  { name: "gradient-orb", fn: designGradientOrb },
  { name: "radial-rings", fn: designRadialRings },
  { name: "diagonal-beams", fn: designDiagonalBeams },
  { name: "corner-glow-blocks", fn: designCornerGlowBlocks },
  { name: "vertical-bars", fn: designVerticalBars },
  { name: "soft-horizon", fn: designSoftHorizon },
];

mkdirSync(OUT_DIR, { recursive: true });
console.log(`Rendering ${DESIGNS.length} branded ${WIDTH}x${HEIGHT} images into ${OUT_DIR}`);
DESIGNS.forEach((design, i) => {
  const png = encodePng(render(design.fn));
  const file = path.join(OUT_DIR, `servio-pool-${String(i + 1).padStart(2, "0")}.png`);
  writeFileSync(file, png);
  console.log(
    `  wrote ${path.basename(file)} (${(png.length / 1024).toFixed(0)} KB, ${design.name})`
  );
});
console.log("Done.");
