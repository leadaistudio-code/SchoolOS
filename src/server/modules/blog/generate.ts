import sanitizeHtml from 'sanitize-html'
import { z } from 'zod'
import { prisma } from '@/server/db/prisma'
import { assistantConfigured, blogModel } from '@/server/assistant/providers'
import { zodToJsonSchema } from '@/server/assistant/json-schema'
import { ALL_MODULES } from '@/content/site/modules'
import {
  BLOG_CATEGORIES,
  BLOG_INTERNAL_LINKS,
  BLOG_TOPICS,
  blogCategory,
  type BlogCategory,
  type BlogTopic,
} from '@/lib/blog'

/**
 * The daily article.
 *
 * One post per India day, written by the configured model and published only if
 * it passes the checks below. The prompt asks for honesty; the checks are what
 * hold when the model ignores it:
 *
 *   - No invented evidence. "Studies show", surveys, made-up percentages and
 *     quotes are rejected, because a school leader acting on a fake statistic
 *     is worse off than one who read nothing.
 *   - Product mentions are limited to modules that exist today.
 *   - HTML is reduced to a short allowlist, and links survive only if they point
 *     at a real page on this site.
 *   - A post that still fails after one rewrite is saved as a DRAFT with the
 *     reason, for a person to read in the platform console. Nothing broken is
 *     ever published to keep a streak going.
 */

const IST_OFFSET_MS = 330 * 60 * 1000
const DAY_MS = 86_400_000

const articleSchema = z.object({
  title: z.string().describe('Headline, 45-70 characters, containing the primary keyword naturally.'),
  metaTitle: z.string().describe('SEO title, at most 60 characters. May equal the headline if short enough.'),
  metaDescription: z.string().describe('Search snippet, 130-160 characters, with the primary keyword and a reason to click.'),
  slug: z.string().describe('URL slug: lowercase words joined by hyphens, 3-8 words, includes the primary keyword.'),
  excerpt: z.string().describe('Two sentences for the blog index card, at most 240 characters.'),
  keywords: z.array(z.string()).describe('4-8 search phrases this article should rank for, primary first.'),
  takeaways: z.array(z.string()).describe('3-5 one-sentence key takeaways a busy principal can act on.'),
  bodyHtml: z.string().describe('The article body as HTML. Allowed tags only: h2, h3, p, ul, ol, li, strong, em, blockquote, table, thead, tbody, tr, th, td, a.'),
  faq: z
    .array(z.object({ question: z.string(), answer: z.string() }))
    .describe('4-5 questions a school leader would actually search, each answered in 2-4 sentences.'),
})

type Article = z.infer<typeof articleSchema>

export type BlogRunResult =
  | { status: 'skipped'; reason: string }
  | { status: 'published' | 'held'; id: string; slug: string; title: string; reason?: string }

function istDayStart(now = new Date()): Date {
  const ist = now.getTime() + IST_OFFSET_MS
  return new Date(Math.floor(ist / DAY_MS) * DAY_MS - IST_OFFSET_MS)
}

function categoryForToday(now = new Date()): BlogCategory {
  const day = Math.floor((now.getTime() + IST_OFFSET_MS) / DAY_MS)
  return BLOG_CATEGORIES[day % BLOG_CATEGORIES.length]!
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80)
    .replace(/-$/, '')
}

const ALLOWED_PATHS = new Set(BLOG_INTERNAL_LINKS.map((l) => l.path))

/** Reduce model HTML to the article allowlist and give every h2 an anchor. */
export function cleanArticleHtml(html: string): string {
  const cleaned = sanitizeHtml(html.replace(/<h1(\s[^>]*)?>/gi, '<h2>').replace(/<\/h1>/gi, '</h2>'), {
    allowedTags: ['h2', 'h3', 'p', 'ul', 'ol', 'li', 'strong', 'em', 'blockquote', 'table', 'thead', 'tbody', 'tr', 'th', 'td', 'a', 'br'],
    allowedAttributes: { a: ['href'] },
    transformTags: {
      a: (tagName, attribs): sanitizeHtml.Tag => {
        const href = (attribs.href ?? '').split('#')[0]!.replace(/\/$/, '') || '/'
        return ALLOWED_PATHS.has(href) ? { tagName, attribs: { href } } : { tagName: 'span', attribs: {} }
      },
    },
    exclusiveFilter: (frame) => ['p', 'li', 'h2', 'h3'].includes(frame.tag) && !frame.text.trim(),
  })
  const used = new Set<string>()
  return cleaned.replace(/<h2>([\s\S]*?)<\/h2>/g, (_m, inner: string) => {
    let id = slugify(inner.replace(/<[^>]+>/g, '')) || 'section'
    while (used.has(id)) id = `${id}-x`
    used.add(id)
    return `<h2 id="${id}">${inner}</h2>`
  })
}

export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&(#39|apos);/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const FABRICATION_PATTERNS: { pattern: RegExp; issue: string }[] = [
  { pattern: /\b(stud(y|ies)|surveys?|research|statistics)\s+(show|shows|showed|suggest|suggests|found|finds|reveal|reveals|indicate|indicates)\b/i, issue: 'cites studies, surveys or research that were not supplied' },
  { pattern: /\baccording to (a|an|the|one|recent)\b/i, issue: 'attributes a claim to an unnamed source' },
  { pattern: /\b\d{1,3}(\.\d+)?\s?(%|per ?cent)\s+of\s+(schools|parents|teachers|students|principals|families|institutions)\b/i, issue: 'states a population percentage that cannot be verified' },
  { pattern: /\b(as an ai|language model)\b/i, issue: 'mentions being an AI' },
  { pattern: /\bin today'?s (fast-paced|digital|modern|ever-changing)\b/i, issue: 'opens with a cliché' },
  { pattern: /[“"][^”"]{20,}[”"]\s*(—|-|,)?\s*(says|said|explains|notes)\b/i, issue: 'includes a quotation attributed to a person' },
]

export function qualityIssues(article: Article, html: string): string[] {
  const issues: string[] = []
  const text = plainText(html)
  const words = text.split(' ').length
  if (words < 1000) issues.push(`the body is ${words} words; it must be at least 1,300`)
  if (words > 3200) issues.push(`the body is ${words} words; keep it under 2,400`)
  const h2 = (html.match(/<h2/g) ?? []).length
  if (h2 < 4) issues.push(`only ${h2} H2 sections; use 5-8`)
  if (!/<(ul|ol)>/.test(html)) issues.push('no list; include at least one checklist or numbered steps')
  if (article.title.length < 30 || article.title.length > 80) issues.push('the title must be 45-70 characters')
  if (article.metaTitle.length > 65) issues.push('the metaTitle must be at most 60 characters')
  if (/<table[\s\S]*?MyCampusView[\s\S]*?<\/table>/i.test(html)) issues.push('MyCampusView appears in a table')
  if (article.metaDescription.length < 110 || article.metaDescription.length > 170) issues.push('the meta description must be 130-160 characters')
  if (article.faq.length < 3) issues.push('include 4-5 FAQ entries')
  if (article.takeaways.length < 3) issues.push('include 3-5 takeaways')
  const all = [text, article.title, article.excerpt, ...article.faq.flatMap((f) => [f.question, f.answer])].join('\n')
  for (const { pattern, issue } of FABRICATION_PATTERNS) {
    if (pattern.test(all)) issues.push(issue)
  }
  return issues
}

function systemPrompt(params: {
  category: BlogCategory
  topic: BlogTopic | null
  avoidTitles: string[]
}): string {
  const modules = ALL_MODULES.filter((m) => m.status === 'available').map((m) => m.name)
  const links = BLOG_INTERNAL_LINKS.map((l) => `- ${l.path} — ${l.label}`).join('\n')
  const brief = params.topic
    ? `Topic: ${params.topic.topic}\nPrimary keyword: "${params.topic.keyword}"`
    : `Choose a specific, practical topic in this category that a school leader would search for, with a clear primary keyword. It must not overlap with any title listed below.`

  return `You write the blog for MyCampusView, school management software used by private K-12 schools, international schools, preschools and school groups, mostly in India.

# Reader
Principals, school owners, administrators, accountants and coordinators. Busy, practical, experienced. They want something they can use this week, not theory.

# This article
Category: ${params.category.label} — ${params.category.blurb}
${brief}

# What makes it good
- Open with the real problem in the reader's day, in two or three short paragraphs. Use the primary keyword in the first 100 words.
- 5-8 H2 sections, H3s where they help. Use the primary keyword in at least one H2, naturally.
- Concrete: steps, checklists, sample wording (e.g. a message template a school could copy), a simple table where a comparison helps.
- Indian context where it fits (₹, CBSE/ICSE/state boards, WhatsApp, academic year starting around April), but stay useful for schools anywhere.
- British spelling. Plain, warm, confident sentences. No filler, no hype, no emojis.
- Sentence case for the title and every heading ("How to plan the admission season", not "How To Plan The Admission Season").
- 1,300-1,800 words in the body.
- End with a short "Where to start" section of two or three first actions.

# Honesty rules — these are checked automatically and the article is rejected if broken
- Do not invent statistics, percentages of schools/parents, surveys, studies, research findings, or quotes. Do not write "studies show" or "according to".
- Do not name real schools, real people, or competitor products. No case studies or testimonials.
- Do not state specific laws, rule numbers, deadlines or fees from regulators. If regulation matters, say to check the current guidance from the board or state authority.
- MyCampusView may be mentioned at most twice, in running prose, only where it genuinely helps, and only for these capabilities that exist today: ${modules.join(', ')}. Never claim anything else about the product. Never put MyCampusView in a table, comparison or feature list — describe tools generically there ("a school management system").

# Formatting
- Return HTML for the body using only: h2, h3, p, ul, ol, li, strong, em, blockquote, table, thead, tbody, tr, th, td, a. No h1 (the page renders the title), no inline styles, no images.
- You may include one or two internal links, only to these paths:
${links}
- Do not include the FAQ or takeaways in the body; return them in their own fields.
${params.avoidTitles.length ? `\n# Already published — do not repeat these topics or titles\n${params.avoidTitles.map((t) => `- ${t}`).join('\n')}` : ''}

Call publish_article exactly once.`
}

/** Shorten at a word boundary, so a search result never ends mid-word. */
function clip(text: string, max: number): string {
  const clean = text.trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max + 1).replace(/\s+\S*$/, '').replace(/[\s,:;–—-]+$/, '')
}

function parseArticle(json: string): Article | null {
  try {
    const raw = JSON.parse(json) as unknown
    const parsed = articleSchema.safeParse(raw)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

async function uniqueSlug(base: string): Promise<string> {
  const root = slugify(base) || `school-article-${Date.now()}`
  let slug = root
  for (let n = 2; await prisma.blogPost.findUnique({ where: { slug }, select: { id: true } }); n++) {
    slug = `${root}-${n}`
  }
  return slug
}

export async function runDailyBlog(options: { force?: boolean } = {}): Promise<BlogRunResult> {
  if (!assistantConfigured()) {
    return { status: 'skipped', reason: 'AI is not configured (AI_DRIVER / AI_API_KEY).' }
  }

  if (!options.force) {
    const today = await prisma.blogPost.findFirst({
      where: { createdAt: { gte: istDayStart() } },
      select: { slug: true },
    })
    if (today) return { status: 'skipped', reason: `Already wrote today: ${today.slug}` }
  }

  const past = await prisma.blogPost.findMany({
    select: { title: true, topicKey: true, category: true },
    orderBy: { createdAt: 'desc' },
    take: 400,
  })
  const usedTopics = new Set(past.map((p) => p.topicKey).filter(Boolean))

  let category = categoryForToday()
  let topic = BLOG_TOPICS.find((t) => t.category === category.key && !usedTopics.has(t.key)) ?? null
  if (!topic) {
    const fallback = BLOG_TOPICS.find((t) => !usedTopics.has(t.key))
    if (fallback) {
      topic = fallback
      category = blogCategory(fallback.category)
    }
  }

  const model = blogModel()
  const tool = {
    name: 'publish_article',
    description: 'Return the finished article. Call this exactly once.',
    parameters: zodToJsonSchema(articleSchema),
  }
  const system = systemPrompt({ category, topic, avoidTitles: past.slice(0, 120).map((p) => p.title) })

  let article: Article | null = null
  let html = ''
  let issues: string[] = ['the model returned nothing usable']
  const turns: { role: 'user'; text: string }[] = [{ role: 'user', text: 'Write the article now.' }]

  for (let attempt = 0; attempt < 2; attempt++) {
    const result = await model.turn({
      system,
      turns,
      tools: [tool],
      onText: () => {},
      stream: false,
      toolChoice: 'publish_article',
      maxOutputTokens: 9000,
    })
    const call = result.toolCalls.find((c) => c.name === 'publish_article')
    const candidate = call ? parseArticle(call.argumentsJson) : null
    if (candidate) {
      article = candidate
      html = cleanArticleHtml(candidate.bodyHtml)
      issues = qualityIssues(candidate, html)
      if (issues.length === 0) break
    }
    turns.push({
      role: 'user',
      text: `Rewrite the whole article and call publish_article again. Fix these problems: ${issues.join('; ')}.`,
    })
  }

  if (!article) {
    throw new Error(`Blog generation failed on ${model.model}: ${issues.join('; ')}`)
  }

  const words = plainText(html).split(' ').length
  const publish = issues.length === 0
  const post = await prisma.blogPost.create({
    data: {
      slug: await uniqueSlug(article.slug || article.title),
      title: article.title.trim(),
      metaTitle: clip(article.metaTitle || article.title, 65),
      metaDescription: clip(article.metaDescription, 170),
      excerpt: clip(article.excerpt, 300),
      category: category.key,
      keywords: article.keywords.map((k) => k.trim()).filter(Boolean).slice(0, 8),
      takeaways: article.takeaways.map((t) => plainText(t)).filter(Boolean).slice(0, 5),
      contentHtml: html,
      faq: article.faq
        .map((f) => ({ question: plainText(f.question), answer: plainText(f.answer) }))
        .filter((f) => f.question && f.answer)
        .slice(0, 6),
      wordCount: words,
      readingMinutes: Math.max(3, Math.round(words / 220)),
      status: publish ? 'PUBLISHED' : 'DRAFT',
      publishedAt: publish ? new Date() : null,
      reviewNote: publish ? null : `Held for review: ${issues.join('; ')}`,
      topicKey: topic?.key ?? null,
      model: model.model,
    },
    select: { id: true, slug: true, title: true },
  })

  return publish
    ? { status: 'published', ...post }
    : { status: 'held', ...post, reason: issues.join('; ') }
}
