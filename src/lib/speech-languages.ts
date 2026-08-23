/**
 * The languages the assistant can be spoken to in.
 *
 * These are BCP-47 tags the browser's own speech recognition accepts, not a
 * translation layer of ours — which is exactly why the list is worth being
 * careful about. A tag the browser does not know fails silently: the microphone
 * opens, nothing is transcribed, and the user concludes the feature is broken
 * rather than unsupported.
 *
 * Every entry here is a locale Chrome and Edge recognise for Indian users. The
 * endonym is the label, because somebody looking for Marathi is looking for
 * मराठी, not for the word "Marathi" written in an alphabet they are choosing to
 * move away from.
 *
 * One source of truth: the assistant panel builds its picker from this, the
 * server tells the model which language to answer in from the same tag, and the
 * marketing site names the same set. None of the three can drift.
 */

export type SpeechLanguage = {
  /** BCP-47 tag handed to SpeechRecognition and SpeechSynthesis. */
  tag: string
  /** The language's own name for itself. */
  label: string
  /** English name, for the model prompt and for search. */
  english: string
}

export const SPEECH_LANGUAGES: SpeechLanguage[] = [
  { tag: 'en-IN', label: 'English', english: 'English' },
  { tag: 'hi-IN', label: 'हिन्दी', english: 'Hindi' },
  { tag: 'mr-IN', label: 'मराठी', english: 'Marathi' },
  { tag: 'bn-IN', label: 'বাংলা', english: 'Bengali' },
  { tag: 'ta-IN', label: 'தமிழ்', english: 'Tamil' },
  { tag: 'te-IN', label: 'తెలుగు', english: 'Telugu' },
  { tag: 'gu-IN', label: 'ગુજરાતી', english: 'Gujarati' },
  { tag: 'kn-IN', label: 'ಕನ್ನಡ', english: 'Kannada' },
  { tag: 'ml-IN', label: 'മലയാളം', english: 'Malayalam' },
  { tag: 'pa-IN', label: 'ਪੰਜਾਬੀ', english: 'Punjabi' },
  { tag: 'ur-IN', label: 'اردو', english: 'Urdu' },
]

export const DEFAULT_SPEECH_LANGUAGE = 'en-IN'

const BY_TAG = new Map(SPEECH_LANGUAGES.map((l) => [l.tag, l]))

export function speechLanguage(tag: string | null | undefined): SpeechLanguage {
  return BY_TAG.get(tag ?? '') ?? BY_TAG.get(DEFAULT_SPEECH_LANGUAGE)!
}

/** A known tag, or the default. Never trust a stored or posted value. */
export function normaliseLanguageTag(tag: string | null | undefined): string {
  return BY_TAG.has(tag ?? '') ? tag! : DEFAULT_SPEECH_LANGUAGE
}
