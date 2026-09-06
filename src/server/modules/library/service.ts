import type { AppContext } from '@/server/context'
import { audit } from '@/server/audit'
import { badRequest, conflict, notFound } from '@/server/api/response'
import { studentIdScopeWhere } from '@/server/scope'
import {
  FINE_PER_DAY_MINOR,
  bookSchema,
  categorySchema,
  issueLoanSchema,
  type BookInput,
  type IssueLoanInput,
} from './schema'

export async function listBooks(ctx: AppContext, q?: string) {
  ctx.require('library.view')
  return ctx.db.book.findMany({
    where: {
      deletedAt: null,
      ...(q
        ? {
            OR: [
              { title: { contains: q, mode: 'insensitive' } },
              { author: { contains: q, mode: 'insensitive' } },
              { isbn: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    },
    include: { category: { select: { name: true } } },
    orderBy: { title: 'asc' },
    take: 200,
  })
}

export async function listCategories(ctx: AppContext) {
  ctx.require('library.view')
  return ctx.db.bookCategory.findMany({ orderBy: { name: 'asc' } })
}

export async function createCategory(ctx: AppContext, name: string) {
  ctx.require('library.manage')
  const input = categorySchema.parse({ name })
  return ctx.db.bookCategory.create({
    data: { tenantId: ctx.tenant.id, name: input.name },
  })
}

export async function createBook(ctx: AppContext, raw: BookInput) {
  ctx.require('library.manage')
  const input = bookSchema.parse(raw)

  const book = await ctx.db.$transaction(async (tx) => {
    const created = await tx.book.create({
      data: {
        tenantId: ctx.tenant.id,
        title: input.title,
        author: input.author ?? null,
        isbn: input.isbn ?? null,
        categoryId: input.categoryId ?? null,
        shelfCode: input.shelfCode ?? null,
        totalCopies: input.totalCopies,
        availableCopies: input.totalCopies,
      },
    })

    for (let i = 1; i <= input.totalCopies; i++) {
      await tx.bookCopy.create({
        data: {
          tenantId: ctx.tenant.id,
          bookId: created.id,
          barcode: `${created.id.slice(-6).toUpperCase()}-${String(i).padStart(3, '0')}`,
        },
      })
    }

    return created
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'library.book.create',
    module: 'library',
    entityType: 'Book',
    entityId: book.id,
    summary: `Added ${book.title} (${book.totalCopies} copies)`,
  })

  return book
}

export async function listLoans(ctx: AppContext, status?: 'ISSUED' | 'OVERDUE' | 'RETURNED') {
  ctx.require('library.view')
  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const scope = await studentIdScopeWhere(ctx)

  if (status === 'OVERDUE') {
    return ctx.db.libraryLoan.findMany({
      where: { status: 'ISSUED', dueOn: { lt: today }, ...scope },
      include: {
        book: { select: { title: true } },
        student: { select: { firstName: true, lastName: true, admissionNo: true } },
      },
      orderBy: { dueOn: 'asc' },
      take: 200,
    })
  }

  return ctx.db.libraryLoan.findMany({
    where: { ...(status ? { status } : {}), ...scope },
    include: {
      book: { select: { title: true } },
      student: { select: { firstName: true, lastName: true, admissionNo: true } },
    },
    orderBy: { issuedOn: 'desc' },
    take: 200,
  })
}

export async function issueLoan(ctx: AppContext, raw: IssueLoanInput) {
  ctx.require('library.issue')
  const input = issueLoanSchema.parse(raw)

  const book = await ctx.db.book.findFirst({ where: { id: input.bookId, deletedAt: null } })
  if (!book) throw notFound('Book not found')
  if (book.availableCopies < 1) throw conflict('No copies available')

  const copy = await ctx.db.bookCopy.findFirst({
    where: { bookId: book.id, isAvailable: true },
  })

  const loan = await ctx.db.$transaction(async (tx) => {
    const created = await tx.libraryLoan.create({
      data: {
        tenantId: ctx.tenant.id,
        bookId: book.id,
        copyId: copy?.id ?? null,
        studentId: input.studentId ?? null,
        staffId: input.staffId ?? null,
        dueOn: input.dueOn,
        remarks: input.remarks ?? null,
        status: 'ISSUED',
        issuedById: ctx.user.userId,
      },
    })

    await tx.book.update({
      where: { id: book.id },
      data: { availableCopies: { decrement: 1 } },
    })
    if (copy) {
      await tx.bookCopy.update({ where: { id: copy.id }, data: { isAvailable: false } })
    }

    return created
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'library.loan.issue',
    module: 'library',
    entityType: 'LibraryLoan',
    entityId: loan.id,
    summary: `Issued ${book.title}`,
  })

  return loan
}

export async function returnLoan(ctx: AppContext, loanId: string) {
  ctx.require('library.issue')
  const loan = await ctx.db.libraryLoan.findFirst({ where: { id: loanId } })
  if (!loan) throw notFound('Loan not found')
  if (loan.status === 'RETURNED') throw conflict('Already returned')

  const today = new Date()
  today.setUTCHours(0, 0, 0, 0)
  const overdueDays = Math.max(
    0,
    Math.floor((today.getTime() - loan.dueOn.getTime()) / 86_400_000),
  )
  const fineMinor = overdueDays * FINE_PER_DAY_MINOR

  const updated = await ctx.db.$transaction(async (tx) => {
    const result = await tx.libraryLoan.update({
      where: { id: loanId },
      data: {
        status: 'RETURNED',
        returnedOn: new Date(),
        fineMinor,
      },
    })
    await tx.book.update({
      where: { id: loan.bookId },
      data: { availableCopies: { increment: 1 } },
    })
    if (loan.copyId) {
      await tx.bookCopy.update({ where: { id: loan.copyId }, data: { isAvailable: true } })
    }
    return result
  })

  await audit({
    tenantId: ctx.tenant.id,
    actorId: ctx.user.userId,
    actorLabel: `${ctx.user.firstName} ${ctx.user.lastName}`,
    action: 'library.loan.return',
    module: 'library',
    entityType: 'LibraryLoan',
    entityId: loanId,
    summary: `Returned loan${fineMinor ? ` with fine ₹${(fineMinor / 100).toFixed(0)}` : ''}`,
  })

  return updated
}

export async function markLoanLost(ctx: AppContext, loanId: string) {
  ctx.require('library.issue')
  const loan = await ctx.db.libraryLoan.findFirst({ where: { id: loanId } })
  if (!loan) throw notFound('Loan not found')
  if (loan.status === 'RETURNED') throw badRequest('Already returned')

  return ctx.db.libraryLoan.update({
    where: { id: loanId },
    data: { status: 'LOST' },
  })
}

export async function libraryIssueSetup(ctx: AppContext) {
  ctx.require('library.issue')
  const [books, students] = await Promise.all([
    ctx.db.book.findMany({
      where: { deletedAt: null, availableCopies: { gt: 0 } },
      orderBy: { title: 'asc' },
      select: { id: true, title: true, availableCopies: true },
      take: 300,
    }),
    ctx.db.student.findMany({
      where: { status: 'ACTIVE', deletedAt: null },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
      select: { id: true, firstName: true, lastName: true, admissionNo: true },
      take: 500,
    }),
  ])
  return { books, students }
}
