// Usage: node scripts/prepare-profile-signature.mjs original-white-on-black.gif original-signature.jpg
// Extract coverage from the ORIGINAL black-backed GIF, not a binary-transparent GIF.
// White ink over black encodes its antialiased coverage in the RGB values.
import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const input = process.argv[2];
const highResolutionInput = process.argv[3];
if (!input || !highResolutionInput) throw new Error('Pass the original signature GIF and JPG paths.');
const output = new URL('../src/assets/signature/', import.meta.url);
await mkdir(output, { recursive: true });
const metadata = await sharp(input, { animated: true }).metadata();
// Frames after 35 only hold the completed signature. Keep the original drawing tempo.
const count = 36;
const crop = { left: 99, top: 74, width: 221, height: 98 };
// This crop aligns the supplied 1080 × 836 original with the GIF's signature area.
// The high-resolution ink stays in place throughout playback; the GIF only reveals it.
const highResolutionCrop = { left: 104, top: 335, width: 884, height: 392 };
const ink = await sharp(highResolutionInput).extract(highResolutionCrop).ensureAlpha().raw().toBuffer();
for (let i = 0; i < ink.length; i += 4) {
  // Remove only near-black/white JPEG compression noise, retaining soft edge coverage.
  const coverage = Math.round(Math.max(0, Math.min(255, ((ink[i] + ink[i + 1] + ink[i + 2]) / 3 - 3) * 255 / 249)));
  ink[i] = ink[i + 1] = ink[i + 2] = 255;
  ink[i + 3] = coverage;
}
await sharp(ink, { raw: { width: 884, height: 392, channels: 4 } }).webp({ lossless: true })
  .toFile(fileURLToPath(new URL('still.webp', output)));
const frames = await Promise.all(Array.from({ length: count }, async (_, page) => {
  // A generous reveal region absorbs the small shape differences between exports.
  // It never defines the handwriting's outline: that comes from the high-res ink.
  // libvips morphology treats black as foreground; erode expands our white region.
  const region = await sharp(input, { page }).extract(crop).removeAlpha().greyscale()
    .threshold(20).erode(4).png().toBuffer();
  const coverage = page === count - 1 ? Buffer.alloc(crop.width * crop.height, 255)
    : await sharp(region).greyscale().blur(0.7).raw().toBuffer();
  const pixels = Buffer.alloc(crop.width * crop.height * 4, 255);
  for (let i = 0; i < coverage.length; i++) {
    pixels[i * 4 + 3] = coverage[i];
  }
  return sharp(pixels, { raw: { width: crop.width, height: crop.height, channels: 4 } }).png().toBuffer();
}));
await sharp({ create: { width: crop.width * count, height: crop.height, channels: 4, background: '#0000' } })
  .composite(frames.map((input, index) => ({ input, left: index * crop.width, top: 0 })))
  .webp({ lossless: true }).toFile(fileURLToPath(new URL('frames.webp', output)));
await writeFile(new URL('timing.json', output), JSON.stringify({ delays: metadata.delay.slice(0, count) }) + '\n');
