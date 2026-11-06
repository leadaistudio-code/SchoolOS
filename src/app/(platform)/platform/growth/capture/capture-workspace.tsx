'use client'

import { useState } from 'react'
import { Mic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { VoiceCaptureResult } from '@/server/modules/platform/growth/voice'
import { FieldCaptureForm } from './capture-form'
import { VoiceRecorder } from './voice-recorder'

export function CaptureWorkspace({ voiceEnabled, autoStart }: { voiceEnabled: boolean; autoStart: boolean }) {
  const [voice, setVoice] = useState<VoiceCaptureResult | null>(null)
  const [version, setVersion] = useState(0)
  const [recordAgain, setRecordAgain] = useState(false)

  function onResult(result: VoiceCaptureResult) {
    setVoice(result)
    setVersion((v) => v + 1)
    setRecordAgain(false)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="space-y-4">
      {voiceEnabled ? (
        voice && !recordAgain ? (
          <Button type="button" variant="secondary" block onClick={() => setRecordAgain(true)}>
            <Mic /> Record the note again
          </Button>
        ) : (
          <VoiceRecorder autoStart={autoStart || recordAgain} onResult={onResult} />
        )
      ) : null}
      <Card>
        <CardContent className="pt-4">
          <FieldCaptureForm key={version} voice={voice} />
        </CardContent>
      </Card>
    </div>
  )
}
