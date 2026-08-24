'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function TakeRefresherPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const [assessment, setAssessment] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [currentIndex, setCurrentIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<string, number[]>>({})
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)

  useEffect(() => {
    // Actually we don't have a specific API route to fetch a single pending refresher
    // so we'll mock it for now until we build that endpoint, or use the pending endpoint
    fetch('/api/v1/teacher-refresh/pending')
      .then(res => res.json())
      .then(data => {
        const found = data.pending.find((a: any) => a.id === params.id)
        setAssessment(found)
        setLoading(false)
      })
  }, [params.id])

  if (loading) return <div className="p-8">Loading refresher...</div>
  if (!assessment) return <div className="p-8">Assessment not found or already completed.</div>

  // Mocking questions since we didn't include them in the pending endpoint fully yet
  const questions = assessment.questions || [
    {
      id: 'q1',
      question: {
        text: "What is the formula for calculating force?",
        options: [
          { text: "F = m * a", isCorrect: true },
          { text: "F = m / a", isCorrect: false },
          { text: "F = a / m", isCorrect: false },
          { text: "F = m + a", isCorrect: false },
        ]
      }
    }
  ]
  const currentQuestion = questions[currentIndex]

  const handleSelectOption = (index: number) => {
    setAnswers(prev => ({
      ...prev,
      [currentQuestion.id]: [index]
    }))
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      const payload = {
        answers: Object.entries(answers).map(([qId, idxs]) => ({
          refreshQuestionId: qId,
          selectedIndexes: idxs
        }))
      }
      const res = await fetch(`/api/v1/teacher-refresh/${params.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      setResult(data)
    } catch (e) {
      console.error(e)
    } finally {
      setSubmitting(false)
    }
  }

  if (result) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-4 text-center">
        <h1 className="text-3xl font-bold mb-4">Refresher Completed!</h1>
        <div className="text-6xl font-bold text-indigo-600 mb-6">
          {result.score} / {result.maxScore}
        </div>
        
        {result.feedback?.note && (
          <div className="text-left bg-blue-50 p-6 rounded-xl border border-blue-100 mb-8">
            <h3 className="font-semibold text-blue-900 mb-2">2-Minute Refresh Note</h3>
            <p className="text-blue-800 whitespace-pre-wrap">{result.feedback.note}</p>
          </div>
        )}
        
        <Link href="/teacher/refresh" className="text-indigo-600 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto py-8 px-4">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-xl font-semibold">Knowledge Refresh</h1>
        <span className="text-sm text-gray-500">Question {currentIndex + 1} of {questions.length}</span>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
        <h2 className="text-lg font-medium text-gray-900 mb-6">{currentQuestion.question.text}</h2>
        
        <div className="space-y-3">
          {currentQuestion.question.options?.map((opt: any, idx: number) => {
            const isSelected = answers[currentQuestion.id]?.includes(idx)
            return (
              <button
                key={idx}
                onClick={() => handleSelectOption(idx)}
                className={`w-full text-left p-4 rounded-lg border ${isSelected ? 'border-indigo-600 bg-indigo-50 text-indigo-900' : 'border-gray-200 hover:bg-gray-50'}`}
              >
                {opt.text}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-8 flex justify-between">
        <button
          onClick={() => setCurrentIndex(i => Math.max(0, i - 1))}
          disabled={currentIndex === 0}
          className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium disabled:opacity-50"
        >
          Previous
        </button>
        
        {currentIndex < questions.length - 1 ? (
          <button
            onClick={() => setCurrentIndex(i => i + 1)}
            disabled={!answers[currentQuestion.id]}
            className="px-4 py-2 bg-indigo-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
          >
            Next
          </button>
        ) : (
          <button
            onClick={handleSubmit}
            disabled={!answers[currentQuestion.id] || submitting}
            className="px-4 py-2 bg-green-600 text-white rounded-md text-sm font-medium disabled:opacity-50"
          >
            {submitting ? 'Submitting...' : 'Complete & Review'}
          </button>
        )}
      </div>
    </div>
  )
}
