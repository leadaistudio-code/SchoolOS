const TIME_ZONE = 'Asia/Kolkata'

const whenFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
const dayFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TIME_ZONE, day: 'numeric', month: 'short', year: 'numeric' })

export function formatWhen(at: string | Date): string {
  return whenFormat.format(new Date(at))
}

export function formatDate(at: string | Date): string {
  return dayFormat.format(new Date(at))
}
