'use client'

import type { RichBlock } from '@/lib/lms/rich'
import { useLessonState } from '../robotics/lesson-state'

export type Of<T extends RichBlock['type']> = Extract<RichBlock, { type: T }>
export type ActivityResult = { done: boolean; score?: number; tries?: number }

/** An activity's saved result (`a:<id>`). Once done, it stays done. */
export function useResult(id: string) {
  const { get, set } = useLessonState()
  const result = get<ActivityResult | null>(`a:${id}`, null)
  const record = (r: Omit<ActivityResult, 'tries'>) => set(`a:${id}`, { ...r, tries: (result?.tries ?? 0) + 1, done: r.done || !!result?.done })
  return { result, record }
}
