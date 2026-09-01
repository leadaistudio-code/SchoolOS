import React from 'react'
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  View,
} from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import * as SecureStore from 'expo-secure-store'
import { useAssistantBriefing } from '@/api/hooks'
import { askAssistantStream } from '@/api/assistant'
import { ApiError } from '@/api/client'
import { Input, Screen, Txt } from '@/components/ui'
import {
  destroyVoice,
  isStopPhrase,
  speak,
  startListening,
  stopListening,
  stopSpeaking,
} from '@/assistant/voice'
import { colors, radius, spacing } from '@/theme'
import type { AssistantBriefing } from '@/api/types'

type Turn = { id: string; role: 'you' | 'assistant'; text: string; failed?: boolean }
type VoicePhase = 'idle' | 'listening' | 'processing' | 'speaking'

const HANDSFREE_KEY = 'mycampusview.assistant.handsfree'

async function readHandsfree(): Promise<boolean> {
  try {
    const stored = await SecureStore.getItemAsync(HANDSFREE_KEY)
    return stored !== 'false'
  } catch {
    return true
  }
}

async function writeHandsfree(enabled: boolean) {
  try {
    await SecureStore.setItemAsync(HANDSFREE_KEY, enabled ? 'true' : 'false')
  } catch {
    // Not critical.
  }
}

function activityForLabel(label: string): string {
  const map: Record<string, string> = {
    "Today's figures": "Let me pull up today's figures",
    'Attendance registers': 'Checking which registers are still open',
    'Outstanding fees': 'Looking at outstanding fees',
    'Payments received': 'Checking payments received',
    Records: 'Just a moment',
  }
  return map[label] ?? 'Just a moment'
}

export default function AssistantScreen() {
  const [turns, setTurns] = React.useState<Turn[]>([])
  const [draft, setDraft] = React.useState('')
  const [busy, setBusy] = React.useState(false)
  const [activity, setActivity] = React.useState<string | null>(null)
  const [handsfree, setHandsfree] = React.useState(true)
  const [voicePhase, setVoicePhase] = React.useState<VoicePhase>('idle')
  const [liveTranscript, setLiveTranscript] = React.useState('')
  const [greetingDone, setGreetingDone] = React.useState(false)
  const [voiceGreeting, setVoiceGreeting] = React.useState(true)
  const listRef = React.useRef<FlatList<Turn>>(null)
  const sessionActive = React.useRef(false)
  const greetingSpoken = React.useRef<string | null>(null)

  const briefingQuery = useAssistantBriefing()
  const briefing = briefingQuery.data ?? null

  React.useEffect(() => {
    void readHandsfree().then(setHandsfree)
    sessionActive.current = handsfree
    return () => {
      sessionActive.current = false
      void stopListening()
      stopSpeaking()
      destroyVoice()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    sessionActive.current = handsfree
    if (!handsfree) {
      void stopListening()
      stopSpeaking()
      setVoicePhase('idle')
      setLiveTranscript('')
    } else if (greetingDone && !busy) {
      beginListening()
    }
  }, [handsfree, greetingDone, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  React.useEffect(() => {
    if (!briefing || !voiceGreeting) {
      setGreetingDone(true)
      return
    }
    if (greetingSpoken.current === briefing.greeting.spoken) return
    greetingSpoken.current = briefing.greeting.spoken
    setGreetingDone(false)
    stopSpeaking()
    void speak(briefing.greeting.spoken, () => setGreetingDone(true))
  }, [briefing, voiceGreeting])

  const beginListening = React.useCallback(() => {
    if (!handsfree || !greetingDone || busy || !sessionActive.current) return
    setLiveTranscript('')
    setVoicePhase('listening')
    void startListening({
      onPartial: (text) => setLiveTranscript(text),
      onFinal: (text) => {
        setLiveTranscript('')
        if (!text.trim()) {
          beginListening()
          return
        }
        if (isStopPhrase(text)) {
          sessionActive.current = false
          setHandsfree(false)
          void writeHandsfree(false)
          setVoicePhase('idle')
          void speak('Alright. I am here whenever you need me.')
          return
        }
        void sendQuestion(text)
      },
      onError: () => {
        setVoicePhase('idle')
        setTimeout(() => beginListening(), 500)
      },
    })
  }, [handsfree, greetingDone, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  async function sendQuestion(question: string) {
    const text = question.trim()
    if (!text || busy) return

    await stopListening()
    stopSpeaking()
    setDraft('')
    setBusy(true)
    setVoicePhase('processing')
    setActivity('Just a moment')

    const mine: Turn = { id: `q${Date.now()}`, role: 'you', text }
    setTurns((t) => [...t, mine])

    const history = turns
      .filter((t) => !t.failed)
      .map((t) => ({ role: (t.role === 'you' ? 'user' : 'assistant') as 'user' | 'assistant', text: t.text }))

    let assistantId = `a${Date.now()}`
    setTurns((t) => [...t, { id: assistantId, role: 'assistant', text: '' }])

    try {
      const answer = await askAssistantStream({
        question: text,
        history,
        onActivity: (label) => setActivity(activityForLabel(label)),
        onPartial: (partial) => {
          setTurns((t) =>
            t.map((turn) => (turn.id === assistantId ? { ...turn, text: partial } : turn)),
          )
        },
      })

      const finalText = answer || 'I could not find an answer for that.'
      setTurns((t) =>
        t.map((turn) => (turn.id === assistantId ? { ...turn, text: finalText } : turn)),
      )

      if (handsfree && sessionActive.current) {
        setVoicePhase('speaking')
        await speak(finalText, () => {
          if (sessionActive.current && handsfree) {
            beginListening()
          } else {
            setVoicePhase('idle')
          }
        })
      } else {
        setVoicePhase('idle')
      }
    } catch (err) {
      const message =
        err instanceof ApiError
          ? err.isForbidden
            ? 'The assistant is not switched on for your school, or your role does not include it.'
            : err.message
          : 'The assistant could not answer that.'
      setTurns((t) => [
        ...t.filter((turn) => turn.id !== assistantId),
        { id: `e${Date.now()}`, role: 'assistant', failed: true, text: message },
      ])
      setVoicePhase('idle')
      if (handsfree && sessionActive.current) beginListening()
    } finally {
      setBusy(false)
      setActivity(null)
    }
  }

  async function toggleHandsfree() {
    const next = !handsfree
    setHandsfree(next)
    sessionActive.current = next
    await writeHandsfree(next)
    if (next && greetingDone && !busy) {
      beginListening()
    } else {
      await stopListening()
      stopSpeaking()
      setVoicePhase('idle')
    }
  }

  const suggestions =
    briefing?.followUpPrompts?.length ? briefing.followUpPrompts : [
      'What is today\'s attendance?',
      'How much fee is overdue?',
      'Which registers have not been taken?',
    ]

  const phaseLabel =
    voicePhase === 'listening'
      ? liveTranscript || 'Listening…'
      : voicePhase === 'processing'
        ? activity ? `${activity}…` : 'Just a moment…'
        : voicePhase === 'speaking'
          ? 'Speaking…'
          : handsfree && greetingDone
            ? 'Say something, or type below'
            : null

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}>
            <Txt variant="h1" accessibilityRole="header">Assistant</Txt>
            <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
              Answers come from your school&apos;s own records
            </Txt>
          </View>
          <Pressable
            onPress={() => void toggleHandsfree()}
            accessibilityRole="button"
            accessibilityLabel={handsfree ? 'Handsfree on' : 'Handsfree off'}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              borderWidth: 1,
              borderColor: handsfree ? colors.brand : colors.border,
              borderRadius: radius.pill,
              paddingHorizontal: spacing.sm,
              paddingVertical: 6,
              opacity: pressed ? 0.7 : 1,
              backgroundColor: handsfree ? `${colors.brand}14` : colors.surface,
            })}
          >
            <Ionicons
              name={handsfree ? 'mic' : 'mic-off'}
              size={14}
              color={handsfree ? colors.brand : colors.textSubtle}
            />
            <Txt variant="caption" color={handsfree ? colors.brand : colors.textSubtle}>
              {handsfree ? 'Handsfree' : 'Manual'}
            </Txt>
          </Pressable>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={90}
      >
        <FlatList
          ref={listRef}
          data={turns}
          keyExtractor={(t) => t.id}
          contentContainerStyle={{ padding: spacing.base, flexGrow: 1 }}
          onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            turns.length === 0 ? (
              <WelcomeHeader
                loading={briefingQuery.isLoading}
                briefing={briefing}
                phaseLabel={phaseLabel}
                voiceGreeting={voiceGreeting}
                onToggleVoice={() => setVoiceGreeting((v) => !v)}
                suggestions={suggestions}
                onSuggestion={(s) => void sendQuestion(s)}
              />
            ) : phaseLabel ? (
              <Txt variant="caption" color={colors.textSubtle} style={{ marginBottom: spacing.sm, fontStyle: 'italic' }}>
                {phaseLabel}
              </Txt>
            ) : null
          }
          renderItem={({ item }) => <Bubble turn={item} />}
        />

        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            padding: spacing.base,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <Input
            value={draft}
            onChangeText={setDraft}
            placeholder={voicePhase === 'listening' ? 'Listening…' : 'Ask a question…'}
            style={{ flex: 1 }}
            returnKeyType="send"
            onSubmitEditing={() => void sendQuestion(draft)}
            editable={!busy}
            accessibilityLabel="Your question"
          />
          <Pressable
            onPress={() => void sendQuestion(draft)}
            disabled={!draft.trim() || busy}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.base,
              backgroundColor: colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !draft.trim() || busy ? 0.5 : 1,
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.textOnDark} size="small" />
            ) : (
              <Ionicons name="arrow-up" size={20} color={colors.textOnDark} />
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  )
}

function WelcomeHeader({
  loading,
  briefing,
  phaseLabel,
  voiceGreeting,
  onToggleVoice,
  suggestions,
  onSuggestion,
}: {
  loading: boolean
  briefing: AssistantBriefing | null
  phaseLabel: string | null
  voiceGreeting: boolean
  onToggleVoice: () => void
  suggestions: string[]
  onSuggestion: (text: string) => void
}) {
  if (loading) {
    return (
      <View style={{ alignItems: 'center', paddingVertical: spacing.xl }}>
        <ActivityIndicator color={colors.brand} />
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: spacing.md }}>
          Getting your briefing ready…
        </Txt>
      </View>
    )
  }

  if (!briefing) {
    return (
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.base,
          padding: spacing.base,
          marginBottom: spacing.lg,
        }}
      >
        <Txt variant="small" color={colors.textSubtle} style={{ textAlign: 'center' }}>
          Could not load your briefing. You can still ask a question below.
        </Txt>
      </View>
    )
  }

  const urgent = briefing.actionItems.filter((item) => item.urgent && item.count > 0)

  return (
    <View style={{ marginBottom: spacing.lg }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: radius.lg,
          padding: spacing.base,
          marginBottom: spacing.md,
          backgroundColor: `${colors.brand}08`,
        }}
      >
        <Txt variant="caption" color={colors.brand} style={{ textTransform: 'uppercase', letterSpacing: 1 }}>
          Campus Assistant
        </Txt>
        <Txt variant="h3" style={{ marginTop: spacing.xs }}>
          {briefing.greeting.headline}
        </Txt>
        <Txt variant="small" color={colors.textMuted} style={{ marginTop: spacing.xs }}>
          {briefing.greeting.subline}
        </Txt>
        {phaseLabel ? (
          <Txt variant="small" color={colors.textSubtle} style={{ marginTop: spacing.sm, fontStyle: 'italic' }}>
            {phaseLabel}
          </Txt>
        ) : null}
        <Pressable
          onPress={onToggleVoice}
          accessibilityRole="button"
          style={{ marginTop: spacing.sm, alignSelf: 'flex-start' }}
        >
          <Txt variant="caption" color={colors.textMuted}>
            {voiceGreeting ? '🔊 Voice on' : '🔇 Voice off'}
          </Txt>
        </Pressable>
      </View>

      {urgent.length > 0 ? (
        <View style={{ marginBottom: spacing.md }}>
          <Txt variant="caption" color={colors.textSubtle} style={{ marginBottom: spacing.sm }}>
            TODAY&apos;S PRIORITIES
          </Txt>
          {urgent.map((item) => (
            <View
              key={item.id}
              style={{
                borderWidth: 1,
                borderColor: colors.dangerBg,
                backgroundColor: colors.dangerBg,
                borderRadius: radius.base,
                padding: spacing.md,
                marginBottom: spacing.sm,
              }}
            >
              <Txt variant="small" style={{ fontWeight: '600' }}>{item.label}</Txt>
              <Txt variant="caption" color={colors.textMuted}>{item.detail}</Txt>
            </View>
          ))}
        </View>
      ) : null}

      <Txt variant="caption" color={colors.textSubtle} style={{ marginBottom: spacing.sm }}>
        TRY ASKING
      </Txt>
      {suggestions.map((s) => (
        <Pressable
          key={s}
          onPress={() => onSuggestion(s)}
          accessibilityRole="button"
          style={({ pressed }) => [{
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: radius.base,
            padding: spacing.base,
            marginBottom: spacing.sm,
            opacity: pressed ? 0.7 : 1,
          }]}
        >
          <Txt variant="small" color={colors.textMuted}>{s}</Txt>
        </Pressable>
      ))}
    </View>
  )
}

function Bubble({ turn }: { turn: Turn }) {
  const mine = turn.role === 'you'
  return (
    <View
      style={{
        alignSelf: mine ? 'flex-end' : 'flex-start',
        maxWidth: '86%',
        backgroundColor: mine ? colors.brand : turn.failed ? colors.dangerBg : colors.surface,
        borderWidth: mine ? 0 : 1,
        borderColor: turn.failed ? colors.dangerBg : colors.border,
        borderRadius: radius.lg,
        paddingHorizontal: spacing.base,
        paddingVertical: spacing.md,
        marginBottom: spacing.sm,
      }}
    >
      <Txt variant="body" color={mine ? colors.textOnDark : turn.failed ? colors.danger : colors.text}>
        {turn.text}
      </Txt>
    </View>
  )
}
