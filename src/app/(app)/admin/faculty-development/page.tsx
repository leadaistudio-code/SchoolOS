'use client'
import React from 'react'

export default function FacultyDevelopmentDashboard() {
  return (
    <div className="max-w-7xl mx-auto py-8 px-4">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">Faculty Development</h1>
          <p className="text-gray-500 mt-2">Monitor teacher readiness and subject knowledge freshness without punitive metrics.</p>
        </div>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Overall Knowledge Freshness</h3>
          <p className="text-3xl font-bold text-gray-900">85%</p>
          <span className="text-xs text-green-600 font-medium">↑ 2% from last month</span>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Refreshers Completed (This Month)</h3>
          <p className="text-3xl font-bold text-gray-900">124</p>
          <span className="text-xs text-gray-500 font-medium">Out of 140 scheduled</span>
        </div>
        <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
          <h3 className="text-sm font-medium text-gray-500 mb-1">Priority Intervention Topics</h3>
          <p className="text-3xl font-bold text-gray-900">3</p>
          <span className="text-xs text-gray-500 font-medium">Topics where >20% teachers need refresh</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Department Readiness</h2>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Science</span>
                <span className="text-gray-500">92%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-500 h-2 rounded-full" style={{ width: '92%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">Mathematics</span>
                <span className="text-gray-500">88%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-green-400 h-2 rounded-full" style={{ width: '88%' }}></div>
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium">History</span>
                <span className="text-gray-500">76%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div className="bg-yellow-400 h-2 rounded-full" style={{ width: '76%' }}></div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h2 className="text-lg font-semibold mb-4 text-gray-800">Recent AI Focus Areas</h2>
          <ul className="space-y-3">
            <li className="flex items-start">
              <span className="flex-shrink-0 h-2 w-2 mt-2 rounded-full bg-blue-500 mr-3"></span>
              <div>
                <p className="text-sm font-medium text-gray-900">Chemical Bonding</p>
                <p className="text-xs text-gray-500">AI identified 4 teachers needing a refresher on Covalent bonds.</p>
              </div>
            </li>
            <li className="flex items-start">
              <span className="flex-shrink-0 h-2 w-2 mt-2 rounded-full bg-blue-500 mr-3"></span>
              <div>
                <p className="text-sm font-medium text-gray-900">Fractions & Decimals</p>
                <p className="text-xs text-gray-500">Scheduled pre-lecture refresher for Class 6 Math teachers.</p>
              </div>
            </li>
          </ul>
        </div>
      </div>
    </div>
  )
}
