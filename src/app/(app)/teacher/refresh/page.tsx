'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function KnowledgeRefreshDashboard() {
  const [pending, setPending] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/v1/teacher-refresh/pending')
      .then(res => res.json())
      .then(data => {
        setPending(data.pending || [])
        setLoading(false)
      })
  }, [])

  return (
    <div className="max-w-4xl mx-auto py-8 px-4">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-gray-900">My Knowledge Refresh</h1>
        <p className="text-gray-500 mt-2">
          Keep your subject knowledge fresh. Complete these quick refreshers to ensure you're ready for your upcoming lessons.
        </p>
      </div>

      <div className="space-y-6">
        <section>
          <h2 className="text-xl font-semibold mb-4">Due Now</h2>
          {loading ? (
            <div className="animate-pulse flex space-x-4">
              <div className="h-20 bg-gray-200 rounded w-full"></div>
            </div>
          ) : pending.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2">
              {pending.map((assessment) => (
                <div key={assessment.id} className="border border-gray-200 rounded-xl p-5 shadow-sm bg-white">
                  <div className="flex justify-between items-start">
                    <div>
                      <span className="inline-flex items-center rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700 ring-1 ring-inset ring-blue-700/10 mb-2">
                        {assessment.type.replace('_', ' ')}
                      </span>
                      <h3 className="text-lg font-medium">{assessment.classSubject?.subject?.name || 'Subject'}</h3>
                      <p className="text-sm text-gray-500">{assessment.classSubject?.classLevel?.name}</p>
                    </div>
                  </div>
                  
                  <div className="mt-4 flex items-center justify-between">
                    <div className="text-sm text-gray-500">
                      {assessment.questionCount} questions &bull; ~{Math.ceil(assessment.questionCount * 1.5)} minutes
                    </div>
                    <Link 
                      href={`/teacher/refresh/${assessment.id}/take`}
                      className="rounded-md bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
                    >
                      Start Refresher
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-10 bg-gray-50 rounded-xl border border-gray-100">
              <h3 className="mt-2 text-sm font-semibold text-gray-900">You're all caught up!</h3>
              <p className="mt-1 text-sm text-gray-500">No pending refreshers at the moment. Keep up the great work.</p>
            </div>
          )}
        </section>

        <section className="mt-12">
          <h2 className="text-xl font-semibold mb-4">Knowledge Profile</h2>
          <div className="bg-white border border-gray-200 rounded-xl p-6">
            <p className="text-gray-500 text-sm mb-4">Your personalized topic readiness based on recent refreshers.</p>
            {/* Placeholder for topic strengths */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Newton's Laws</span>
                <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Strong</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Force calculations</span>
                <span className="inline-flex items-center rounded-md bg-green-50 px-2 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">Strong</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Friction coefficients</span>
                <span className="inline-flex items-center rounded-md bg-yellow-50 px-2 py-1 text-xs font-medium text-yellow-800 ring-1 ring-inset ring-yellow-600/20">Refresh Recommended</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
