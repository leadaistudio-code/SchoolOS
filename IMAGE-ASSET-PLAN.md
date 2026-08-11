# Image asset plan

The website ships without photography. Every visual on it today is either the
real product rendered live, or drawn as inline SVG. Nothing is a placeholder
rectangle, so the site is presentable as it stands — but photography would make
four sections noticeably warmer, and this is the specification for it.

Two rules apply to everything below.

**No photograph sits behind body text.** Where an image and text share a
section, they occupy separate columns. The only exception is the closing CTA,
where a navy overlay at 78% opacity carries white type at 4.5:1 or better.

**No stock photography of American classrooms.** The primary market is India.
Uniforms, buildings, signage and skin tones should look like the schools that
will actually buy this. International-school pages can be visibly more mixed.

---

## Where photography goes

### 1. Homepage hero — no photograph

The hero has **no image slot**, and this is a decision rather than an omission.
The right half of the fold is the administrator dashboard, rendered live from the
application's own components. A photograph competing with it in the same fold
weakens the one thing that fold has to establish — that this is real software.

An earlier revision placed a cut-out PNG beside the headline with an infinite
float animation and a hover scale. Both are gone: a decorative element that
moves for no reason is the clearest tell of a generated page, and the files
(`public/hero_asset.png` and its three siblings) are no longer referenced by any
component.

If the homepage needs warmth later, the place for it is a full-bleed band between
the parents section and the integrations section, at 1600 × 500, with no text over
it — not the fold.

### 2. Parents section

| | |
|---|---|
| Page | `/` |
| Section | `Parents`, `src/components/site/home/parents.tsx` |
| Dimensions | 1200 × 1500 (portrait) |
| Subject | A parent looking at a phone outside a school gate at pickup time |
| Style | Documentary, candid, warm. Not a posed stock smile. Indian setting, ordinary clothing |
| Composition | Subject on the right third, phone screen not legible. Room at the top left for the phone mock to overlap |
| Prompt | *Candid documentary photograph of an Indian mother in her thirties checking her phone while waiting outside a school gate in the afternoon, soft natural light, shallow depth of field, warm tones, other parents blurred in the background, vertical* |
| Alt | `Parent checking her phone outside the school gate at pickup time` |
| Mobile | Crop to 4:5, subject centred, placed above the phone panel |

### 3. Solution pages — page opening

Four images, one per page, same treatment: a 1600 × 900 band below the
`PageIntro`, full-bleed, 320px tall, no text over it.

| Page | Subject | Prompt |
|---|---|---|
| `/solutions/private-schools` | Assembly or corridor between periods | *Indian private school students in uniform walking between classrooms, mid-morning, natural light, documentary style, no identifiable faces, wide* |
| `/solutions/international-schools` | Group work in a bright classroom | *Multicultural secondary students working together around a table in a bright modern classroom, mixed nationalities, natural light, documentary, wide* |
| `/solutions/preschools` | Early-years room, low furniture, no faces | *Empty bright preschool classroom with small colourful chairs, natural light, warm and tidy, no children visible, wide* |
| `/solutions/multi-campus` | School building exterior from across a field | *Modern Indian school building exterior seen across a sports field, late afternoon light, wide, architectural photography* |

Alt text: describe what is in the frame, not the page it decorates.
Mobile: crop to 3:2, height 200px.

### 4. Closing CTA

| | |
|---|---|
| Component | `ClosingCta`, `src/components/site/cta.tsx` |
| Dimensions | 2000 × 1000 |
| Subject | School campus at the end of the day, wide, buildings and sky |
| Style | Calm, dusk or late afternoon, low contrast so an overlay works |
| Composition | Horizon low. Detail concentrated in the lower third; the upper two-thirds carry the heading |
| Prompt | *Wide photograph of an Indian school campus in late afternoon light, low buildings, trees, empty grounds, calm and quiet, muted colour, architectural, no people* |
| Alt | `""` — decorative |
| Overlay | `linear-gradient(180deg, rgba(17,26,50,0.86), rgba(17,26,50,0.92))` |
| Mobile | 3:4 crop, focal point centre |

### 5. About page

| | |
|---|---|
| Page | `/about` |
| Dimensions | 1600 × 900 |
| Subject | A school office — filing, a desk, a counter. The problem the product replaces |
| Style | Honest, unstyled, slightly cluttered. This one should not look aspirational |
| Prompt | *Documentary photograph of a busy Indian school administrative office, paper files and registers on a counter, a desktop computer, fluorescent light, no identifiable faces, wide* |
| Alt | `A school administrative office with paper registers and files` |

---

## Product screenshots

The site renders the real application components rather than screenshots, so
none are required. Two places would benefit from a genuine capture, because
they show a screen in its full context rather than a panel of it:

| Where | Screen | How to capture |
|---|---|---|
| `/product`, below the dashboard render | `/transport/tracking` with a trip running | 1440 × 900 viewport, light theme, demo tenant, full page |
| `/school-erp`, fee section | `/finance/collect` mid-collection | 1440 × 900, light theme |

Capture at 2× device pixel ratio, save as AVIF and WebP, and drop into
`public/images/product/`. Each render component takes an optional `image` prop
so a capture replaces it without touching the layout.

---

## Where files go

```
public/images/
  hero/           corridor.avif  corridor.webp
  parents/        pickup.avif    pickup.webp
  solutions/      private.avif   international.avif  preschool.avif  group.avif
  cta/            campus.avif    campus.webp
  about/          office.avif
  product/        tracking.avif  collect.avif
```

Serve through `next/image` with `sizes` set per breakpoint, `priority` only on
the hero, and explicit `width`/`height` on every image so nothing shifts as the
page loads.

---

## Licensing

Whatever is used must be licensed for commercial use. Commissioned photography
at two or three real schools would be better than any stock library — it would
show actual uniforms and actual buildings, which is the whole point of the
first rule above. If schools are photographed, written consent is needed from
the school and from any identifiable person, and images of children should be
avoided entirely unless consent is explicit and documented.
