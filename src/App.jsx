import { useState, useEffect, useCallback, useRef } from 'react'

const REFRESH_MS = 60_000   // auto-sync every 60 seconds

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

/** Returns 'overdue' | 'today' | 'soon' (≤3 days) | 'upcoming' */
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

// ── Group records by carrier ──────────────────────────────────────────────────

function groupByCarrier(records) {
  const map = new Map()
  for (const r of records) {
    const key = r.carrier || 'Unknown Carrier'
    if (!map.has(key)) map.set(key, [])
    map.get(key).push(r)
  }
  // Sort carriers alphabetically; records within each group are already sorted by ExpArrivalDate
  return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
}

// ── Live clock — CT ───────────────────────────────────────────────────────────

function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', second: '2-digit',
    timeZone: 'America/Chicago',
  })
  const date = now.toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
    timeZone: 'America/Chicago',
  })
  return (
    <div className="clock">
      <div className="clock-time">{time}</div>
      <div className="clock-date">{date} CT</div>
    </div>
  )
}

// ── Carrier group header + rows ───────────────────────────────────────────────

function ShipmentRow({ record }) {
  const status = arrivalStatus(record.expArrival)
  return (
    <div className="shipment-row">
      <div className="row-top">
        <span className={`ticket-num status-${status}`}>
          {record.ticketNumber || record.gelPO || '—'}
        </span>
        <span className={`row-date status-${status}`}>
          {formatDate(record.expArrival)}
        </span>
      </div>
      <div className="row-vendor">{record.vendor || '—'}</div>
      <div className="row-sub">
        {record.billOfLading ? <>BOL {record.billOfLading}<span className="dot-sep"> · </span></> : null}
        {record.gelPO ? <>PO {record.gelPO}<span className="dot-sep"> · </span></> : null}
        <span>{record.logisticsco || ''}</span>
      </div>
    </div>
  )
}

function CarrierGroup({ carrier, records }) {
  return (
    <div className="carrier-group">
      <div className="carrier-header">
        <span className="carrier-emoji">📦</span>
        <span className="carrier-name">{carrier}</span>
        <span className="carrier-count">
          {records.length} shipment{records.length !== 1 ? 's' : ''}
        </span>
      </div>
      {records.map(r => <ShipmentRow key={r.recordId} record={r} />)}
    </div>
  )
}

// ── Fullscreen helpers ────────────────────────────────────────────────────────

function useFullscreen() {
  const [full, setFull] = useState(false)
  useEffect(() => {
    const handler = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])
  const toggle = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {})
    } else {
      document.exitFullscreen().catch(() => {})
    }
  }, [])
  return { full, toggle }
}

// ── "Updated X min ago" counter ───────────────────────────────────────────────

function useAgoText(syncedAt) {
  const [agoText, setAgoText] = useState('')
  useEffect(() => {
    if (!syncedAt) { setAgoText(''); return }
    const update = () => {
      const secs = Math.round((Date.now() - syncedAt) / 1000)
      if (secs < 60)       setAgoText(`Updated just now`)
      else if (secs < 120) setAgoText(`Updated 1 min ago`)
      else                 setAgoText(`Updated ${Math.floor(secs / 60)} min ago`)
    }
    update()
    const t = setInterval(update, 15_000)
    return () => clearInterval(t)
  }, [syncedAt])
  return agoText
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [records,  setRecords]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState(null)
  const [syncedAt, setSyncedAt] = useState(null)   // timestamp ms
  const [live,     setLive]     = useState(false)
  const { full, toggle: toggleFull } = useFullscreen()
  const agoText = useAgoText(syncedAt)

  // ── Load shipments ─────────────────────────────────────────
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

  // ── Boot + auto-refresh ────────────────────────────────────
  useEffect(() => {
    load()
    const t = setInterval(load, REFRESH_MS)
    return () => clearInterval(t)
  }, [load])

  // ── Group records ──────────────────────────────────────────
  const groups = groupByCarrier(records)

  // ── Board content ──────────────────────────────────────────
  let boardContent
  if (loading && records.length === 0) {
    boardContent = (
      <div className="empty-state">
        <div className="empty-icon">⏳</div>
        <div>Loading shipments…</div>
      </div>
    )
  } else if (error && records.length === 0) {
    boardContent = (
      <div className="empty-state">
        <div className="empty-icon">⚠️</div>
        <div>Failed to load: {error}</div>
      </div>
    )
  } else if (records.length === 0) {
    boardContent = (
      <div className="empty-state">
        <div className="empty-icon">✅</div>
        <div>No pending inbound shipments in the ±30-day window</div>
      </div>
    )
  } else {
    boardContent = groups.map(([carrier, recs]) => (
      <CarrierGroup key={carrier} carrier={carrier} records={recs} />
    ))
  }

  // ── Render ─────────────────────────────────────────────────
  return (
    <>
      {/* ── Top bar ── */}
      <div className="topbar">
        <div className="topbar-left">
          <img src="/gates_logo.avif" alt="Gates Engineered Lubricants" className="logo" />
          <div className="title-block">
            <div className="title">INBOUND SHIPMENTS</div>
            <div className="subtitle">GATES ENGINEERED LUBRICANTS · LIVE BOARD</div>
          </div>
        </div>

        <div className="topbar-right">
          <LiveClock />
          <button className="exit-btn" onClick={toggleFull}>
            {full ? 'EXIT FULL' : 'FULL SCREEN'}
          </button>
        </div>
      </div>

      {/* ── Status bar ── */}
      <div className="status-bar">
        <div className="status-left">
          <div className={`live-dot ${live ? 'live' : 'dead'}`} />
          <span className="live-text">
            {live ? 'Live — updates automatically' : 'Disconnected'}
          </span>
        </div>
        <div className="status-right">
          <span className="count-badge">
            {records.length} SHIPMENT{records.length !== 1 ? 'S' : ''}
          </span>
          {agoText && <span className="updated-text">{agoText}</span>}
          <button
            className="exit-btn"
            style={{ padding: '4px 12px', fontSize: 12, background: '#0e7490' }}
            onClick={load}
            disabled={loading}
          >
            {loading ? '⟳' : '↻ Sync'}
          </button>
        </div>
      </div>

      {/* ── Scrollable board ── */}
      <div className="content">
        {boardContent}
      </div>
    </>
  )
}
