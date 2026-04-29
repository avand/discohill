#!/usr/bin/env node
// Downloads photos for each listing from Airbnb's CDN (public, im_w resize)
// using URLs already captured in site/data/{slug}.json. Run after fetch-listing.
//
// Usage:
//   npm run photos                 # all listings
//   node scripts/download-photos.mjs cabin

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "site", "data");
const IMAGES_DIR = path.join(ROOT, "site", "assets", "images");

const SLUGS = ["cabin", "barn"];
// Airbnb's CDN only honors a fixed set of widths (240, 320, 480, 720, 960, 1200, 1440, 1920).
// 1440 is plenty for retina displays on a standard 720-1000px gallery.
const TARGET_WIDTH = 1440;
const DELAY_MS = 750;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}

async function downloadPhotos(slug) {
  const dataPath = path.join(DATA_DIR, `${slug}.json`);
  const data = JSON.parse(await fs.readFile(dataPath, "utf8"));
  const photos = data.photos || [];
  if (photos.length === 0) {
    console.warn(`  ${slug}: no photos in JSON, skipping`);
    return;
  }
  const dir = path.join(IMAGES_DIR, slug);
  await fs.mkdir(dir, { recursive: true });

  console.log(`\n=== ${slug}: ${photos.length} photos ===`);
  for (let i = 0; i < photos.length; i++) {
    const p = photos[i];
    const ext = (p.url.match(/\.(jpe?g|png)(\?|$)/i) || [, "jpg"])[1].toLowerCase();
    const filename = `${pad(i + 1)}.${ext === "jpeg" ? "jpg" : ext}`;
    const dest = path.join(dir, filename);
    const url = `${p.url}?im_w=${TARGET_WIDTH}`;
    process.stdout.write(`  ${filename} ... `);
    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
      },
    });
    if (!res.ok) {
      console.log(`FAILED (${res.status})`);
      continue;
    }
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(dest, buf);
    console.log(`${(buf.length / 1024).toFixed(0)}KB`);
    await sleep(DELAY_MS);
  }

  // Also write a photos manifest with local paths + captions for the page builder.
  const manifest = photos.map((p, i) => ({
    file: `assets/images/${slug}/${pad(i + 1)}.jpg`,
    caption: p.caption,
    aspectRatio: p.aspectRatio,
  }));
  await fs.writeFile(
    path.join(DATA_DIR, `${slug}-photos.json`),
    JSON.stringify(manifest, null, 2),
  );
  console.log(`  Wrote site/data/${slug}-photos.json`);
}

async function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args : SLUGS;
  for (const slug of targets) {
    if (!SLUGS.includes(slug)) {
      console.error(`Unknown listing: ${slug}`);
      process.exit(1);
    }
    await downloadPhotos(slug);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
