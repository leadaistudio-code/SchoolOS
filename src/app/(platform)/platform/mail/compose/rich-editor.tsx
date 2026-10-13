'use client'

import { useEffect, useRef } from 'react'
import {
  Bold,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  Pilcrow,
  Quote,
  RemoveFormatting,
  Underline,
  Unlink,
} from 'lucide-react'
import { cn } from '@/lib/utils'

type Command = {
  label: string
  icon: React.ComponentType<{ className?: string }>
  run: () => void
}

function exec(command: string, value?: string) {
  // execCommand is deprecated but remains the only cross-browser way to edit
  // a contentEditable selection without shipping an editor framework. The
  // output is re-sanitised on the server, so the editor only shapes intent.
  document.execCommand(command, false, value)
}

function escapeText(text: string) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function RichEditor({
  value,
  onChange,
  placeholder,
  invalid,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
  invalid?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)

  // Only write into the DOM when the value changed from outside (a template
  // was applied); rewriting on every keystroke would throw the caret to the start.
  useEffect(() => {
    const el = ref.current
    if (el && el.innerHTML !== value) el.innerHTML = value
  }, [value])

  const emit = () => onChange(ref.current?.innerHTML ?? '')

  const commands: (Command | 'sep')[] = [
    { label: 'Bold', icon: Bold, run: () => exec('bold') },
    { label: 'Italic', icon: Italic, run: () => exec('italic') },
    { label: 'Underline', icon: Underline, run: () => exec('underline') },
    'sep',
    { label: 'Heading', icon: Heading3, run: () => exec('formatBlock', '<h3>') },
    { label: 'Paragraph', icon: Pilcrow, run: () => exec('formatBlock', '<p>') },
    { label: 'Quote', icon: Quote, run: () => exec('formatBlock', '<blockquote>') },
    'sep',
    { label: 'Bulleted list', icon: List, run: () => exec('insertUnorderedList') },
    { label: 'Numbered list', icon: ListOrdered, run: () => exec('insertOrderedList') },
    'sep',
    {
      label: 'Add link',
      icon: Link2,
      run: () => {
        const url = window.prompt('Link address (https://…, mailto: or tel:)', 'https://')
        if (!url || url === 'https://') return
        const safe = /^(https?:|mailto:|tel:)/i.test(url) ? url : `https://${url}`
        exec('createLink', safe)
      },
    },
    { label: 'Remove link', icon: Unlink, run: () => exec('unlink') },
    { label: 'Clear formatting', icon: RemoveFormatting, run: () => exec('removeFormat') },
  ]

  return (
    <div
      className={cn(
        'overflow-hidden rounded-[var(--radius-sm)] border bg-surface focus-within:border-[var(--brand-500)]',
        invalid ? 'border-[var(--danger)]' : 'border-line-strong',
      )}
    >
      <div role="toolbar" aria-label="Formatting" className="flex flex-wrap items-center gap-0.5 border-b border-line bg-surface-2 px-1.5 py-1">
        {commands.map((c, i) =>
          c === 'sep' ? (
            <span key={`sep-${i}`} className="mx-1 h-5 w-px bg-line-strong" aria-hidden />
          ) : (
            <button
              key={c.label}
              type="button"
              title={c.label}
              aria-label={c.label}
              // mousedown, not click: a click moves focus and loses the selection first.
              onMouseDown={(e) => {
                e.preventDefault()
                ref.current?.focus()
                c.run()
                emit()
              }}
              className="grid size-7 place-items-center rounded-[var(--radius-sm)] text-ink-muted hover:bg-surface hover:text-ink"
            >
              <c.icon className="size-4" />
            </button>
          ),
        )}
      </div>
      <div
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-label="Message"
        contentEditable
        suppressContentEditableWarning
        data-placeholder={placeholder}
        onFocus={() => exec('defaultParagraphSeparator', 'p')}
        onInput={emit}
        onBlur={emit}
        onPaste={(e) => {
          // Paste as clean paragraphs: Word and web pages bring fonts, colours
          // and tracking markup that would make a proposal look patched together.
          e.preventDefault()
          const text = e.clipboardData.getData('text/plain')
          const html = text
            .replace(/\r\n/g, '\n')
            .split(/\n{2,}/)
            .map((block) => `<p>${escapeText(block).replace(/\n/g, '<br>')}</p>`)
            .join('')
          exec('insertHTML', html)
          emit()
        }}
        className={cn(
          'min-h-[340px] max-h-[60vh] overflow-y-auto px-4 py-3 text-[15px] leading-6 text-ink outline-none',
          'empty:before:pointer-events-none empty:before:text-ink-subtle empty:before:content-[attr(data-placeholder)]',
          '[&_p]:mb-3 [&_h3]:mb-2 [&_h3]:mt-1 [&_h3]:text-base [&_h3]:font-semibold [&_h2]:mb-2 [&_h2]:text-lg [&_h2]:font-semibold',
          '[&_ul]:mb-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:mb-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_li]:mb-1.5',
          '[&_blockquote]:mb-3 [&_blockquote]:border-l-[3px] [&_blockquote]:border-[#f45a1e] [&_blockquote]:bg-surface-2 [&_blockquote]:px-3 [&_blockquote]:py-2',
          '[&_a]:font-medium [&_a]:text-[var(--brand-600)] [&_a]:underline',
        )}
      />
    </div>
  )
}
