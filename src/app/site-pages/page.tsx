import Link from 'next/link'
import { redirect } from 'next/navigation'
import { resolveTenant } from '@/server/tenant'
import { getPublicPage, getPublicSite } from '@/server/modules/website/service'

export const metadata = { title: 'School site' }

export default async function PublicSiteHome({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const tenant = await resolveTenant()
  if (!tenant) redirect('/')

  const params = await searchParams
  const site = await getPublicSite(tenant.id)
  const slug = params.page ?? 'home'
  const page = (await getPublicPage(tenant.id, slug)) ?? site.pages[0] ?? null

  const brand = tenant.school?.primaryHex ?? '#E41F07'
  const name = tenant.school?.name ?? tenant.name

  return (
    <div className="min-h-dvh bg-white text-slate-900">
      <header className="border-b border-slate-200">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-center gap-3">
            {tenant.school?.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={tenant.school.logoUrl} alt="" className="h-9 w-9 object-contain" />
            ) : (
              <span
                className="grid size-9 place-items-center rounded-md text-sm font-semibold text-white"
                style={{ background: brand }}
              >
                {name.charAt(0)}
              </span>
            )}
            <span className="font-semibold">{name}</span>
          </div>
          <nav className="flex flex-wrap gap-4 text-sm">
            {site.pages
              .filter((p) => p.showInNav)
              .map((p) => (
                <Link
                  key={p.id}
                  href={`/site-pages?page=${p.slug}`}
                  className="text-slate-600 hover:text-slate-900"
                >
                  {p.title}
                </Link>
              ))}
            <Link href="/enquire" className="font-medium" style={{ color: brand }}>
              Enquire
            </Link>
            <Link href="/login" className="text-slate-600 hover:text-slate-900">
              Sign in
            </Link>
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-10">
        {page ? (
          <div className="space-y-10">
            {page.blocks.map((block) => {
              if (block.kind === 'HERO') {
                return (
                  <section key={block.id} className="rounded-2xl px-8 py-12 text-white" style={{ background: brand }}>
                    <h1 className="text-3xl font-semibold tracking-tight">{block.heading ?? page.title}</h1>
                    {block.body ? <p className="mt-3 max-w-2xl text-white/90">{block.body}</p> : null}
                  </section>
                )
              }
              if (block.kind === 'ENQUIRE') {
                return (
                  <section key={block.id} className="rounded-xl border border-slate-200 p-6">
                    <h2 className="text-xl font-semibold">{block.heading ?? 'Enquire'}</h2>
                    {block.body ? <p className="mt-2 text-slate-600">{block.body}</p> : null}
                    <Link
                      href="/enquire"
                      className="mt-4 inline-flex rounded-md px-4 py-2 text-sm font-medium text-white"
                      style={{ background: brand }}
                    >
                      Start an enquiry
                    </Link>
                  </section>
                )
              }
              if (block.kind === 'CTA') {
                return (
                  <section key={block.id} className="rounded-xl bg-slate-50 p-6">
                    <h2 className="text-xl font-semibold">{block.heading}</h2>
                    {block.body ? <p className="mt-2 text-slate-600">{block.body}</p> : null}
                  </section>
                )
              }
              return (
                <section key={block.id}>
                  {block.heading ? <h2 className="text-xl font-semibold">{block.heading}</h2> : null}
                  {block.body ? (
                    <p className="mt-2 whitespace-pre-wrap text-slate-700 leading-relaxed">{block.body}</p>
                  ) : null}
                </section>
              )
            })}
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-300 p-10 text-center">
            <h1 className="text-2xl font-semibold">{name}</h1>
            <p className="mt-2 text-slate-600">
              The public website has no published pages yet. Admins can publish from School Website.
            </p>
            <Link href="/enquire" className="mt-6 inline-block font-medium" style={{ color: brand }}>
              Enquire about admissions
            </Link>
          </div>
        )}

        {site.posts.length > 0 ? (
          <section className="mt-14">
            <h2 className="text-lg font-semibold">News</h2>
            <ul className="mt-4 space-y-4">
              {site.posts.map((post) => (
                <li key={post.id} className="border-t border-slate-200 pt-4">
                  <p className="font-medium">{post.title}</p>
                  {post.excerpt ? <p className="mt-1 text-sm text-slate-600">{post.excerpt}</p> : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </div>
  )
}
