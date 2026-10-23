import * as React from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  ArrowRight,
  Briefcase,
  Bus,
  CalendarCheck,
  ClipboardList,
  Clock,
  Compass,
  DoorOpen,
  GraduationCap,
  MessageCircle,
  MonitorSmartphone,
  ShieldCheck,
  Wallet,
  type LucideIcon,
} from 'lucide-react'
import { blogCategory, blogCoverUrl, type BlogCategory } from '@/lib/blog'
import type { BlogCard } from '@/server/modules/blog/queries'
import { cn } from '@/lib/utils'

const ICONS: Record<BlogCategory['icon'], LucideIcon> = {
  Wallet,
  DoorOpen,
  CalendarCheck,
  GraduationCap,
  MessageCircle,
  Compass,
  ClipboardList,
  Bus,
  MonitorSmartphone,
  ShieldCheck,
  Briefcase,
}

export function CategoryIcon({ category, className }: { category: BlogCategory; className?: string }) {
  const Icon = ICONS[category.icon]
  return <Icon className={className} aria-hidden />
}

export function formatPostDate(date: Date | null) {
  if (!date) return ''
  return new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Asia/Kolkata',
  }).format(date)
}

/**
 * Cover art: AI hero photo when the post has one, otherwise category colour + icon.
 */
export function BlogCover({
  categoryKey,
  slug,
  coverImageKey,
  alt,
  size = 'card',
  priority,
  className,
}: {
  categoryKey: string
  slug?: string
  coverImageKey?: string | null
  alt?: string | null
  size?: 'card' | 'hero'
  priority?: boolean
  className?: string
}) {
  const category = blogCategory(categoryKey)
  const hero = size === 'hero'
  const photo = slug ? blogCoverUrl(slug, coverImageKey) : null

  if (photo) {
    return (
      <div className={cn('relative isolate overflow-hidden bg-[var(--page)]', className)}>
        <Image
          src={photo}
          alt={alt || category.label}
          fill
          priority={priority}
          sizes={hero ? '(min-width: 1024px) 960px, 100vw' : '(min-width: 1024px) 400px, 100vw'}
          className="object-cover"
        />
      </div>
    )
  }

  return (
    <div
      className={cn('relative isolate overflow-hidden', className)}
      style={{ backgroundColor: category.tint }}
      aria-hidden
    >
      <div
        className="absolute inset-0 -z-10 opacity-[0.55]"
        style={{
          backgroundImage: `radial-gradient(${category.accent}26 1.2px, transparent 1.2px)`,
          backgroundSize: hero ? '22px 22px' : '18px 18px',
        }}
      />
      <div
        className="absolute -right-[18%] -top-[40%] -z-10 aspect-square w-[75%] rounded-full"
        style={{ border: `1px solid ${category.accent}22`, boxShadow: `0 0 0 28px ${category.accent}0a, 0 0 0 64px ${category.accent}07` }}
      />
      <div
        className="absolute -bottom-[45%] -left-[12%] -z-10 aspect-square w-[55%] rounded-full"
        style={{ background: `radial-gradient(circle, ${category.accent}1f, transparent 68%)` }}
      />
      <div className="flex h-full w-full items-center justify-center">
        <div
          className={cn(
            'grid place-items-center rounded-2xl bg-white',
            hero ? 'size-24 sm:size-28' : 'size-16',
          )}
          style={{
            color: category.accent,
            boxShadow: `0 1px 2px ${category.accent}1a, 0 12px 32px -12px ${category.accent}55`,
          }}
        >
          <CategoryIcon
            category={category}
            className={hero ? 'size-11 sm:size-12' : 'size-7'}
          />
        </div>
      </div>
    </div>
  )
}

export function CategoryPill({ categoryKey, link = true }: { categoryKey: string; link?: boolean }) {
  const category = blogCategory(categoryKey)
  const body = (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-semibold"
      style={{ color: category.accent, backgroundColor: category.tint }}
    >
      <CategoryIcon category={category} className="size-3.5" />
      {category.label}
    </span>
  )
  return link ? (
    <Link href={`/blog/category/${category.key}`} className="relative z-10 inline-flex">
      {body}
    </Link>
  ) : (
    body
  )
}

export function PostMeta({ date, minutes, className }: { date: Date | null; minutes: number; className?: string }) {
  return (
    <p className={cn('flex flex-wrap items-center gap-x-3 gap-y-1 text-[13.5px] text-[var(--text-subtle)]', className)}>
      {date ? <time dateTime={date.toISOString()}>{formatPostDate(date)}</time> : null}
      <span aria-hidden>·</span>
      <span className="inline-flex items-center gap-1">
        <Clock className="size-3.5" aria-hidden />
        {minutes} min read
      </span>
    </p>
  )
}

export function PostCard({ post, headingLevel = 'h3' }: { post: BlogCard; headingLevel?: 'h2' | 'h3' }) {
  const Heading = headingLevel
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-xl border border-[var(--rule)] bg-white transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[var(--rule-strong)] hover:shadow-[0_18px_40px_-24px_rgba(10,16,36,0.35)]">
      <BlogCover
        categoryKey={post.category}
        slug={post.slug}
        coverImageKey={post.coverImageKey}
        alt={post.coverImageAlt}
        className="aspect-[16/9]"
      />
      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <CategoryPill categoryKey={post.category} />
        <Heading className="mt-3 text-[18px] font-semibold leading-[1.35] text-[var(--text)]">
          <Link href={`/blog/${post.slug}`} className="after:absolute after:inset-0">
            {post.title}
          </Link>
        </Heading>
        <p className="muted mt-2 line-clamp-3 text-[15px] leading-[1.6]">{post.excerpt}</p>
        <div className="mt-auto flex items-center justify-between pt-5">
          <PostMeta date={post.publishedAt} minutes={post.readingMinutes} />
          <ArrowRight
            className="size-4 text-[var(--text-subtle)] transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-[var(--text)]"
            aria-hidden
          />
        </div>
      </div>
    </article>
  )
}
