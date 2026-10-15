import { BookView } from './book-view'

export const metadata = { title: 'Cash Book' }

export default async function CashBookPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return <BookView book="cash" params={await searchParams} />
}
