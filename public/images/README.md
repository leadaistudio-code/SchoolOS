# Website images

Anything in `public/` is served from the root of the site: a file at
`public/images/hero/corridor.avif` is reachable at `/images/hero/corridor.avif`.

The site currently ships without photography — every visual on it is either the
real product rendered live or inline SVG — so nothing here is required for the
site to work. These folders are where photography goes when you have it.

`IMAGE-ASSET-PLAN.md` in the repository root specifies each image: subject,
dimensions, composition, the prompt to generate it, alt text and the mobile
crop. The filenames below match that document.

```
images/
  hero/         corridor.avif        homepage hero, right edge
  parents/      pickup.avif          parent checking a phone at pickup
  solutions/    private.avif         solution page openings, one each
                international.avif
                preschool.avif
                group.avif
  cta/          campus.avif          closing call to action, behind a navy overlay
  about/        office.avif          a school office, deliberately unglamorous
  product/      tracking.avif        screenshots you capture from the running app
                collect.avif
```

Two rules from the asset plan worth repeating here:

- **No photograph goes behind body text.** The only overlay is the closing CTA,
  and it is dark enough to keep contrast above 4.5:1.
- **Ship AVIF with a WebP fallback**, both under 200 KB, and always give
  `next/image` an explicit width and height so the page does not shift while
  it loads.
