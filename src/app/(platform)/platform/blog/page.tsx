import { ExternalLink } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent } from '@/components/ui/card'
import { Badge, type BadgeTone } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { Table, TableWrap, TBody, TD, TH, THead, TR } from '@/components/ui/table'
import { requirePlatformContext } from '@/server/context'
import { prisma } from '@/server/db/prisma'
import { assistantConfigured } from '@/server/assistant/providers'
import { blogCategory } from '@/lib/blog'
import { env } from '@/lib/env'
import { GenerateButton, PostControls } from './controls'

export const metadata = { title: 'Blog' }

const STATUS: Record<string, { label: string; tone: BadgeTone }> = {
  PUBLISHED: { label: 'Published', tone: 'success' },
  DRAFT: { label: 'Draft', tone: 'warning' },
  ARCHIVED: { label: 'Unpublished', tone: 'neutral' },
}

function siteOrigin() {
  const domain = env().APP_ROOT_DOMAIN
  return domain.startsWith('lvh.me') || domain.startsWith('localhost') ? `http://${domain}` : `https://${domain}`
}

/**
 * The marketing blog's back office.
 *
 * Posts arrive once a day from the scheduler. Anything that failed a quality
 * check is held here as a draft with the reason, and nothing reaches the
 * website without either passing those checks or being published by hand.
 */
export default async function PlatformBlogPage() {
  await requirePlatformContext('platform.crm')
  const posts = await prisma.blogPost.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      slug: true,
      title: true,
      category: true,
      status: true,
      reviewNote: true,
      wordCount: true,
      model: true,
      publishedAt: true,
      createdAt: true,
    },
  })
  const configured = assistantConfigured()
  const published = posts.filter((p) => p.status === 'PUBLISHED').length
  const drafts = posts.filter((p) => p.status === 'DRAFT').length
  const origin = siteOrigin()

  return (
    <div className="space-y-5">
      <PageHeader
        title="Blog"
        description={`One article is written and published every morning. ${published} published · ${drafts} waiting for review.`}
        actions={<GenerateButton disabled={!configured} />}
      />

      {!configured ? (
        <Card>
          <CardContent className="text-sm text-ink-muted">
            AI is not configured on this deployment (AI_DRIVER and AI_API_KEY), so no posts can be written.
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardContent className="p-0">
          {posts.length === 0 ? (
            <EmptyState title="No posts yet" description="The first article appears after the next scheduled run, or generate one now." />
          ) : (
            <TableWrap>
              <Table>
                <THead>
                  <TR>
                    <TH>Article</TH>
                    <TH>Category</TH>
                    <TH>Status</TH>
                    <TH className="text-right">Words</TH>
                    <TH className="text-right">Date</TH>
                    <TH className="text-right">Actions</TH>
                  </TR>
                </THead>
                <TBody>
                  {posts.map((post) => {
                    const status = STATUS[post.status] ?? STATUS.DRAFT!
                    const when = post.publishedAt ?? post.createdAt
                    return (
                      <TR key={post.id}>
                        <TD className="max-w-xl">
                          <div className="flex items-start gap-1.5">
                            <span className="font-medium text-ink">{post.title}</span>
                            {post.status === 'PUBLISHED' ? (
                              <a
                                href={`${origin}/blog/${post.slug}`}
                                target="_blank"
                                rel="noreferrer"
                                className="mt-0.5 shrink-0 text-ink-subtle hover:text-ink"
                                aria-label="Open on the website"
                              >
                                <ExternalLink className="size-3.5" aria-hidden />
                              </a>
                            ) : null}
                          </div>
                          {post.reviewNote ? (
                            <p className="mt-1 text-xs text-[var(--warning)]">{post.reviewNote}</p>
                          ) : null}
                        </TD>
                        <TD className="whitespace-nowrap text-ink-muted">{blogCategory(post.category).label}</TD>
                        <TD>
                          <Badge tone={status.tone}>{status.label}</Badge>
                        </TD>
                        <TD className="text-right tabular-nums text-ink-muted">{post.wordCount.toLocaleString('en-IN')}</TD>
                        <TD className="whitespace-nowrap text-right text-ink-muted">
                          {when.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}
                        </TD>
                        <TD>
                          <PostControls id={post.id} status={post.status} />
                        </TD>
                      </TR>
                    )
                  })}
                </TBody>
              </Table>
            </TableWrap>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
