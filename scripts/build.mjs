#!/usr/bin/env node
// Renders site/{cabin,barn}/index.html from the JSON data scraped by fetch-listing.
// No build framework — just template literals and string-escaping.
//
// Usage:
//   npm run build              # both
//   node scripts/build.mjs cabin

import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(ROOT, "site", "data");
const SITE_DIR = path.join(ROOT, "site");

const SLUGS = ["cabin", "barn"];

const PROPERTY_LABEL = {
  cabin: "The Cabin",
  barn: "The Barn",
};

const HOMEPAGE_BLURB = {
  cabin:
    "A cozy, fully remodeled cabin with a wood-paneled great room, outdoor kitchen, and a queen sleeper sofa for extra guests.",
  barn:
    "A reimagined two-story barn with bright modern decor, a dedicated workstation, fast Wi-Fi, and a private hot tub on the property.",
};

const HOMEPAGE_META = {
  cabin: "1 bedroom · sleeps 4",
  barn: "1 bedroom · 2 baths",
};

// Map Airbnb amenity icon tokens to emoji. Anything not mapped falls back to ✓.
// This is a friendly visual cue, not a 1:1 reproduction of Airbnb's icon set.
const AMENITY_ICONS = {
  SYSTEM_VIEW_MOUNTAIN: "🏔️",
  SYSTEM_VIEW_GARDEN: "🌿",
  SYSTEM_COOKING_BASICS: "🍳",
  SYSTEM_DETAIL_KITCHEN: "🍳",
  SYSTEM_DETAIL_REFRIGERATOR: "🧊",
  SYSTEM_DETAIL_DINING_TABLE: "🍽️",
  SYSTEM_DETAIL_COFFEE_MAKER: "☕",
  SYSTEM_DETAIL_DISHWASHER: "🧼",
  SYSTEM_DETAIL_OVEN: "🍞",
  SYSTEM_DETAIL_MICROWAVE: "🍿",
  SYSTEM_DETAIL_MIXER: "🥣",
  SYSTEM_WIFI: "📶",
  SYSTEM_TV: "📺",
  SYSTEM_DETAIL_TV: "📺",
  SYSTEM_DETAIL_LAPTOP: "💻",
  SYSTEM_AC_UNIT: "❄️",
  SYSTEM_HEATING: "🔥",
  SYSTEM_DETAIL_FIREPLACE: "🔥",
  SYSTEM_DETAIL_FAN: "🌀",
  SYSTEM_DETAIL_BATHTUB: "🛁",
  SYSTEM_DETAIL_SHOWER: "🚿",
  SYSTEM_DETAIL_HAIRDRYER: "💇",
  SYSTEM_DETAIL_TOWEL: "🧺",
  SYSTEM_DETAIL_WASHING_MACHINE: "🧺",
  SYSTEM_DETAIL_DRYER: "🧺",
  SYSTEM_DETAIL_BED: "🛏️",
  SYSTEM_DETAIL_BED_KING: "🛏️",
  SYSTEM_DETAIL_CRIB: "🛏️",
  SYSTEM_DETAIL_LAUNDRY: "🧺",
  SYSTEM_DETAIL_PARKING: "🅿️",
  SYSTEM_DETAIL_OUTDOOR: "🌳",
  SYSTEM_DETAIL_PATIO: "🪴",
  SYSTEM_DETAIL_GRILL: "🔥",
  SYSTEM_DETAIL_HOT_TUB: "♨️",
  SYSTEM_DETAIL_POOL: "🏊",
  SYSTEM_NATURE_PARK: "🌲",
  SYSTEM_CHECK_IN: "🔑",
  SYSTEM_DETAIL_DOOR_LOCK: "🔒",
  SYSTEM_DETAIL_SMOKE_ALARM: "🚨",
  SYSTEM_DETAIL_FIRE_EXTINGUISHER: "🧯",
  SYSTEM_DETAIL_FIRST_AID: "🩹",
  SYSTEM_DETAIL_PET: "🐾",
  SYSTEM_DETAIL_PETS_ALLOWED: "🐾",
  SYSTEM_DETAIL_BABY: "👶",
  SYSTEM_DETAIL_HIGH_CHAIR: "👶",
  SYSTEM_DETAIL_FAMILY_FRIENDLY: "👨‍👩‍👧",
  SYSTEM_DETAIL_WORKSPACE: "💼",
  SYSTEM_DETAIL_DESK: "💼",
  SYSTEM_PEACE_AND_QUIET: "🤫",
  SYSTEM_BED: "🛏️",
};

// Highlight icons (a smaller set, larger size).
const HIGHLIGHT_ICONS = {
  LISTING_NATIONAL_PARK: "🏞️",
  LISTING_SELF_CHECKIN: "🔑",
  LISTING_GREAT_LOCATION: "📍",
  LISTING_PEACE_AND_QUIET: "🤫",
  LISTING_GREAT_VIEW: "🏔️",
  LISTING_DEDICATED_WORKSPACE: "💻",
  LISTING_GREAT_FOR_REMOTE_WORK: "💻",
  LISTING_FAST_WIFI: "📶",
  LISTING_PETS_ALLOWED: "🐾",
};

function amenityIcon(name) {
  return AMENITY_ICONS[name] || "✓";
}

function highlightIcon(type) {
  return HIGHLIGHT_ICONS[type] || "✨";
}

// Escape HTML entities — used for any string that could contain user-controlled
// content (descriptions, review text). The Airbnb data uses <br /> for newlines;
// we strip tags and convert <br> to actual newlines, which CSS renders.
function escapeHtml(s) {
  if (!s) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function htmlToText(html) {
  if (!html) return "";
  return String(html)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/?(p|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "");
}

function descriptionHtml(html) {
  // Render Airbnb's description prose. We escape everything, then put back the
  // <br /> as newlines via CSS white-space: pre-line.
  return escapeHtml(htmlToText(html));
}

function renderHead({ title, description, ogImage, canonical }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="icon" href="/assets/images/logo.png" type="image/png" />
  <link rel="apple-touch-icon" href="/assets/images/logo.png" />
  <link rel="stylesheet" href="/assets/css/site.css" />
  <link rel="canonical" href="${escapeHtml(canonical)}" />
  <meta property="og:title" content="${escapeHtml(title)}" />
  <meta property="og:description" content="${escapeHtml(description)}" />
  <meta property="og:image" content="${escapeHtml(ogImage)}" />
  <meta property="og:type" content="website" />
</head>
<body>`;
}

function renderHeader() {
  return `
<header class="site-header">
  <a class="site-header__brand" href="/">
    <img class="site-header__logo" src="/assets/images/logo.png" alt="" />
    <span>Kaleidoscope Hill</span>
  </a>
</header>`;
}

function renderFooter() {
  return `
<footer class="site-footer">
  <span>© Kaleidoscope Hill · Mariposa, California</span>
  <span>
    Hosted by <a href="https://www.airbnb.com/users/show/268591" target="_blank" rel="noopener">Avand on Airbnb</a>
  </span>
</footer>`;
}

function summaryLine(data) {
  // Parse "Cabin in Mariposa · ★4.97 · 1 bedroom · 2 beds · 1 private bath"
  // into the trailing fragments we want to display.
  const parts = (data.sharingTitle || "").split("·").map((s) => s.trim());
  const fragments = parts.slice(2); // drop "Cabin in Mariposa" and the rating
  const tokens = [];
  if (data.personCapacity) tokens.push(`${data.personCapacity} guests`);
  tokens.push(...fragments);
  return tokens.join(" · ");
}

function renderGallery(slug, photos, label) {
  const first = photos[0];
  const thumbs = photos.slice(1, 5);
  return `
<div class="gallery">
  <div class="gallery__photo" data-photo-index="0" role="button" tabindex="0">
    <img src="/${first.file}" alt="${escapeHtml(first.caption || label)}" />
    ${photos.length > 5 ? `<button class="gallery__more" type="button">Show all ${photos.length} photos</button>` : ""}
  </div>
  ${thumbs
    .map(
      (p, i) => `
  <div class="gallery__photo" data-photo-index="${i + 1}" role="button" tabindex="0">
    <img src="/${p.file}" alt="${escapeHtml(p.caption || "")}" loading="lazy" />
  </div>`,
    )
    .join("")}
</div>`;
}

function renderHighlights(highlights) {
  if (!highlights || highlights.length === 0) return "";
  return `
<section>
  <div class="highlights">
    ${highlights
      .map(
        (h) => `
    <div class="highlight">
      <div class="highlight__icon">${highlightIcon(h.type)}</div>
      <div>
        <div class="highlight__title">${escapeHtml(h.title)}</div>
        ${h.subtitle ? `<div class="highlight__subtitle">${escapeHtml(h.subtitle)}</div>` : ""}
      </div>
    </div>`,
      )
      .join("")}
  </div>
</section>`;
}

function renderDescription(items) {
  if (!items || items.length === 0) return "";
  return `
<section>
  <h2>About this place</h2>
  ${items
    .map(
      (item) => `
    <div class="description__item">
      ${item.title ? `<div class="description__item-title">${escapeHtml(item.title)}</div>` : ""}
      <div class="description__item-body">${descriptionHtml(item.html)}</div>
    </div>`,
    )
    .join("")}
</section>`;
}

function renderSleeping(sleeping) {
  if (!sleeping || sleeping.length === 0) return "";
  return `
<section>
  <h2>Where you'll sleep</h2>
  <div class="sleeping">
    ${sleeping
      .map(
        (s) => `
    <div class="sleeping__card">
      <div class="sleeping__card-title">${escapeHtml(s.title)}</div>
      <div class="sleeping__card-subtitle">${escapeHtml(s.subtitle || "")}</div>
    </div>`,
      )
      .join("")}
  </div>
</section>`;
}

function renderAmenities(groups) {
  if (!groups || groups.length === 0) return "";
  // Show the first 5 groups as preview; rest go in a hidden modal via JS.
  const preview = groups.filter((g) => g.title !== "Not included").slice(0, 4);
  const allGroups = groups;
  const totalCount = allGroups.reduce((n, g) => n + (g.amenities?.length || 0), 0);

  const renderGroup = (g) => `
    <div class="amenities__group">
      ${g.title ? `<h3 class="amenities__group-title">${escapeHtml(g.title)}</h3>` : ""}
      <div class="amenities">
        ${(g.amenities || [])
          .map(
            (a) => `
        <div class="amenity${a.available === false ? " amenity--unavailable" : ""}">
          <span class="amenity__icon">${amenityIcon(a.icon)}</span>
          <span>${escapeHtml(a.title)}${a.subtitle ? ` <span class="amenity__sub">— ${escapeHtml(a.subtitle)}</span>` : ""}</span>
        </div>`,
          )
          .join("")}
      </div>
    </div>`;

  return `
<section>
  <h2>What this place offers</h2>
  ${preview.map(renderGroup).join("")}
  ${
    allGroups.length > preview.length
      ? `<button class="amenities__toggle" type="button" data-modal-target="amenities-modal">Show all ${totalCount} amenities</button>
  <div class="modal modal--reviews" id="amenities-modal">
    <button class="modal__close" type="button" data-modal-close>×</button>
    <div class="modal__inner">
      <h2 style="margin-bottom: 24px">What this place offers</h2>
      ${allGroups.map(renderGroup).join("")}
    </div>
  </div>`
      : ""
  }
</section>`;
}

function renderRatings(ratings) {
  if (!ratings || ratings.length === 0) return "";
  return `
  <div class="reviews-summary">
    ${ratings
      .map(
        (r) => `
    <div class="reviews-summary__row">
      <span class="label">${escapeHtml(r.label)}</span>
      <span class="value">${escapeHtml(String(r.value))}</span>
    </div>`,
      )
      .join("")}
  </div>`;
}

function reviewerInitial(name) {
  if (!name) return "?";
  return name.trim().charAt(0).toUpperCase();
}

function renderReview(r, { clamp = false } = {}) {
  const who = r.reviewer?.firstName || "Guest";
  const where = r.reviewer?.location;
  const date = r.localizedDate || (r.createdAt ? r.createdAt.slice(0, 10) : "");
  const avatar = r.reviewer?.pictureUrl
    ? `<img class="review__avatar" src="${escapeHtml(r.reviewer.pictureUrl)}" alt="" loading="lazy" />`
    : `<span class="review__avatar-fallback">${escapeHtml(reviewerInitial(who))}</span>`;
  const stars = "★".repeat(Math.round(r.rating || 5));
  const body = escapeHtml(r.comments || "");
  return `
  <div class="review">
    <div class="review__head">
      ${avatar}
      <div>
        <div class="review__name">${escapeHtml(who)}</div>
        <div class="review__meta">${[escapeHtml(where || ""), escapeHtml(date)].filter(Boolean).join(" · ")}</div>
      </div>
    </div>
    <div class="review__rating">${stars}</div>
    <div class="review__body${clamp ? " review__body--clamped" : ""}">${body}</div>
  </div>`;
}

function renderReviews(data, reviews) {
  if (!reviews || reviews.length === 0) return "";
  const PREVIEW_COUNT = 6;
  const preview = reviews.slice(0, PREVIEW_COUNT);
  return `
<section id="reviews">
  <div class="reviews-overall">
    <span class="star">★ ${data.starRating ?? "—"}</span>
    <small>· ${data.reviewCount ?? reviews.length} reviews</small>
    ${data.isGuestFavorite ? `<span class="badge" style="margin-left:8px">Guest favorite</span>` : ""}
  </div>
  ${renderRatings(data.ratings)}
  <div class="reviews-list">
    ${preview.map((r) => renderReview(r, { clamp: true })).join("")}
  </div>
  ${
    reviews.length > PREVIEW_COUNT
      ? `<button class="reviews__toggle" type="button" data-modal-target="reviews-modal">Show all ${reviews.length} reviews</button>
  <div class="modal modal--reviews" id="reviews-modal">
    <button class="modal__close" type="button" data-modal-close>×</button>
    <div class="modal__inner">
      <h2 style="margin-bottom: 24px">★ ${data.starRating ?? "—"} · ${reviews.length} reviews</h2>
      <div class="reviews-list">
        ${reviews.map((r) => renderReview(r, { clamp: false })).join("")}
      </div>
    </div>
  </div>`
      : ""
  }
</section>`;
}

function renderBookCard(data) {
  const features = [];
  if (data.starRating) features.push(`<strong>★ ${data.starRating}</strong> · ${data.reviewCount} reviews`);
  if (data.host?.isSuperhost) features.push(`<strong>Superhost</strong>`);
  features.push(`<strong>Self check-in</strong>`);
  return `
<aside class="book-card">
  <p class="book-card__price">Direct booking unavailable — reserve through Airbnb to keep your stay covered by their guest protections.</p>
  <a class="book-card__cta" href="${escapeHtml(data.airbnbUrl)}" target="_blank" rel="noopener">Book on Airbnb</a>
  <p class="book-card__note">You'll see real-time availability and pricing on Airbnb.</p>
  <div class="book-card__highlights">
    ${features.map((f) => `<div class="book-card__highlight">${f}</div>`).join("")}
  </div>
</aside>`;
}

function renderMobileBookBar(data) {
  return `
<div class="mobile-book-bar">
  <div class="mobile-book-bar__price"><strong>${escapeHtml(data.starRating ? `★ ${data.starRating}` : "Available")}</strong> · ${data.reviewCount ?? ""} reviews</div>
  <a class="mobile-book-bar__cta" href="${escapeHtml(data.airbnbUrl)}" target="_blank" rel="noopener">Book on Airbnb</a>
</div>`;
}

function renderModalScript() {
  return `
<script>
(function () {
  function open(id) {
    var m = document.getElementById(id);
    if (m) { m.setAttribute('open', ''); document.body.style.overflow = 'hidden'; }
  }
  function close(m) { m.removeAttribute('open'); document.body.style.overflow = ''; }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-modal-target]');
    if (t) { e.preventDefault(); open(t.getAttribute('data-modal-target')); return; }
    if (e.target.matches('[data-modal-close]')) {
      var m = e.target.closest('.modal'); if (m) close(m); return;
    }
    if (e.target.classList.contains('modal')) close(e.target);
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal[open]').forEach(close);
    }
  });
  // Photo gallery: clicking any tile opens the photos modal scrolled to that one.
  document.querySelectorAll('[data-photo-index]').forEach(function (tile) {
    tile.addEventListener('click', function () {
      var idx = tile.getAttribute('data-photo-index');
      open('photos-modal');
      var target = document.querySelector('#photos-modal [data-photo="' + idx + '"]');
      if (target) target.scrollIntoView({ block: 'start' });
    });
  });
})();
</script>`;
}

function renderPhotosModal(photos, label) {
  return `
<div class="modal" id="photos-modal">
  <button class="modal__close" type="button" data-modal-close>×</button>
  <div class="modal__inner">
    <div class="modal__photos">
      ${photos
        .map(
          (p, i) => `
      <div class="modal__photo" data-photo="${i}">
        <img src="/${p.file}" alt="${escapeHtml(p.caption || label)}" loading="lazy" />
        ${p.caption ? `<div class="modal__caption">${escapeHtml(p.caption)}</div>` : ""}
      </div>`,
        )
        .join("")}
    </div>
  </div>
</div>`;
}

function renderJsonLd(data, slug) {
  // Schema.org LodgingBusiness for SEO. Keep it conservative; only emit fields
  // we have strong values for.
  const obj = {
    "@context": "https://schema.org",
    "@type": "LodgingBusiness",
    name: `${PROPERTY_LABEL[slug]} at Kaleidoscope Hill`,
    description: htmlToText(data.description?.[0]?.html || "").slice(0, 300),
    address: {
      "@type": "PostalAddress",
      addressLocality: data.location || "Mariposa",
      addressRegion: "California",
      addressCountry: "US",
    },
    image: data.photos?.[0]?.url,
    aggregateRating: data.starRating
      ? {
          "@type": "AggregateRating",
          ratingValue: data.starRating,
          reviewCount: data.reviewCount,
        }
      : undefined,
    geo: data.coordinates?.lat
      ? {
          "@type": "GeoCoordinates",
          latitude: data.coordinates.lat,
          longitude: data.coordinates.lng,
        }
      : undefined,
    url: `https://discohill.com/${slug}/`,
  };
  return `<script type="application/ld+json">${JSON.stringify(obj)}</script>`;
}

async function buildListing(slug) {
  const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${slug}.json`), "utf8"));
  const reviewsFile = JSON.parse(
    await fs.readFile(path.join(DATA_DIR, `${slug}-reviews.json`), "utf8"),
  );
  const photosFile = JSON.parse(
    await fs.readFile(path.join(DATA_DIR, `${slug}-photos.json`), "utf8"),
  );

  const label = PROPERTY_LABEL[slug];
  const titleSuffix = `Kaleidoscope Hill · Mariposa, CA`;
  const pageTitle = `${label} — ${titleSuffix}`;
  const description = htmlToText(data.description?.[0]?.html || "").slice(0, 200);
  const ogImage = `/${photosFile[0]?.file || "assets/images/logo.png"}`;

  const html = `${renderHead({
    title: pageTitle,
    description,
    ogImage,
    canonical: `https://discohill.com/${slug}/`,
  })}
${renderHeader()}
<main class="listing">
  <h1 class="listing__title">${escapeHtml(label)} at Kaleidoscope Hill</h1>
  <div class="listing__subtitle">
    ${data.starRating ? `<span class="star">★ ${data.starRating}</span>` : ""}
    <span class="dot">·</span>
    <a href="#reviews">${data.reviewCount ?? reviewsFile.count} reviews</a>
    <span class="dot">·</span>
    <span>${escapeHtml(data.location || "Mariposa, California")}</span>
    ${data.isGuestFavorite ? `<span class="badge">Guest favorite</span>` : ""}
  </div>
  ${renderGallery(slug, photosFile, label)}
  <div class="listing__body">
    <div class="listing__main">
      <section>
        <h2>Entire ${escapeHtml(data.propertyType?.replace(/^Entire /i, "") || "place")}</h2>
        <p class="summary__line">${escapeHtml(summaryLine(data))}</p>
        ${
          data.host
            ? `<div class="host-blurb">
                Hosted by ${escapeHtml(data.host.name)}
                ${data.host.isSuperhost ? `<span class="superhost">★ Superhost</span>` : ""}
              </div>`
            : ""
        }
      </section>
      ${renderHighlights(data.highlights)}
      ${renderDescription(data.description)}
      ${renderSleeping(data.sleeping)}
      ${renderAmenities(data.amenityGroups)}
      ${renderReviews(data, reviewsFile.reviews)}
    </div>
    ${renderBookCard(data)}
  </div>
  ${renderPhotosModal(photosFile, label)}
</main>
${renderMobileBookBar(data)}
${renderFooter()}
${renderJsonLd(data, slug)}
${renderModalScript()}
</body>
</html>`;

  const outDir = path.join(SITE_DIR, slug);
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, "index.html"), html);
  console.log(`Built site/${slug}/index.html (${(html.length / 1024).toFixed(0)}KB)`);
}

async function buildHomepage() {
  const cards = [];
  for (const slug of SLUGS) {
    const data = JSON.parse(await fs.readFile(path.join(DATA_DIR, `${slug}.json`), "utf8"));
    cards.push({
      slug,
      label: PROPERTY_LABEL[slug],
      starRating: data.starRating,
      reviewCount: data.reviewCount,
      meta: HOMEPAGE_META[slug],
      blurb: HOMEPAGE_BLURB[slug],
    });
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Kaleidoscope Hill — Cabin & Barn near Yosemite, Mariposa CA</title>
  <meta name="description" content="A cabin and a barn on Kaleidoscope Hill in Mariposa, California — about an hour from Yosemite National Park. Two private retreats, both available on Airbnb." />
  <link rel="icon" href="/assets/images/logo.png" type="image/png" />
  <link rel="apple-touch-icon" href="/assets/images/logo.png" />
  <link rel="stylesheet" href="/assets/css/site.css" />
  <link rel="canonical" href="https://discohill.com/" />
  <meta property="og:title" content="Kaleidoscope Hill" />
  <meta property="og:description" content="Two private retreats near Yosemite — book the Cabin or the Barn." />
  <meta property="og:image" content="/assets/images/cabin/01.jpg" />
  <meta property="og:type" content="website" />
</head>
<body>
  <main class="home">
    <img class="home__logo" src="/assets/images/logo.png" alt="Kaleidoscope Hill logo" />
    <h1 class="home__title">Kaleidoscope Hill</h1>
    <p class="home__subtitle">
      Two private stays in the Sierra Foothills of Mariposa, California &mdash;
      about an hour from the south entrance of Yosemite National Park.
    </p>

    <div class="home__choices">
      ${cards
        .map(
          (c) => `<a class="home__card" href="/${c.slug}/">
        <img class="home__card-photo" src="/assets/images/${c.slug}/01.jpg" alt="${escapeHtml(c.label)} at Kaleidoscope Hill" loading="lazy" />
        <div class="home__card-body">
          <h2 class="home__card-name">${escapeHtml(c.label)}</h2>
          <p class="home__card-meta">
            <span class="star">★ ${c.starRating ?? "—"}</span> · ${c.reviewCount ?? "—"} reviews · ${escapeHtml(c.meta)}
          </p>
          <p class="home__card-blurb">${escapeHtml(c.blurb)}</p>
        </div>
      </a>`,
        )
        .join("\n      ")}
    </div>
  </main>
${renderFooter()}
</body>
</html>`;

  await fs.writeFile(path.join(SITE_DIR, "index.html"), html);
  console.log(`Built site/index.html (${(html.length / 1024).toFixed(0)}KB)`);
}

async function main() {
  const args = process.argv.slice(2);
  const targets = args.length > 0 ? args : SLUGS;
  for (const slug of targets) {
    if (!SLUGS.includes(slug)) {
      console.error(`Unknown listing: ${slug}`);
      process.exit(1);
    }
    await buildListing(slug);
  }
  // Always rebuild homepage when any listing changes — review counts may have moved.
  await buildHomepage();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
