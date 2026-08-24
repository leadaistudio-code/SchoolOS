'use client'
import React, { useEffect, useState } from 'react'

export default function TeacherRefreshSettingsPage() {
  const [config, setConfig] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetch('/api/v1/teacher-refresh/config')
      .then(res => res.json())
      .then(setConfig)
  }, [])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      await fetch('/api/v1/teacher-refresh/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: config.enabled,
          frequency: config.frequency,
          preLectureEnabled: config.preLectureEnabled
        })
      })
      alert('Settings saved successfully')
    } finally {
      setSaving(false)
    }
  }

  if (!config) return <div className="p-8">Loading settings...</div>

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <h1 className="text-2xl font-bold mb-6 text-gray-900">Teacher Knowledge Refresh Settings</h1>
      
      <form onSubmit={handleSave} className="bg-white shadow-sm border border-gray-200 rounded-xl p-6 space-y-6">
        <div>
          <label className="flex items-center space-x-3">
            <input 
              type="checkbox" 
              checked={config.enabled}
              onChange={e => setConfig({...config, enabled: e.target.checked})}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600" 
            />
            <span className="text-sm font-medium text-gray-900">Enable Knowledge Refresh Module</span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-7">Turn on automated refreshers for all active teaching staff.</p>
        </div>

        <div className="border-t border-gray-100 pt-6">
          <label className="block text-sm font-medium leading-6 text-gray-900">Default Assessment Frequency</label>
          <select 
            value={config.frequency}
            onChange={e => setConfig({...config, frequency: e.target.value})}
            className="mt-2 block w-full rounded-md border-0 py-1.5 pl-3 pr-10 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-indigo-600 sm:text-sm sm:leading-6"
          >
            <option value="WEEKLY">Weekly</option>
            <option value="BIWEEKLY">Bi-weekly</option>
            <option value="MONTHLY">Monthly</option>
          </select>
        </div>

        <div className="border-t border-gray-100 pt-6">
          <label className="flex items-center space-x-3">
            <input 
              type="checkbox" 
              checked={config.preLectureEnabled}
              onChange={e => setConfig({...config, preLectureEnabled: e.target.checked})}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600" 
            />
            <span className="text-sm font-medium text-gray-900">Enable Pre-Lecture Topic Refresh</span>
          </label>
          <p className="text-xs text-gray-500 mt-1 ml-7">Automatically trigger a micro-assessment (5 questions) 24 hours before a new topic is taught.</p>
        </div>

        <div className="pt-4 flex justify-end">
          <button 
            type="submit" 
            disabled={saving}
            className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            {saving ? 'Saving...' : 'Save Settings'}
          </button>
        </div>
      </form>
    </div>
  )
}
