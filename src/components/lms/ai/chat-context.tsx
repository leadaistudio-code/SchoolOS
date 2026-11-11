'use client'

import * as React from 'react'
import type { AiChatReply } from '@/server/modules/lms/ai-chat'

export type { AiChatReply }
export type AskAi = (input: { messages: { role: 'user' | 'assistant'; text: string }[] }) => Promise<AiChatReply>

const AskAiContext = React.createContext<AskAi | null>(null)

export function AskAiProvider({ ask, children }: { ask?: AskAi; children: React.ReactNode }) {
  return <AskAiContext.Provider value={ask ?? null}>{children}</AskAiContext.Provider>
}

/** The lesson's study-helper action; null where the helper cannot run (e.g. the platform catalogue preview). */
export function useAskAi() {
  return React.useContext(AskAiContext)
}
