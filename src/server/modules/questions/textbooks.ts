import { z } from 'zod'
import { extractText, getDocumentProxy } from 'unpdf'
import type { AppContext } from '@/server/context'
import { assertClassSubjectAccess } from '@/server/scope'
import { uploadFile } from '@/server/files'
import { sha256 } from '@/server/crypto'
import { audit } from '@/server/audit'
import { ApiException, conflict, notFound } from '@/server/api/response'

const MAX_PAGES = 600
const MAX_EXTRACTED_CHARACTERS = 4_000_000

export const textbookMetadataSchema = z.object({
  classSubjectId: z.string().min(1, 'Choose a class and subject'),
  board: z.string().trim().min(2, 'Enter the board or module').max(80),
  publisher: z.string().trim().max(120).optional(),
  title: z.string().trim().min(2, 'Enter the book title').max(180),
  rightsConfirmed: z.literal('true', {
    errorMap: () => ({ message: 'Confirm that the school may use this book' }),
  }),
})

export async function listTextbooks(ctx: AppContext, classSubjectId?: string) {
  ctx.require('questionbank.generate')
  if (classSubjectId) await assertClassSubjectAccess(ctx, classSubjectId)

  return ctx.db.textbook.findMany({
    where: { deletedAt: null, ...(classSubjectId ? { classSubjectId } : {}) },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      board: true,
      publisher: true,
      title: true,
      fileName: true,
      sizeBytes: true,
      status: true,
      pageCount: true,
      extractionError: true,
      classSubjectId: true,
      createdAt: true,
      classSubject: {
        select: {
          classLevel: { select: { name: true } },
          subject: { select: { name: true } },
        },
      },
    },
  })
}

export async function uploadTextbook(
  ctx: AppContext,
  file: File,
  rawMetadata: unknown,
) {
  ctx.require('questionbank.generate')
  const metadata = textbookMetadataSchema.parse(rawMetadata)
  await assertClassSubjectAccess(ctx, metadata.classSubjectId)

  if (file.type !== 'application/pdf') {
    throw new ApiException(415, 'UNSUPPORTED_FILE_TYPE', 'Textbooks must be uploaded as PDF files')
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  const checksum = sha256(bytes.toString('base64'))
  const duplicate = await ctx.db.textbook.findFirst({
    where: { classSubjectId: metadata.classSubjectId, checksum },
  })
  if (duplicate?.deletedAt === null) {
    throw conflict('This textbook is already available for this class and subject')
  }
  if (duplicate) {
    return ctx.db.textbook.update({
      where: { id: duplicate.id },
      data: {
        board: metadata.board,
        publisher: metadata.publisher || null,
        title: metadata.title,
        deletedAt: null,
      },
      select: { id: true, title: true, status: true, pageCount: true },
    })
  }

  const uploaded = await uploadFile(ctx, file, 'textbooks')
  const textbook = await ctx.db.textbook.create({
    data: {
      tenantId: ctx.tenant.id,
      classSubjectId: metadata.classSubjectId,
      board: metadata.board,
      publisher: metadata.publisher || null,
      title: metadata.title,
      fileName: uploaded.fileName,
      storageKey: uploaded.storageKey,
      mimeType: uploaded.mimeType,
      sizeBytes: uploaded.sizeBytes,
      checksum: uploaded.checksum,
      uploadedById: ctx.user.userId,
    },
    select: { id: true, title: true },
  })

  try {
    const pdf = await getDocumentProxy(new Uint8Array(bytes), {
      maxImageSize: 16_777_216,
      useSystemFonts: true,
    })
    if (pdf.numPages > MAX_PAGES) {
      throw new ApiException(
        413,
        'TOO_MANY_PAGES',
        `Textbooks may contain at most ${MAX_PAGES} pages`,
      )
    }

    const extracted = await extractText(pdf)
    const pages = extracted.text.map((text, index) => ({
      tenantId: ctx.tenant.id,
      textbookId: textbook.id,
      pageNumber: index + 1,
      text: text.trim(),
    }))
    const characterCount = pages.reduce((sum, page) => sum + page.text.length, 0)
    if (characterCount === 0) {
      throw new ApiException(
        422,
        'NO_EXTRACTABLE_TEXT',
        'No readable text was found. Upload a text-based PDF rather than scanned page images.',
      )
    }
    if (characterCount > MAX_EXTRACTED_CHARACTERS) {
      throw new ApiException(413, 'BOOK_TOO_LARGE', 'The extracted textbook text is too large')
    }

    await ctx.db.$transaction(async (tx) => {
      await tx.textbookPage.createMany({ data: pages })
      await tx.textbook.update({
        where: { id: textbook.id },
        data: { status: 'READY', pageCount: extracted.totalPages, extractionError: null },
      })
    })

    await audit({
      tenantId: ctx.tenant.id,
      actorId: ctx.user.userId,
      actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
      action: 'textbook.upload',
      module: 'questionbank',
      entityType: 'Textbook',
      entityId: textbook.id,
      summary: `Uploaded ${textbook.title} (${extracted.totalPages} pages) for grounded question generation`,
    })

    return { id: textbook.id, title: textbook.title, status: 'READY' as const, pageCount: extracted.totalPages }
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : 'Text extraction failed'
    await ctx.db.textbook.update({
      where: { id: textbook.id },
      data: { status: 'FAILED', extractionError: message },
    })
    throw error
  }
}

export async function archiveTextbook(ctx: AppContext, id: string) {
  ctx.require('questionbank.generate')
  const textbook = await ctx.db.textbook.findFirst({
    where: { id, deletedAt: null },
    select: { id: true, title: true, classSubjectId: true },
  })
  if (!textbook) throw notFound('Textbook')
  await assertClassSubjectAccess(ctx, textbook.classSubjectId)
  await ctx.db.textbook.update({ where: { id }, data: { deletedAt: new Date() } })
  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'textbook.archive',
    module: 'questionbank',
    entityType: 'Textbook',
    entityId: id,
    summary: `Archived textbook ${textbook.title}`,
  })
}
