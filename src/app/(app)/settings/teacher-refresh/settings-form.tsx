'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import type { TeacherRefreshFrequency } from '@prisma/client'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Field, Input, Select, Checkbox, FormSection, FormActions } from '@/components/ui/input'
import { Notice } from '@/components/ui/states'
import { useToast } from '@/components/ui/toast'

type Config = {
  enabled: boolean
  frequency: TeacherRefreshFrequency
  weeklyQuestionCount: number
  monthlyQuestionCount: number
  passingThreshold: number
  maxAttempts: number
  preLectureEnabled: boolean
  preLectureCount: number
  completionWindowHours: number
}

/**
 * The knowledge-refresh policy form.
 *
 * A single save for the whole policy — there is no per-field autosave, because
 * an administrator changing the passing line wants to see the frequency next to
 * it before either takes effect. The wording stays deliberately supportive: this
 * screen configures development, and the language a school reads while setting it
 * up sets the tone teachers meet later.
 */
export function TeacherRefreshSettingsForm({ initial }: { initial: Config }) {
  const router = useRouter()
  const { push } = useToast()
  const [config, setConfig] = React.useState<Config>(initial)
  const [saving, setSaving] = React.useState(false)

  function set<K extends keyof Config>(key: K, value: Config[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }))
  }

  // Number inputs hand back strings; keep the model typed and ignore a blank or
  // non-numeric transient value rather than writing NaN into state.
  function num<K extends keyof Config>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = Number(e.target.value)
      if (Number.isFinite(v)) set(key, v as Config[K])
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    try {
      const res = await fetch('/api/v1/teacher-refresh/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(config),
      })
      const body = await res.json()
      if (!res.ok) {
        push({
          tone: 'error',
          title: 'Could not save settings',
          description: body?.error?.message ?? 'Please check the values and try again.',
        })
        return
      }
      push({ tone: 'success', title: 'Settings saved' })
      router.refresh()
    } catch {
      push({ tone: 'error', title: 'Network error', description: 'Please try again.' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Card>
        <CardContent className="space-y-8">
          {!config.enabled ? (
            <Notice tone="info" title="The programme is off">
              While this is off, no refreshers are scheduled and teachers see an empty dashboard.
              Existing results are kept and become visible again when you switch it back on.
            </Notice>
          ) : null}

          <FormSection
            title="Programme"
            description="Whether refreshers run, and how often the scheduler creates them."
          >
            <ToggleRow
              label="Enable knowledge refresh"
              hint="Turns on scheduled refreshers for all active teaching staff."
              checked={config.enabled}
              onChange={(v) => set('enabled', v)}
            />
            <Field label="Frequency" htmlFor="frequency" hint="How often a recurring refresher is created.">
              <Select
                id="frequency"
                value={config.frequency}
                onChange={(e) => set('frequency', e.target.value as TeacherRefreshFrequency)}
              >
                <option value="WEEKLY">Weekly</option>
                <option value="BIWEEKLY">Every two weeks</option>
                <option value="MONTHLY">Monthly</option>
                <option value="CUSTOM">Custom (manual only)</option>
              </Select>
            </Field>
            <Field
              label="Completion window"
              htmlFor="completionWindowHours"
              hint="Hours a teacher has to finish before it is marked overdue (1–168)."
            >
              <Input
                id="completionWindowHours"
                type="number"
                min={1}
                max={168}
                value={config.completionWindowHours}
                onChange={num('completionWindowHours')}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Refresher size"
            description="How long each refresher is, and how the readiness line is drawn."
          >
            <Field
              label="Weekly questions"
              htmlFor="weeklyQuestionCount"
              hint="Questions in a weekly refresher (1–50)."
            >
              <Input
                id="weeklyQuestionCount"
                type="number"
                min={1}
                max={50}
                value={config.weeklyQuestionCount}
                onChange={num('weeklyQuestionCount')}
              />
            </Field>
            <Field
              label="Monthly questions"
              htmlFor="monthlyQuestionCount"
              hint="Questions in a monthly subject review (1–100)."
            >
              <Input
                id="monthlyQuestionCount"
                type="number"
                min={1}
                max={100}
                value={config.monthlyQuestionCount}
                onChange={num('monthlyQuestionCount')}
              />
            </Field>
            <Field
              label="Readiness threshold"
              htmlFor="passingThreshold"
              hint="At or above this, a topic reads as ready (0–100%). Never shown to teachers as a pass mark."
            >
              <Input
                id="passingThreshold"
                type="number"
                min={0}
                max={100}
                value={config.passingThreshold}
                onChange={num('passingThreshold')}
              />
            </Field>
            <Field
              label="Attempts allowed"
              htmlFor="maxAttempts"
              hint="How many times a teacher may retake to brush up (1–10)."
            >
              <Input
                id="maxAttempts"
                type="number"
                min={1}
                max={10}
                value={config.maxAttempts}
                onChange={num('maxAttempts')}
              />
            </Field>
          </FormSection>

          <FormSection
            title="Before You Teach"
            description="An optional short refresh a teacher can pull up on a topic before a lesson."
          >
            <ToggleRow
              label="Enable pre-lecture refresh"
              hint="Lets teachers request a quick topic refresher on demand."
              checked={config.preLectureEnabled}
              onChange={(v) => set('preLectureEnabled', v)}
            />
            <Field
              label="Pre-lecture questions"
              htmlFor="preLectureCount"
              hint="Questions in a Before You Teach refresher (1–20)."
            >
              <Input
                id="preLectureCount"
                type="number"
                min={1}
                max={20}
                value={config.preLectureCount}
                onChange={num('preLectureCount')}
                disabled={!config.preLectureEnabled}
              />
            </Field>
          </FormSection>

          <FormActions>
            <Button type="submit" loading={saving}>
              Save settings
            </Button>
          </FormActions>
        </CardContent>
      </Card>
    </form>
  )
}

/** A checkbox with its label and hint, spanning the section's full width. */
function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string
  hint?: string
  checked: boolean
  onChange: (value: boolean) => void
}) {
  return (
    <div className="sm:col-span-2">
      <label className="flex items-start gap-2.5 cursor-pointer">
        <Checkbox
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5"
        />
        <span>
          <span className="block text-sm font-medium text-ink">{label}</span>
          {hint ? <span className="block text-xs text-ink-subtle mt-0.5">{hint}</span> : null}
        </span>
      </label>
    </div>
  )
}
