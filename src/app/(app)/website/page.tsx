import Link from 'next/link'
import { requireContext } from '@/server/context'
import { listPages, listPosts } from '@/server/modules/website/service'
import { PageHeader } from '@/components/page-header'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { EmptyState } from '@/components/ui/states'
import { CreatePageForm, CreatePostForm, EnsureHomeButton } from './forms'

export const metadata = { title: 'School website' }

export default async function WebsiteAdminPage() {
  const ctx = await requireContext('website.view')
  const [pages, posts] = await Promise.all([listPages(ctx), listPosts(ctx)])

  return (
    <div className="space-y-6">
      <PageHeader
        title="School website"
        description="Pages and news published on your school host. Public site: /site-pages"
        actions={
          <Link href="/site-pages" className="text-sm text-[var(--brand-600)] hover:underline">
            View public site
          </Link>
        }
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Pages · {pages.length}</CardTitle>
            {ctx.can('website.manage') ? <EnsureHomeButton /> : null}
          </CardHeader>
          <CardContent className="space-y-2">
            {pages.length === 0 ? (
              <EmptyState title="No pages" description="Create a home page to get started." />
            ) : (
              pages.map((page) => (
                <Link
                  key={page.id}
                  href={`/website/pages/${page.id}`}
                  className="flex items-center justify-between rounded-[var(--radius-sm)] border border-line p-3 hover:bg-surface-2"
                >
                  <div>
                    <p className="text-sm font-medium text-ink">{page.title}</p>
                    <p className="text-xs text-ink-subtle">/{page.slug} · {page._count.blocks} blocks</p>
                  </div>
                  <Badge tone={page.isPublished ? 'success' : 'neutral'}>
                    {page.isPublished ? 'Live' : 'Draft'}
                  </Badge>
                </Link>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>News · {posts.length}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {posts.length === 0 ? (
              <p className="text-sm text-ink-muted">No posts yet.</p>
            ) : (
              posts.map((post) => (
                <div key={post.id} className="rounded-[var(--radius-sm)] border border-line p-3">
                  <p className="text-sm font-medium text-ink">{post.title}</p>
                  <p className="text-xs text-ink-subtle">/{post.slug}</p>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {ctx.can('website.manage') ? (
        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>New page</CardTitle>
            </CardHeader>
            <CardContent>
              <CreatePageForm />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>New news post</CardTitle>
            </CardHeader>
            <CardContent>
              <CreatePostForm />
            </CardContent>
          </Card>
        </div>
      ) : null}
    </div>
  )
}
