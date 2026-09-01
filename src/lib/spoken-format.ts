/**
 * Makes assistant answers easier to hear when read aloud.
 * Applied client-side before TTS — server answers keep exact figures for display.
 */

const LAKH = 100_000
const CRORE = 10_000_000

function wordsUnder100(n: number): string {
  const ones = [
    'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
    'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen',
    'eighteen', 'nineteen',
  ]
  const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety']
  if (n < 20) return ones[n] ?? String(n)
  if (n < 100) {
    const t = Math.floor(n / 10)
    const o = n % 10
    return o ? `${tens[t]} ${ones[o]}` : tens[t]!
  }
  return String(n)
}

function wordsUnder1000(n: number): string {
  if (n < 100) return wordsUnder100(n)
  const h = Math.floor(n / 100)
  const rest = n % 100
  return rest ? `${wordsUnder100(h)} hundred ${wordsUnder100(rest)}` : `${wordsUnder100(h)} hundred`
}

/** Indian-style spoken amount for rupee figures. */
export function speakRupees(amount: number): string {
  const n = Math.round(Math.abs(amount))
  if (n >= CRORE) {
    const crore = Math.floor(n / CRORE)
    const rest = n % CRORE
    if (rest >= LAKH) {
      const lakh = Math.floor(rest / LAKH)
      return `${wordsUnder1000(crore)} crore ${wordsUnder1000(lakh)} lakh rupees`
    }
    return rest
      ? `${wordsUnder1000(crore)} crore ${wordsUnder1000(rest)} rupees`
      : `${wordsUnder1000(crore)} crore rupees`
  }
  if (n >= LAKH) {
    const lakh = Math.floor(n / LAKH)
    const rest = n % LAKH
    return rest
      ? `${wordsUnder1000(lakh)} lakh ${wordsUnder1000(rest)} rupees`
      : `${wordsUnder1000(lakh)} lakh rupees`
  }
  if (n >= 1000) {
    const thousand = Math.floor(n / 1000)
    const rest = n % 1000
    return rest
      ? `${wordsUnder1000(thousand)} thousand ${wordsUnder1000(rest)} rupees`
      : `${wordsUnder1000(thousand)} rupees`
  }
  return `${wordsUnder1000(n)} rupees`
}

/** Replace ₹ amounts and plain digit clusters for friendlier TTS. */
export function formatForSpeech(text: string): string {
  let out = text

  out = out.replace(/₹\s*([\d,]+(?:\.\d{1,2})?)/g, (_, raw: string) => {
    const amount = Number.parseFloat(raw.replace(/,/g, ''))
    if (Number.isNaN(amount)) return raw
    return speakRupees(amount)
  })

  out = out.replace(/\b(\d{1,3}(?:,\d{2,3})+)\b/g, (_, raw: string) => {
    const n = Number.parseInt(raw.replace(/,/g, ''), 10)
    if (Number.isNaN(n) || n < 1000) return raw
    return speakRupees(n).replace(' rupees', '')
  })

  return out
}
