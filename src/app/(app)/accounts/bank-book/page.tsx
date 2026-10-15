import { BookView } from '../cash-book/book-view'

export const metadata = { title: 'Bank Book' }

export default async function BankBookPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <BookView book="bank" params={await searchParams} />
}
