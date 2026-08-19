import React from 'react'
import { FlatList, KeyboardAvoidingView, Platform, Pressable, View } from 'react-native'
import { Ionicons } from '@expo/vector-icons'
import { useAskAssistant } from '@/api/hooks'
import { ApiError } from '@/api/client'
import { Input, Screen, Txt } from '@/components/ui'
import { colors, radius, spacing } from '@/theme'

/**
 * The school assistant.
 *
 * A chat, because the thing being done is asking a question. It calls the same
 * `/assistant` endpoint the web panel does, so answers are grounded in this
 * school's records and scoped to this user's permissions — there is no second
 * model and no separate prompt here.
 *
 * Suggestions are shown on the empty state rather than a blank box: nobody
 * knows what to ask an assistant until they have seen one good question.
 */
type Turn = { id: string; role: 'you' | 'assistant'; text: string; failed?: boolean }

const SUGGESTIONS = [
  'What is today’s attendance?',
  'How much fee is overdue?',
  'Which registers have not been taken?',
  'How many students are enrolled?',
]

export default function AssistantScreen() {
  const [turns, setTurns] = React.useState<Turn[]>([])
  const [draft, setDraft] = React.useState('')
  const ask = useAskAssistant()
  const listRef = React.useRef<FlatList<Turn>>(null)

  async function send(question: string) {
    const text = question.trim()
    if (!text || ask.isPending) return

    const mine: Turn = { id: `q${Date.now()}`, role: 'you', text }
    setTurns((t) => [...t, mine])
    setDraft('')

    try {
      const reply = await ask.mutateAsync(text)
      setTurns((t) => [...t, { id: `a${Date.now()}`, role: 'assistant', text: reply.answer }])
    } catch (err) {
      setTurns((t) => [
        ...t,
        {
          id: `e${Date.now()}`,
          role: 'assistant',
          failed: true,
          text:
            err instanceof ApiError
              ? err.isForbidden
                ? 'The assistant is not switched on for your school, or your role does not include it.'
                : err.message
              : 'The assistant could not answer that.',
        },
      ])
    }
  }

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.base, paddingTop: spacing.md, paddingBottom: spacing.sm }}>
        <Txt variant="h1" accessibilityRole="header">Assistant</Txt>
        <Txt variant="small" color={colors.textSubtle} style={{ marginTop: 2 }}>
          Answers come from your school's own records
        </Txt>
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
          ListEmptyComponent={
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Txt variant="h3" style={{ textAlign: 'center', marginBottom: spacing.lg }}>
                Ask about your school
              </Txt>
              {SUGGESTIONS.map((s) => (
                <Pressable
                  key={s}
                  onPress={() => send(s)}
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
          }
          renderItem={({ item }) => <Bubble turn={item} />}
        />

        {ask.isPending ? (
          <View style={{ paddingHorizontal: spacing.base, paddingBottom: spacing.sm }}>
            <Txt variant="caption" color={colors.textSubtle}>Thinking…</Txt>
          </View>
        ) : null}

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
            placeholder="Ask a question…"
            style={{ flex: 1 }}
            returnKeyType="send"
            onSubmitEditing={() => send(draft)}
            editable={!ask.isPending}
            accessibilityLabel="Your question"
          />
          <Pressable
            onPress={() => send(draft)}
            disabled={!draft.trim() || ask.isPending}
            accessibilityRole="button"
            accessibilityLabel="Send"
            style={{
              width: 48,
              height: 48,
              borderRadius: radius.base,
              backgroundColor: colors.brand,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: !draft.trim() || ask.isPending ? 0.5 : 1,
            }}
          >
            <Ionicons name="arrow-up" size={20} color={colors.textOnDark} />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Screen>
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
