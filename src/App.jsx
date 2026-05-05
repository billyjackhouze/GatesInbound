import { useState, useEffect, useCallback, useRef } from 'react'

const REFRESH_MS = 60_000

// ── Date helpers ──────────────────────────────────────────────────────────────

function parseFMDate(str) {
  if (!str) return null
  const parts = str.split('/')
  if (parts.length !== 3) return null
  const [m, d, y] = parts.map(Number)
  if (!m || !d || !y) return null
  return new Date(y, m - 1, d, 12, 0, 0)
}

function formatDate(str) {
  const d = parseFMDate(str)
  if (!d) return str || '—'
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}

function arrivalStatus(str) {
  const d = parseFMDate(str)
  if (!d) return 'upcoming'
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const diff = Math.round((d - today) / 86_400_000)
  if (diff < 0)   return 'overdue'
  if (diff === 0) return 'today'
  if (diff <= 3)  return 'soon'
  return 'upcoming'
}

function timeAgo(ts) {
  if (!ts) return ''
  const secs = Math.round((Date.now() - ts) / 1000)
  if (secs < 10)  return 'just now'
  if (secs < 60)  return `${secs}s ago`
  if (secs < 120) return '1m ago'
  return `${Math.round(secs / 60)}m ago`
}

// ── Group by day ──────────────────────────────────────────────────────────────

function dayKey(expArrival) {
  const d = parseFMDate(expArrival)
  if (!d) return 'UNKNOWN DATE'
  d.setHours(0, 0, 0, 0)                          // normalize to midnight
  const today = new Date(); today.setHours(0,0,0,0)
  const diff  = Math.round((d - today) / 86_400_000)
  if (diff < 0)  return '__OVERDUE'   // all past dates → one group
  if (diff === 0) return '__TODAY'
  if (diff === 1) return '__TOMORROW'
  return expArrival                   // future: use raw date as key, sorted below
}

function dayLabel(key) {
  if (key === '__OVERDUE')  return 'OVERDUE'
  if (key === '__TODAY')    return 'TODAY'
  if (key === '__TOMORROW') return 'TOMORROW'
  const d = parseFMDate(key)
  if (!d) return key
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' }).toUpperCase()
}

function dayIcon(key) {
  if (key === '__OVERDUE')  return '🔴'
  if (key === '__TODAY')    return '🟢'
  if (key === '__TOMORROW') return '🟡'
  return '📅'
}

function groupByDay(records) {
  const map = new Map()
  // Preserve sort order — records already sorted by ExpArrivalDate asc from server
  for (const r of records) {
    const key = dayKey(r.expArrival)
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  // Sort groups: overdue first, today, tomorrow, then future dates in order
  const order = ['__OVERDUE', '__TODAY', '__TOMORROW']
  return Array.from(map.entries()).sort(([a], [b]) => {
    const ai = order.indexOf(a)
    const bi = order.indexOf(b)
    if (ai !== -1 && bi !== -1) return ai - bi
    if (ai !== -1) return -1
    if (bi !== -1) return 1
    // Both are raw dates — sort chronologically
    const da = parseFMDate(a), db = parseFMDate(b)
    return (da || 0) - (db || 0)
  })
}

// ── Live clock ────────────────────────────────────────────────────────────────

function Clock() {
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')
  useEffect(() => {
    function tick() {
      const now = new Date()
      setTime(now.toLocaleTimeString('en-US', {
        timeZone: 'America/Chicago', hour12: true,
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      }) + ' CT')
      setDate(now.toLocaleDateString('en-US', {
        timeZone: 'America/Chicago', weekday: 'short',
        month: 'short', day: 'numeric', year: 'numeric',
      }))
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [])
  return (
    <div className="header-right">
      <div className="clock">{time}</div>
      <div className="dateline">{date}</div>
    </div>
  )
}

// ── Fullscreen button — matches Delivery Tickets style ────────────────────────

function FullscreenButton() {
  const [isFull, setIsFull] = useState(false)
  useEffect(() => {
    const onChange = () => setIsFull(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  const toggle = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }
  return (
    <button className="fs-btn" onClick={toggle} title={isFull ? 'Exit fullscreen' : 'Enter fullscreen'}>
      {isFull ? '✕' : '⛶'}
      <span className="fs-label">{isFull ? 'EXIT FULL' : 'FULLSCREEN'}</span>
    </button>
  )
}

// ── Header ────────────────────────────────────────────────────────────────────

function Header() {
  return (
    <header className="header">
      <div className="logo-wrap">
        <img src="/gates_logo.avif" alt="Gates Engineered Lubricants" className="logo-img" />
      </div>
      <div className="title-block">
        <div className="app-title">Inbound Shipments</div>
        <div className="app-sub">Gates Engineered Lubricants — Live Board</div>
      </div>
      <Clock />
      <FullscreenButton />
    </header>
  )
}

// ── Status bar ────────────────────────────────────────────────────────────────

function StatusBar({ connected, total, syncedAt }) {
  const [ago, setAgo] = useState('')
  useEffect(() => {
    const id = setInterval(() => setAgo(timeAgo(syncedAt)), 10_000)
    setAgo(timeAgo(syncedAt))
    return () => clearInterval(id)
  }, [syncedAt])
  return (
    <div className="statusbar">
      <span className={`status-dot ${connected ? 'live' : 'dead'}`} />
      <span className="status-text">
        {connected ? 'Live — updates automatically' : 'Disconnected'}
      </span>
      {total > 0 && (
        <span className="shipment-count">
          {total} {total === 1 ? 'SHIPMENT' : 'SHIPMENTS'}
        </span>
      )}
      {ago && <span className="last-update">Updated {ago}</span>}
    </div>
  )
}

// ── Shipment row ──────────────────────────────────────────────────────────────

function ShipmentRow({ record, index }) {
  const status = arrivalStatus(record.expArrival)
  return (
    <div className={`ship-row ${index % 2 === 0 ? 'even' : 'odd'}`}>
      <div className="ship-top">
        <span className={`ship-ticket ${status}`}>
          {record.ticketNumber || record.gelPO || '—'}
        </span>
        <span className={`ship-date ${status}`}>
          {formatDate(record.expArrival)}
        </span>
      </div>
      <div className="ship-vendor">{record.vendor || '—'}</div>
      <div className="ship-footer">
        {record.billOfLading && (
          <span className="ship-meta">
            <span className="ship-meta-label">BOL</span>
            {record.billOfLading}
          </span>
        )}
        {record.billOfLading && record.gelPO && (
          <span className="meta-divider">·</span>
        )}
        {record.gelPO && (
          <span className="ship-meta">
            <span className="ship-meta-label">PO</span>
            {record.gelPO}
          </span>
        )}
        {record.carrier && (
          <>
            <span className="meta-divider">·</span>
            <span className="ship-meta">{record.carrier}</span>
          </>
        )}
        {record.logisticsco && (
          <>
            <span className="meta-divider">·</span>
            <span className="ship-meta">{record.logisticsco}</span>
          </>
        )}
      </div>
    </div>
  )
}

// ── Day group ─────────────────────────────────────────────────────────────────

function DayGroup({ dayKey: key, records }) {
  return (
    <div className="carrier-section">
      <div className={`carrier-header day-${key.replace('__','').toLowerCase()}`}>
        <span className="carrier-icon">{dayIcon(key)}</span>
        <span className="carrier-name">{dayLabel(key)}</span>
        <span className="carrier-badge">
          {records.length} {records.length === 1 ? 'Shipment' : 'Shipments'}
        </span>
      </div>
      {records.map((r, i) => (
        <ShipmentRow key={r.recordId} record={r} index={i} />
      ))}
    </div>
  )
}

// ── Empty state ───────────────────────────────────────────────────────────────

function EmptyState({ error }) {
  return (
    <div className="empty-state">
      <div className="empty-icon">{error ? '⚠️' : '✅'}</div>
      <div className="empty-label">
        {error ? 'Failed to load shipments' : 'No Pending Inbound Shipments'}
      </div>
      <div className="empty-sub">
        {error ? error : 'Board updates automatically · ±30-day window'}
      </div>
    </div>
  )
}

// ── Auto-fit hook — scales #root so all records fit without scrolling ─────────
// Mirrors Delivery Tickets useAutoFit exactly.

function useAutoFit(triggerKey) {
  useEffect(() => {
    function fit() {
      const root = document.getElementById('root')
      if (!root) return
      root.style.transform = 'none'
      root.style.width = ''
      requestAnimationFrame(() => {
        const naturalH = root.scrollHeight
        const viewH    = window.innerHeight
        const viewW    = window.innerWidth
        if (naturalH > viewH + 4) {
          const scale = viewH / naturalH
          root.style.transformOrigin = 'top left'
          root.style.transform       = `scale(${scale})`
          root.style.width           = `${viewW / scale}px`
        }
      })
    }
    const raf = requestAnimationFrame(fit)
    window.addEventListener('resize', fit)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('resize', fit)
    }
  }, [triggerKey])
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [records,  setRecords]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [syncedAt, setSyncedAt] = useState(null)
  const [live,     setLive]     = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/inbound-shipments')
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      setRecords(data.records || [])
      setSyncedAt(Date.now())
      setLive(true)
      setError(null)
    } catch (err) {
      setError(err.message)
      setLive(false)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  const groups = groupByDay(records)

  // Re-fit whenever record count changes or window resizes
  useAutoFit(JSON.stringify(groups.map(g => g[1].length)))

  let boardContent
  if (loading && records.length === 0) {
    boardContent = (
      <div className="empty-state">
        <div className="empty-icon" style={{ opacity: 0.3 }}>⏳</div>
        <div className="empty-label">Loading Shipments…</div>
        <div className="empty-sub">Connecting to GEL Sidekick</div>
      </div>
    )
  } else if (error && records.length === 0) {
    boardContent = <EmptyState error={error} />
  } else if (records.length === 0) {
    boardContent = <EmptyState />
  } else {
    boardContent = groups.map(([key, recs]) => (
      <DayGroup key={key} dayKey={key} records={recs} />
    ))
  }

  return (
    <>
      <Header />
      <StatusBar connected={live} total={records.length} syncedAt={syncedAt} />
      <main className="board">{boardContent}</main>
    </>
  )
}
