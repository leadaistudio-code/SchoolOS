/* eslint-disable no-console */
import 'dotenv/config'
import { prisma } from '../src/server/db/prisma'
import { attachCoverToPost } from '../src/server/modules/blog/cover-image'

/** Usage: npx tsx scripts/blog-cover-one.ts <slug> */
async function main() {
  const slug = process.argv[2]
  if (!slug) {
    console.error('Usage: npx tsx scripts/blog-cover-one.ts <slug>')
    process.exit(1)
  }

  const post = await prisma.blogPost.findUnique({
    where: { slug },
    select: { id: true, slug: true, title: true, category: true, excerpt: true },
  })
  if (!post) {
    console.error('Post not found:', slug)
    process.exit(1)
  }

  const key = await attachCoverToPost(post)
  console.log(JSON.stringify(key ? { ok: true, coverImageKey: key } : { ok: false }, null, 2))
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
