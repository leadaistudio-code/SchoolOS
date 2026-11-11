import { describe, expect, it } from 'vitest'
import { LESSONS } from '@/lib/lms/robotics101'
import { VIDEOS, captionCues, timeline, toSrt, toVtt, videoById, type TimedScene } from '@/lib/lms/robotics101/videos'
import { simSceneOutcome } from '@/components/lms/robotics/video-frame'

/** What each simulator scene's narration says will happen. */
const EXPECTED: Record<string, string[]> = {
  v01: ['running'],
  v04: ['finished'],
  v05: ['finished'],
  v06: ['finished'],
  v11: ['finished', 'lost'],
  v12: ['lost', 'finished'],
  v13: ['lost', 'stopped'],
  v14: ['finished'],
}

describe('Robotics 101 videos', () => {
  it('has the 14 required videos, each tied to a real lesson', () => {
    expect(VIDEOS).toHaveLength(14)
    expect(new Set(VIDEOS.map((v) => v.id)).size).toBe(14)
    for (const v of VIDEOS) {
      const lesson = LESSONS.find((l) => l.slug === v.lessonSlug)
      expect(lesson, v.id).toBeDefined()
      expect(videoById(lesson!.videoId)?.id).toBe(v.id)
    }
  })

  it('places checkpoints and chapters inside the video', () => {
    for (const v of VIDEOS) {
      const tl = timeline(v)
      expect(tl.checkpoints.length).toBeGreaterThan(0)
      for (const c of tl.checkpoints) {
        expect(c.at).toBeGreaterThan(0)
        expect(c.at).toBeLessThan(tl.duration)
        expect(c.options.filter((o) => o.correct)).toHaveLength(1)
      }
      const at = tl.chapters.map((c) => c.at)
      expect([...at].sort((a, b) => a - b)).toEqual(at)
    }
  })

  it('writes ordered, non-overlapping captions in VTT and SRT', () => {
    for (const v of VIDEOS) {
      const cues = captionCues(v)
      const { duration } = timeline(v)
      cues.forEach((c, i) => {
        expect(c.end).toBeGreaterThan(c.start)
        expect(c.end).toBeLessThanOrEqual(duration)
        if (i) expect(c.start).toBeGreaterThanOrEqual(cues[i - 1]!.end)
        expect(c.text.split(/\s+/).length).toBeLessThanOrEqual(16)
      })
      expect(toVtt(v).startsWith('WEBVTT')).toBe(true)
      expect(toSrt(v)).toMatch(/^1\n00:00:00,500 --> /)
    }
  })

  it('shows simulator runs that match the narration', () => {
    for (const v of VIDEOS) {
      const sims = timeline(v).scenes.filter((s): s is Extract<TimedScene, { kind: 'sim' }> => s.kind === 'sim')
      expect(sims.map((s) => simSceneOutcome(s)), v.id).toEqual(EXPECTED[v.id] ?? [])
    }
  })
})
