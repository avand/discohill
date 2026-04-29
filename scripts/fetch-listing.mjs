#!/usr/bin/env node
// Pulls listing metadata + all reviews from Airbnb and writes them to site/data/.
//
// Usage:
//   npm run fetch              # both listings
//   npm run fetch:cabin        # cabin only
//   npm run fetch:barn         # barn only
//   node scripts/fetch-listing.mjs cabin barn
//
// First-time setup: `npm install && npx playwright install chromium`

import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "site", "data");

const LISTINGS = {
  cabin: { id: "42230765", slug: "cabin" },
  barn: { id: "846298531171766483", slug: "barn" },
};

// Throttle between paginated review fetches. The user runs this rarely;
// being polite keeps us well clear of rate-limit territory.
const REVIEW_PAGE_DELAY_MS = 2500;
const REVIEWS_PER_PAGE = 50;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getSection(sections, sectionId) {
  return sections.find((s) => s.sectionId === sectionId)?.section;
}

function extractListingMetadata(deferredState, listingId) {
  const payload = deferredState.niobeClientData?.[0]?.[1];
  if (!payload?.data?.presentation?.stayProductDetailPage) {
    throw new Error("Could not find stayProductDetailPage in page state");
  }

  const root = payload.data.presentation.stayProductDetailPage.sections;
  const sections = root.sections;
  const meta = root.metadata;
  const sharing = meta.sharingConfig || {};
  const ev = meta.loggingContext?.eventDataLogging || {};

  // Description sits in the DESCRIPTION_MODAL section as html items.
  const descModal = getSection(sections, "DESCRIPTION_MODAL");
  const descriptionItems = (descModal?.items || []).map((item) => ({
    title: item.title || null,
    html: item.html?.htmlText || null,
  }));

  const photoTour = getSection(sections, "PHOTO_TOUR_SCROLLABLE_MODAL");
  const photos = (photoTour?.mediaItems || []).map((m) => ({
    id: m.id,
    url: m.baseUrl,
    aspectRatio: m.aspectRatio || null,
    caption: m.imageMetadata?.caption || m.accessibilityLabel || null,
  }));

  const heroSection = getSection(sections, "HERO_DEFAULT");
  const heroPreviews = (heroSection?.previewImages || []).map((p) => ({
    id: p.id,
    url: p.baseUrl,
    caption: p.accessibilityLabel || null,
  }));

  const amenitiesSection = getSection(sections, "AMENITIES_DEFAULT");
  const amenityGroups = (amenitiesSection?.seeAllAmenitiesGroups || []).map((g) => ({
    title: g.title,
    amenities: (g.amenities || []).map((a) => ({
      title: a.title,
      subtitle: a.subtitle || null,
      available: a.available !== false,
    })),
  }));
  const previewAmenities = (amenitiesSection?.previewAmenitiesGroups?.[0]?.amenities || []).map(
    (a) => ({ title: a.title, available: a.available !== false }),
  );

  const highlightsSection = getSection(sections, "HIGHLIGHTS_DEFAULT");
  const highlights = (highlightsSection?.highlights || []).map((h) => ({
    title: h.title,
    subtitle: h.subtitle,
    type: h.type || null,
  }));

  const sleepingSection = getSection(sections, "SLEEPING_ARRANGEMENT_WITH_IMAGES");
  const sleeping = (sleepingSection?.arrangementDetails || []).map((a) => ({
    title: a.title,
    subtitle: a.subtitle,
    images: (a.images || []).map((i) => ({ url: i.baseUrl, caption: i.accessibilityLabel })),
  }));

  const locationSection = getSection(sections, "LOCATION_DEFAULT");
  const locationDetails = (locationSection?.previewLocationDetails || []).map((d) => ({
    title: d.title || null,
    html: d.content?.htmlText || null,
  }));

  const reviewsSection = getSection(sections, "REVIEWS_DEFAULT");
  const ratings = (reviewsSection?.ratings || []).map((r) => ({
    label: r.label,
    value: r.localizedRating ?? r.value,
  }));

  const hostSection = getSection(sections, "MEET_YOUR_HOST");
  const host = hostSection
    ? {
        name: hostSection.cardData?.name || null,
        about: hostSection.about || null,
        isSuperhost: hostSection.cardData?.isSuperhost || false,
      }
    : null;

  return {
    listingId,
    fetchedAt: new Date().toISOString(),
    pageTitle: meta.pageTitle || null,
    sharingTitle: sharing.title || null,
    propertyType: sharing.propertyType || null,
    location: sharing.location || null,
    personCapacity: sharing.personCapacity ?? ev.personCapacity ?? null,
    starRating: sharing.starRating ?? null,
    reviewCount: sharing.reviewCount ?? reviewsSection?.overallCount ?? null,
    isGuestFavorite: reviewsSection?.isGuestFavorite || false,
    coordinates: {
      lat: locationSection?.lat ?? ev.listingLat ?? null,
      lng: locationSection?.lng ?? ev.listingLng ?? null,
    },
    categoryRatings: {
      accuracy: ev.accuracyRating ?? null,
      checkin: ev.checkinRating ?? null,
      cleanliness: ev.cleanlinessRating ?? null,
      communication: ev.communicationRating ?? null,
      location: ev.locationRating ?? null,
      value: ev.valueRating ?? null,
    },
    description: descriptionItems,
    highlights,
    sleeping,
    locationDetails,
    previewAmenities,
    amenityGroups,
    photos,
    heroPreviews,
    host,
    ratings,
    airbnbUrl: `https://www.airbnb.com/rooms/${listingId}`,
  };
}

function extractReviewsFromGraphQLResponse(json) {
  const reviews = json?.data?.presentation?.stayProductDetailPage?.reviews?.reviews;
  if (!Array.isArray(reviews)) return null;
  return reviews.map((r) => ({
    id: r.id,
    createdAt: r.createdAt,
    rating: r.rating,
    language: r.language || null,
    comments: r.localizedReview || r.comments,
    localizedDate: r.localizedDate || null,
    response: r.response || null,
    reviewer: {
      firstName: r.reviewer?.firstName || null,
      pictureUrl: r.reviewer?.pictureUrl || null,
      location: r.localizedReviewerLocation || r.reviewer?.location || null,
    },
  }));
}

async function captureFirstReviewsRequest(page) {
  // Click "Show all reviews" and capture the URL + auth headers Airbnb's own JS sends.
  // We then replay this with new offsets to paginate.
  let captured = null;

  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("StaysPdpReviewsQuery") && !captured) {
      captured = {
        url,
        headers: req.headers(),
      };
    }
  });

  // The "Show all reviews" button text varies. Try a few patterns.
  const candidates = [
    /Show all \d+ reviews/i,
    /Show all reviews/i,
    /See all reviews/i,
  ];
  let clicked = false;
  for (const re of candidates) {
    try {
      const btn = page.getByRole("button", { name: re }).first();
      if (await btn.isVisible({ timeout: 2000 })) {
        await btn.click();
        clicked = true;
        break;
      }
    } catch {}
  }
  if (!clicked) {
    // Fallback: scroll to the reviews section to trigger lazy load.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.6));
  }

  // Wait for the first reviews response to fly past.
  for (let i = 0; i < 30 && !captured; i++) await sleep(500);
  return captured;
}

function rewriteReviewsUrl(originalUrl, { offset, limit }) {
  // The URL has variables encoded as a JSON-stringified `variables` query param.
  const u = new URL(originalUrl);
  const varsRaw = u.searchParams.get("variables");
  if (!varsRaw) throw new Error("Reviews URL missing 'variables' param");
  const vars = JSON.parse(varsRaw);
  const r = vars.pdpReviewsRequest || {};
  r.offset = String(offset);
  r.limit = limit;
  r.first = limit;
  vars.pdpReviewsRequest = r;
  u.searchParams.set("variables", JSON.stringify(vars));
  return u.toString();
}

async function fetchAllReviews(page, firstRequest, { totalExpected }) {
  const reviewsByOffset = new Map();
  let offset = 0;
  let consecutiveEmpty = 0;

  while (offset < (totalExpected || 5000)) {
    const url = rewriteReviewsUrl(firstRequest.url, { offset, limit: REVIEWS_PER_PAGE });
    // Re-issue through the page so cookies/CSRF/etc. are valid.
    const result = await page.evaluate(
      async ({ url, headers }) => {
        const res = await fetch(url, { headers, credentials: "include" });
        if (!res.ok) return { ok: false, status: res.status, text: await res.text() };
        return { ok: true, json: await res.json() };
      },
      { url, headers: firstRequest.headers },
    );

    if (!result.ok) {
      throw new Error(`Reviews fetch failed at offset ${offset}: ${result.status} ${result.text?.slice(0, 200)}`);
    }
    if (offset === 0 && process.env.DEBUG_REVIEWS) {
      const fs2 = await import("node:fs/promises");
      await fs2.writeFile("/tmp/reviews-sample.json", JSON.stringify(result.json, null, 2));
      console.log("  [debug] wrote /tmp/reviews-sample.json");
    }
    const batch = extractReviewsFromGraphQLResponse(result.json) || [];
    if (batch.length === 0) {
      consecutiveEmpty++;
      if (consecutiveEmpty >= 2) break;
    } else {
      consecutiveEmpty = 0;
      for (const r of batch) reviewsByOffset.set(r.id, r);
    }
    process.stdout.write(`  fetched offset=${offset} (+${batch.length}, total=${reviewsByOffset.size})\n`);
    offset += REVIEWS_PER_PAGE;
    if (batch.length < REVIEWS_PER_PAGE) break;
    await sleep(REVIEW_PAGE_DELAY_MS);
  }

  return [...reviewsByOffset.values()].sort((a, b) =>
    (b.createdAt || "").localeCompare(a.createdAt || ""),
  );
}

async function scrapeListing(slug, listingId) {
  console.log(`\n=== ${slug} (${listingId}) ===`);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    locale: "en-US",
  });
  const page = await context.newPage();

  try {
    const url = `https://www.airbnb.com/rooms/${listingId}`;
    console.log(`Loading ${url} ...`);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });

    // Wait for the inline state to be present.
    await page.waitForSelector('script#data-deferred-state-0', {
      state: "attached",
      timeout: 30_000,
    });
    const stateText = await page.evaluate(() => {
      const el = document.querySelector('script#data-deferred-state-0');
      return el ? el.textContent : null;
    });
    if (!stateText) throw new Error("No data-deferred-state-0 in page");
    const deferredState = JSON.parse(stateText);
    const metadata = extractListingMetadata(deferredState, listingId);
    console.log(
      `  ${metadata.sharingTitle || metadata.pageTitle} (${metadata.reviewCount} reviews)`,
    );

    // Now capture the reviews query and paginate.
    console.log("  Triggering reviews modal to capture auth ...");
    const firstReq = await captureFirstReviewsRequest(page);
    if (!firstReq) {
      console.warn("  WARNING: could not capture reviews request — skipping reviews");
      await fs.mkdir(DATA_DIR, { recursive: true });
      await fs.writeFile(
        path.join(DATA_DIR, `${slug}.json`),
        JSON.stringify(metadata, null, 2),
      );
      return;
    }
    console.log("  Paginating reviews ...");
    const reviews = await fetchAllReviews(page, firstReq, {
      totalExpected: metadata.reviewCount,
    });
    console.log(`  Captured ${reviews.length} reviews`);

    await fs.mkdir(DATA_DIR, { recursive: true });
    await fs.writeFile(
      path.join(DATA_DIR, `${slug}.json`),
      JSON.stringify(metadata, null, 2),
    );
    await fs.writeFile(
      path.join(DATA_DIR, `${slug}-reviews.json`),
      JSON.stringify(
        {
          listingId,
          fetchedAt: new Date().toISOString(),
          count: reviews.length,
          reviews,
        },
        null,
        2,
      ),
    );
    console.log(`  Wrote site/data/${slug}.json + ${slug}-reviews.json`);
  } finally {
    await browser.close();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args : Object.keys(LISTINGS);
  for (const slug of targets) {
    if (!LISTINGS[slug]) {
      console.error(`Unknown listing: ${slug}. Available: ${Object.keys(LISTINGS).join(", ")}`);
      process.exit(1);
    }
    await scrapeListing(slug, LISTINGS[slug].id);
  }
  console.log("\nDone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
