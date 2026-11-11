import { describe, expect, it } from 'vitest'
import { gradeQuiz, publicQuiz, type Quiz } from '../src/lib/lms/options'
import { documentEmbedUrl, videoEmbedUrl } from '../src/lib/lms/media'

const quiz: Quiz = {
  questions: [
    {
      id: 'q1',
      prompt: 'Which sensor follows a line?',
      multiple: false,
      options: [
        { id: 'a', text: 'IR sensor', correct: true },
        { id: 'b', text: 'Thermometer', correct: false },
      ],
      explanation: 'IR reflects differently off black and white.',
    },
    {
      id: 'q2',
      prompt: 'Which are outputs?',
      multiple: true,
      options: [
        { id: 'a', text: 'Motor', correct: true },
        { id: 'b', text: 'LED', correct: true },
        { id: 'c', text: 'Button', correct: false },
      ],
    },
  ],
}

describe('gradeQuiz', () => {
  it('needs exactly the right set of options for a question', () => {
    expect(gradeQuiz(quiz, { q1: ['a'], q2: ['a', 'b'] }, 60)).toMatchObject({ correctCount: 2, scorePercent: 100, passed: true })
    // Half of a multi-answer question is still wrong.
    expect(gradeQuiz(quiz, { q1: ['a'], q2: ['a'] }, 60)).toMatchObject({ correctCount: 1, scorePercent: 50, passed: false })
    // Ticking every box does not game it.
    expect(gradeQuiz(quiz, { q1: ['a'], q2: ['a', 'b', 'c'] }, 60).correctCount).toBe(1)
    // Duplicates and order do not matter.
    expect(gradeQuiz(quiz, { q1: ['a', 'a'], q2: ['b', 'a'] }, 60).correctCount).toBe(2)
  })

  it('treats unanswered questions as wrong and honours the pass mark', () => {
    expect(gradeQuiz(quiz, {}, 0)).toMatchObject({ correctCount: 0, scorePercent: 0, passed: true })
    expect(gradeQuiz(quiz, { q1: ['a'] }, 50)).toMatchObject({ scorePercent: 50, passed: true })
    expect(gradeQuiz(quiz, { q1: ['a'] }, 51).passed).toBe(false)
  })

  it('returns the right answers and explanations only in the result', () => {
    const result = gradeQuiz(quiz, { q1: ['b'] }, 60)
    expect(result.questions[0]).toMatchObject({ correct: false, correctOptionIds: ['a'], explanation: expect.stringContaining('IR') })
    const sent = JSON.stringify(publicQuiz(quiz))
    expect(sent).not.toContain('correct')
    expect(sent).not.toContain('reflects')
  })
})

describe('video and document links', () => {
  it('turns YouTube links into privacy-friendly embeds', () => {
    const embed = 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1'
    expect(videoEmbedUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(embed)
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ')).toBe(embed)
    expect(videoEmbedUrl('https://youtube.com/shorts/dQw4w9WgXcQ')).toBe(embed)
    expect(videoEmbedUrl('https://youtu.be/dQw4w9WgXcQ?t=90')).toBe(`${embed}&start=90`)
  })

  it('supports public and unlisted Vimeo videos', () => {
    expect(videoEmbedUrl('https://vimeo.com/76979871')).toBe('https://player.vimeo.com/video/76979871')
    expect(videoEmbedUrl('https://vimeo.com/76979871/abc123ef')).toBe('https://player.vimeo.com/video/76979871?h=abc123ef')
  })

  it('refuses anything that is not YouTube or Vimeo', () => {
    expect(videoEmbedUrl('https://evil.example.com/watch?v=dQw4w9WgXcQ')).toBeNull()
    expect(videoEmbedUrl('javascript:alert(1)')).toBeNull()
    expect(videoEmbedUrl('https://youtube.com/watch?v=short')).toBeNull()
    expect(videoEmbedUrl('')).toBeNull()
  })

  it('previews Google Drive and Slides, and leaves other documents as links', () => {
    expect(documentEmbedUrl('https://drive.google.com/file/d/ABC123/view?usp=sharing')).toBe('https://drive.google.com/file/d/ABC123/preview')
    expect(documentEmbedUrl('https://docs.google.com/presentation/d/XYZ/edit')).toBe('https://docs.google.com/presentation/d/XYZ/embed')
    expect(documentEmbedUrl('https://example.com/kit-manual.pdf')).toBeNull()
  })
})
