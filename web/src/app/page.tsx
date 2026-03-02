'use client'

import { useState } from 'react'
import { uploadSession, getSession } from '@/lib/api'

// ── TYPES ──────────────────────────────────────────────────────────────────
interface Report {
  summary: {
    risk_level: string
    risk_score: number
    total_issues: number
  }
  coaching_cues: string[]
  recommended_drills: { name: string; score: number }[]
  weekly_plan: Record<string, {
    focus: string
    drills: string[]
    duration_mins: number
    intensity: string
  }>
  movement_analysis: {
    issue: string
    root_cause: string
    severity: number
    explanation: string
  }[]
  safety_note?: string
  agent_log: string[]
}

// ── RISK BADGE ─────────────────────────────────────────────────────────────
function RiskBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    green: 'bg-green-100 text-green-800 border border-green-300',
    amber: 'bg-yellow-100 text-yellow-800 border border-yellow-300',
    red: 'bg-red-100 text-red-800 border border-red-300',
  }
  const icons: Record<string, string> = {
    green: '✅', amber: '⚠️', red: '🔴'
  }
  return (
    <span className={`px-3 py-1 rounded-full text-sm font-semibold ${colors[level] || colors.green}`}>
      {icons[level]} {level?.toUpperCase()}
    </span>
  )
}

// ── SCORE RING ─────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const color = score < 30 ? '#22c55e' : score < 60 ? '#f59e0b' : '#ef4444'
  return (
    <div className="flex flex-col items-center">
      <svg width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="50" fill="none" stroke="#e5e7eb" strokeWidth="10" />
        <circle cx="60" cy="60" r="50" fill="none" stroke={color} strokeWidth="10"
          strokeDasharray={`${(score / 100) * 314} 314`}
          strokeLinecap="round" transform="rotate(-90 60 60)" />
        <text x="60" y="60" textAnchor="middle" dy="6" fontSize="24" fontWeight="bold" fill={color}>
          {score}
        </text>
        <text x="60" y="80" textAnchor="middle" fontSize="11" fill="#6b7280">/ 100</text>
      </svg>
      <p className="text-sm text-gray-500 mt-1">Injury Risk Score</p>
    </div>
  )
}

// ── WEEKLY PLAN ────────────────────────────────────────────────────────────
function WeeklyPlan({ plan }: { plan: Report['weekly_plan'] }) {
  const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']
  const focusColors: Record<string, string> = {
    technique: 'bg-blue-50 border-blue-200',
    recovery: 'bg-green-50 border-green-200',
    strength: 'bg-purple-50 border-purple-200',
    rest: 'bg-gray-50 border-gray-200',
    sport: 'bg-orange-50 border-orange-200',
    mobility: 'bg-teal-50 border-teal-200',
  }
  return (
    <div className="grid grid-cols-7 gap-2">
      {days.map(day => {
        const d = plan?.[day]
        return (
          <div key={day} className={`rounded-xl border p-3 ${focusColors[d?.focus] || 'bg-gray-50'}`}>
            <p className="text-xs font-bold text-gray-600 uppercase mb-1">{day.slice(0, 3)}</p>
            <p className="text-sm font-semibold capitalize">{d?.focus || 'rest'}</p>
            <p className="text-xs text-gray-500 mt-1">{d?.duration_mins > 0 ? `${d.duration_mins} min` : 'Off'}</p>
            <p className="text-xs text-gray-400">{d?.intensity}</p>
          </div>
        )
      })}
    </div>
  )
}

// ── MAIN PAGE ──────────────────────────────────────────────────────────────
export default function Home() {
  const [file, setFile] = useState<File | null>(null)
  const [status, setStatus] = useState<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle')
  const [sessionId, setSessionId] = useState<string>('')
  const [report, setReport] = useState<Report | null>(null)
  const [activeTab, setActiveTab] = useState<'overview' | 'movement' | 'plan' | 'drills' | 'log'>('overview')

  // ── Poll for results ──
  const poll = async (sid: string) => {
    const interval = setInterval(async () => {
      const data = await getSession(sid)
      if (data.status === 'done') {
        clearInterval(interval)
        setReport(data.agent_output)
        setStatus('done')
      } else if (data.status === 'failed') {
        clearInterval(interval)
        setStatus('error')
      }
    }, 3000)
  }

  // ── Upload handler ──
  const handleUpload = async () => {
    if (!file) return
    setStatus('uploading')

    // Use test athlete ID from your Supabase DB
    const TEST_ATHLETE_ID = 'b4f773ce-6b51-4775-915d-c7a8b319928a'

    const data = await uploadSession(file, TEST_ATHLETE_ID)
    if (data.session_id) {
      setSessionId(data.session_id)
      setStatus('processing')
      poll(data.session_id)
    } else {
      setStatus('error')
    }
  }

  // ── RENDER ──
  return (
    <div className="min-h-screen bg-gray-950 text-white">

      {/* Header */}
      <header className="border-b border-gray-800 bg-gray-900">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-xl font-black">
            H
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tight">HEXAi</h1>
            <p className="text-xs text-gray-400">Sports Intelligence Platform</p>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-10">

        {/* Upload Section */}
        {status === 'idle' && (
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-10">
              <h2 className="text-4xl font-black mb-3">Analyse Your Performance</h2>
              <p className="text-gray-400">Upload a training video and get AI-powered coaching in seconds</p>
            </div>

            <div
              onClick={() => document.getElementById('fileInput')?.click()}
              className="border-2 border-dashed border-gray-700 rounded-2xl p-16 text-center cursor-pointer hover:border-blue-500 hover:bg-gray-900 transition-all"
            >
              {file ? (
                <div>
                  <p className="text-3xl mb-2">🎬</p>
                  <p className="font-semibold text-green-400">{file.name}</p>
                  <p className="text-sm text-gray-500 mt-1">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                </div>
              ) : (
                <div>
                  <p className="text-5xl mb-4">📹</p>
                  <p className="text-lg font-semibold">Drop your video here</p>
                  <p className="text-gray-500 text-sm mt-2">MP4, MOV, AVI — max 500MB</p>
                </div>
              )}
            </div>

            <input id="fileInput" type="file" accept="video/*" className="hidden"
              onChange={e => setFile(e.target.files?.[0] || null)} />

            <button
              onClick={handleUpload}
              disabled={!file}
              className="w-full mt-6 py-4 rounded-2xl font-bold text-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-400 hover:to-purple-500 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              Analyse with HEXAi →
            </button>
          </div>
        )}

        {/* Processing State */}
        {(status === 'uploading' || status === 'processing') && (
          <div className="max-w-lg mx-auto text-center py-20">
            <div className="text-6xl mb-6 animate-pulse">🤖</div>
            <h3 className="text-2xl font-bold mb-2">
              {status === 'uploading' ? 'Uploading...' : 'Agents Working...'}
            </h3>
            <p className="text-gray-400 mb-8">
              {status === 'processing' && 'Planner → Memory → Analyst → Risk → Coaching → Reporter → Safety'}
            </p>
            <div className="space-y-2 text-left bg-gray-900 rounded-2xl p-6">
              {['🧠 Planner triaging session', '🧬 Memory searching past sessions',
                '🔬 Analyst running biomechanics', '⚠️  Injury risk scoring',
                '🏋️  Coaching agent building plan', '📊 Reporter assembling output',
                '🛡️  Safety guard verifying'].map((step, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm text-gray-300">
                    <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" style={{ animationDelay: `${i * 0.3}s` }} />
                    {step}
                  </div>
                ))}
            </div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className="max-w-lg mx-auto text-center py-20">
            <div className="text-6xl mb-4">❌</div>
            <h3 className="text-2xl font-bold mb-4">Analysis Failed</h3>
            <button onClick={() => setStatus('idle')} className="px-6 py-3 bg-blue-600 rounded-xl font-semibold">
              Try Again
            </button>
          </div>
        )}

        {/* Results */}
        {status === 'done' && report && (
          <div className="space-y-6">

            {/* Top Summary Bar */}
            <div className="bg-gray-900 rounded-2xl p-6 flex items-center justify-between flex-wrap gap-4">
              <div>
                <h2 className="text-2xl font-black">Session Analysis Complete</h2>
                <p className="text-gray-400 text-sm mt-1">Session ID: {sessionId.slice(0, 8)}...</p>
              </div>
              <div className="flex items-center gap-6">
                <RiskBadge level={report.summary?.risk_level} />
                <ScoreRing score={report.summary?.risk_score || 0} />
                <div className="text-center">
                  <p className="text-3xl font-black text-blue-400">{report.summary?.total_issues}</p>
                  <p className="text-xs text-gray-400">Issues Found</p>
                </div>
              </div>
            </div>

            {/* Safety Note */}
            {report.safety_note && (
              <div className="bg-yellow-900/30 border border-yellow-700 rounded-2xl p-4 flex gap-3">
                <span className="text-2xl">⚠️</span>
                <p className="text-yellow-200 text-sm">{report.safety_note}</p>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-800 pb-2">
              {(['overview', 'movement', 'plan', 'drills', 'log'] as const).map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 rounded-t-lg text-sm font-semibold capitalize transition-colors ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-400 hover:text-white'}`}>
                  {tab === 'overview' ? '📋 Overview' :
                    tab === 'movement' ? '🔬 Movement' :
                      tab === 'plan' ? '📅 Plan' :
                        tab === 'drills' ? '🏋️ Drills' : '🤖 Agents'}
                </button>
              ))}
            </div>

            {/* Tab: Overview */}
            {activeTab === 'overview' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-gray-900 rounded-2xl p-6">
                  <h3 className="font-bold text-lg mb-4">🎯 Coaching Cues</h3>
                  <ul className="space-y-3">
                    {report.coaching_cues?.map((cue, i) => (
                      <li key={i} className="flex gap-3 items-start">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-xs flex items-center justify-center font-bold flex-shrink-0 mt-0.5">
                          {i + 1}
                        </span>
                        <p className="text-gray-200 text-sm">{cue}</p>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="bg-gray-900 rounded-2xl p-6">
                  <h3 className="font-bold text-lg mb-4">⚡ Quick Stats</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center py-2 border-b border-gray-800">
                      <span className="text-gray-400">Risk Level</span>
                      <RiskBadge level={report.summary?.risk_level} />
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-800">
                      <span className="text-gray-400">Risk Score</span>
                      <span className="font-bold">{report.summary?.risk_score}/100</span>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b border-gray-800">
                      <span className="text-gray-400">Issues Found</span>
                      <span className="font-bold">{report.summary?.total_issues}</span>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span className="text-gray-400">Drills Recommended</span>
                      <span className="font-bold">{report.recommended_drills?.length}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Tab: Movement */}
            {activeTab === 'movement' && (
              <div className="space-y-4">
                {report.movement_analysis?.map((issue, i) => (
                  <div key={i} className="bg-gray-900 rounded-2xl p-6">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-bold text-lg capitalize">{issue.issue?.replace(/_/g, ' ')}</h4>
                      <span className={`px-3 py-1 rounded-full text-sm font-bold ${issue.severity >= 7 ? 'bg-red-900 text-red-300' :
                        issue.severity >= 4 ? 'bg-yellow-900 text-yellow-300' :
                          'bg-green-900 text-green-300'}`}>
                        Severity {issue.severity}/10
                      </span>
                    </div>
                    <p className="text-blue-400 text-sm font-semibold mb-2">Root Cause: {issue.root_cause}</p>
                    <p className="text-gray-400 text-sm">{issue.explanation}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Plan */}
            {activeTab === 'plan' && (
              <div className="bg-gray-900 rounded-2xl p-6">
                <h3 className="font-bold text-lg mb-6">📅 7-Day Training Plan</h3>
                <WeeklyPlan plan={report.weekly_plan} />
              </div>
            )}

            {/* Tab: Drills */}
            {activeTab === 'drills' && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {report.recommended_drills?.map((drill, i) => (
                  <div key={i} className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                    <div className="flex items-center gap-2 mb-3">
                      <span className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center text-sm font-bold">
                        #{i + 1}
                      </span>
                      <h4 className="font-bold">{drill.name}</h4>
                    </div>
                    <div className="mt-2">
                      <div className="flex justify-between text-xs text-gray-400 mb-1">
                        <span>Relevance</span>
                        <span>{(drill.score * 100).toFixed(0)}%</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2">
                        <div className="bg-blue-500 h-2 rounded-full"
                          style={{ width: `${drill.score * 100}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Tab: Agent Log */}
            {activeTab === 'log' && (
              <div className="bg-gray-900 rounded-2xl p-6">
                <h3 className="font-bold text-lg mb-4">🤖 Agent Execution Log</h3>
                <div className="space-y-2 font-mono text-sm">
                  {report.agent_log?.map((entry, i) => (
                    <div key={i} className="flex gap-3 items-start py-2 border-b border-gray-800">
                      <span className="text-gray-600 text-xs mt-0.5 w-5">{i + 1}</span>
                      <span className="text-green-400">{entry}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Analyse Again Button */}
            <button onClick={() => { setStatus('idle'); setFile(null); setReport(null) }}
              className="w-full py-3 rounded-xl border border-gray-700 text-gray-400 hover:text-white hover:border-gray-500 transition-all text-sm">
              ← Analyse Another Session
            </button>
          </div>
        )}
      </main>
    </div>
  )
}