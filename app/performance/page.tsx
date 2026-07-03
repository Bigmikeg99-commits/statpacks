'use client'
import { useEffect, useState, useRef } from 'react'
import Script from 'next/script'
import Link from 'next/link'

/* ---- types ---- */
interface ThresholdBucket {
  line: number; label: string
  over:  { w: number; l: number; pct: number; n: number }
  under: { w: number; l: number; pct: number; n: number }
  total: { w: number; l: number; pct: number; n: number }
}
interface Season {
  record: string; overs: string; unders: string; picks: number
  date_range: string; overall_pct: string; over_pct: string; under_pct: string
}
interface Day { d: string; w: number; l: number; p: number }
interface Seg { l: string; w: number; lo: number; pct: number; e: number }
interface PerfData {
  season: Season
  daily: Day[]
  thresholdStats: ThresholdBucket[]
  monthlyThresholds?: Record<string, ThresholdBucket[]>
  overSegs: Seg[]
  underSegs: Seg[]
  updated: string
}

/* ---- helpers ---- */
function gradeColor(pct: number): string {
  if (pct >= 60) return '#3ab05a'
  if (pct >= 50) return '#D4AF37'
  return '#C44536'
}

function dayColor(p: number) {
  if (p >= 60) return { bg: 'rgba(58,176,90,0.15)',  border: 'rgba(58,176,90,0.35)',  pct: '#3ab05a' }
  if (p >= 50) return { bg: 'rgba(212,175,55,0.12)', border: 'rgba(212,175,55,0.3)',  pct: '#D4AF37' }
  return        { bg: 'rgba(196,69,54,0.12)',  border: 'rgba(196,69,54,0.3)',   pct: '#C44536' }
}

let chartInst: any = null
let axisInst:  any = null

function renderRollingChart(
  daily: Day[],
  canvas: HTMLCanvasElement,
  season: Season,
  axisCanvas?: HTMLCanvasElement | null
) {
  const Chart = (window as any).Chart
  if (!Chart) return
  if (chartInst) { chartInst.destroy(); chartInst = null }
  if (axisInst)  { axisInst.destroy();  axisInst  = null }

  const allDates = daily.map(d => d.d)
  const n = allDates.length
  const grid = 'rgba(212,175,55,0.08)'
  const tick  = 'rgba(245,241,230,0.6)'
  const BLUE  = '#4EABDE'
  const GREEN = '#3ab05a'
  const GOLD  = '#D4AF37'

  const roll = (windowSize: number) => {
    const map = new Map(daily.map(d => [d.d, d]))
    return allDates.map((_date, i) => {
      const win  = allDates.slice(Math.max(0, i - (windowSize - 1)), i + 1)
      const days = win.map(d => map.get(d)).filter(Boolean) as Day[]
      if (!days.length) return null
      const tw = days.reduce((a, x) => a + x.w, 0)
      const tl = days.reduce((a, x) => a + x.l, 0)
      return tw + tl > 0 ? parseFloat(((tw / (tw + tl)) * 100).toFixed(1)) : null
    })
  }

  const roll7  = roll(7)
  const roll30 = roll(30)

  const allVals = [...roll7, ...roll30].filter(v => v !== null) as number[]
  const yMax = allVals.length ? Math.ceil((Math.max(...allVals) + 4) / 5) * 5 : 90
  const yMin = allVals.length ? Math.floor((Math.min(...allVals) - 4) / 5) * 5 : 30

  // PSI+ marker at 6/11
  const splitIdx = allDates.indexOf('6/11')

  const endLabelPlugin = {
    id: 'endLabel',
    afterDraw(chart: any) {
      const ds0 = chart.data.datasets[0]
      let lastI = -1
      ds0.data.forEach((v: any, i: number) => { if (v != null) lastI = i })
      if (lastI < 0) return
      const meta = chart.getDatasetMeta(0)
      const pt = meta.data[lastI]
      if (!pt) return
      const ctx2 = chart.ctx
      ctx2.save()
      ctx2.font = '500 10px Inter,sans-serif'
      const lbl = `${season.record} · ${season.overall_pct}%`
      const tw2 = ctx2.measureText(lbl).width
      const px = pt.x + 8, py = pt.y - 4
      ctx2.fillStyle = 'rgba(13,30,53,0.88)'
      ctx2.fillRect(px - 2, py - 12, tw2 + 10, 16)
      ctx2.fillStyle = BLUE
      ctx2.fillText(lbl, px + 3, py)
      ctx2.restore()
    }
  }

  const psiMarkerPlugin = {
    id: 'psiMarker',
    afterDraw(chart: any) {
      if (splitIdx < 0) return
      const meta = chart.getDatasetMeta(0)
      const pt = meta.data[splitIdx]
      if (!pt) return
      const ctx2 = chart.ctx
      const top = chart.scales.y.top, bottom = chart.scales.y.bottom
      ctx2.save()
      ctx2.strokeStyle = 'rgba(212,175,55,0.45)'
      ctx2.setLineDash([4, 3])
      ctx2.lineWidth = 1
      ctx2.beginPath()
      ctx2.moveTo(pt.x, top)
      ctx2.lineTo(pt.x, bottom)
      ctx2.stroke()
      ctx2.setLineDash([])
      ctx2.font = '600 9px Inter,sans-serif'
      const lbl = 'PSI+ Added'
      const tw2 = ctx2.measureText(lbl).width
      ctx2.fillStyle = 'rgba(212,175,55,0.9)'
      ctx2.fillText(lbl, pt.x - tw2 / 2, top - 4)
      ctx2.restore()
    }
  }

  const PX_PER_DAY = 48
  const totalWidth = Math.max(n * PX_PER_DAY, 400)
  canvas.style.width  = totalWidth + 'px'
  canvas.style.height = '160px'
  canvas.width  = totalWidth * window.devicePixelRatio
  canvas.height = 160 * window.devicePixelRatio

  chartInst = new Chart(canvas, {
    type: 'line',
    plugins: [endLabelPlugin, psiMarkerPlugin],
    data: {
      labels: allDates,
      datasets: [
        {
          label: '7-Day',
          data: roll7,
          borderColor: (ctx: any) => splitIdx >= 0 && ctx.p0DataIndex >= splitIdx ? GOLD : BLUE,
          segment: { borderColor: (ctx: any) => splitIdx >= 0 && ctx.p0DataIndex >= splitIdx ? GOLD : BLUE },
          borderWidth: 2.5,
          pointRadius: 2,
          pointBackgroundColor: (ctx: any) => splitIdx >= 0 && ctx.dataIndex >= splitIdx ? GOLD : BLUE,
          fill: false, tension: 0.35, spanGaps: false,
        },
        {
          label: '30-Day',
          data: roll30,
          borderColor: GREEN, borderWidth: 2, pointRadius: 1.5,
          pointBackgroundColor: GREEN, fill: false, tension: 0.35, spanGaps: false,
        },
        {
          data: Array(n).fill(52.4),
          borderColor: 'rgba(212,175,55,0.18)', borderWidth: 1,
          borderDash: [2, 4], pointRadius: 0, fill: false,
        },
      ],
    },
    options: {
      responsive: false, maintainAspectRatio: false,
      animation: { duration: 1200, easing: 'easeInOutQuart' },
      layout: { padding: { right: 115, top: 14 } },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (ctx: any) => ctx.dataset.label ? ctx.dataset.label + ': ' + ctx.parsed.y + '%' : '' } },
      },
      scales: {
        x: { ticks: { color: tick, font: { size: 11 }, maxRotation: 45 }, grid: { color: grid } },
        y: { min: yMin, max: yMax, ticks: { display: false }, grid: { color: grid }, border: { display: false } },
      },
    },
  })

  // Scroll to end
  const scroll = document.getElementById('perfChartScroll')
  if (scroll) setTimeout(() => { scroll.scrollLeft = totalWidth }, 100)

  // Sticky y-axis
  if (axisCanvas) {
    const AXIS_W = 34
    axisCanvas.style.width  = AXIS_W + 'px'
    axisCanvas.style.height = '160px'
    axisCanvas.width  = AXIS_W * window.devicePixelRatio
    axisCanvas.height = 160 * window.devicePixelRatio
    axisInst = new Chart(axisCanvas, {
      type: 'line',
      data: { labels: allDates, datasets: [{ data: Array(n).fill(null), pointRadius: 0, borderWidth: 0 }] },
      options: {
        responsive: false, maintainAspectRatio: false,
        animation: false,
        layout: { padding: { top: 14 } },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { ticks: { color: 'rgba(0,0,0,0)', font: { size: 11 }, maxRotation: 45 }, grid: { display: false }, border: { display: false } },
          y: { min: yMin, max: yMax, ticks: { color: tick, font: { size: 11 }, callback: (v: number) => v + '%' }, grid: { display: false }, border: { display: false } },
        },
      },
    })
  }
}

/* ---- component ---- */
export default function PerformancePage() {
  const [data,       setData]       = useState<PerfData | null>(null)
  const [chartReady, setChartReady] = useState(false)
  const [calMonth,    setCalMonth]   = useState<string>(String(new Date().getMonth() + 1))
  const [threshMonth, setThreshMonth] = useState<string>('all')
  const [menuOpen,    setMenuOpen]   = useState(false)
  const chartRef = useRef<HTMLCanvasElement>(null)
  const axisRef  = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    fetch('/data/picks.json').then(r => r.json()).then(setData).catch(() => {})
  }, [])

  useEffect(() => {
    const els = document.querySelectorAll('.fade-in')
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target) } })
    }, { threshold: 0.1 })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [data, calMonth])

  useEffect(() => {
    if (!data?.daily?.length || !data.season || !chartReady) return
    if (chartRef.current) renderRollingChart(data.daily, chartRef.current, data.season, axisRef.current)
    return () => {
      if (chartInst) { chartInst.destroy(); chartInst = null }
      if (axisInst)  { axisInst.destroy();  axisInst  = null }
    }
  }, [data, chartReady])

  const s        = data?.season
  const overPct  = parseFloat(s?.over_pct  || '0')
  const underPct = parseFloat(s?.under_pct || '0')
  const totalPct = parseFloat(s?.overall_pct || '0')
  const edge     = (totalPct - 52.4).toFixed(1)
  const edgePos  = totalPct >= 52.4

  const MONTH_NAMES: Record<string, string> = {
    '3':'March','4':'April','5':'May','6':'June',
    '7':'July','8':'August','9':'September','10':'October'
  }

  const calMonths = data?.daily
    ? Array.from(new Set(data.daily.map(d => d.d.split('/')[0]))).sort((a, b) => +a - +b)
    : []

  const filteredDays = data?.daily
    ? (calMonth === 'all' ? data.daily : data.daily.filter(d => d.d.split('/')[0] === calMonth))
    : []

  const filteredW    = filteredDays.reduce((a, d) => a + d.w, 0)
  const filteredL    = filteredDays.reduce((a, d) => a + d.l, 0)
  const filteredPct  = (filteredW + filteredL) > 0 ? ((filteredW / (filteredW + filteredL)) * 100).toFixed(1) : '0.0'
  const filteredGood = parseFloat(filteredPct) >= 52.4

  return (
    <>
      <Script
        src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.js"
        onLoad={() => setChartReady(true)}
      />

      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-logo-badge"><span>StatPacks</span></div>
        </div>
        <div className="nav-links">
          <Link href="/">Home</Link>
          <Link href="/psi" style={{color:'var(--gold)'}}>PSI+</Link>
          <Link href="/#picks">Picks</Link>
          <Link href="/performance">Performance</Link>
        </div>
        <button className={`nav-hamburger${menuOpen ? ' open' : ''}`} aria-label="Menu"
          onClick={() => setMenuOpen(o => !o)}>
          <span/><span/><span/>
        </button>
      </nav>
      <div className={`nav-mobile${menuOpen ? ' open' : ''}`}>
        <Link href="/"            onClick={() => setMenuOpen(false)}>Home</Link>
        <Link href="/psi"         onClick={() => setMenuOpen(false)} style={{color:'var(--gold)'}}>PSI+</Link>
        <Link href="/#picks"      onClick={() => setMenuOpen(false)}>Picks</Link>
        <Link href="/performance" onClick={() => setMenuOpen(false)}>Performance</Link>
      </div>

      {/* PAGE BODY */}
      <div className="perf-page">

        {/* HEADER */}
        <div className="perf-header fade-in">
          <div className="sec-eyebrow">MLB · PSI+ V2</div>
          <h1 className="perf-title">Performance</h1>
          <p className="perf-subtitle">
            {s?.date_range ? `${s.date_range} · ${s.picks} picks` : 'Loading…'}
          </p>
          {data && <p className="updated-tag">Updated: {data.updated}</p>}
        </div>

        {/* SEASON STAT CARDS */}
        {s && (
          <div className="perf-stats-grid fade-in">
            <div className="perf-stat-card">
              <div className="perf-stat-lbl">Season Record</div>
              <div className="perf-stat-val">{s.record}</div>
              <div className="perf-stat-sub">{s.picks} settled picks</div>
            </div>
            <div className="perf-stat-card">
              <div className="perf-stat-lbl">Win Rate</div>
              <div className="perf-stat-val" style={{ color: edgePos ? '#3ab05a' : '#C44536' }}>
                {totalPct}%
              </div>
              <div className="perf-stat-sub" style={{ color: edgePos ? 'rgba(58,176,90,0.6)' : 'rgba(196,69,54,0.5)' }}>
                {edgePos ? '+' : ''}{edge}pp vs −110 breakeven
              </div>
            </div>
            <div className="perf-stat-card">
              <div className="perf-stat-lbl">Overs</div>
              <div className="perf-stat-val">{s.overs}</div>
              <div className="perf-stat-sub">{overPct}% win rate</div>
            </div>
            <div className="perf-stat-card">
              <div className="perf-stat-lbl">Unders</div>
              <div className="perf-stat-val">{s.unders}</div>
              <div className="perf-stat-sub">{underPct}% win rate</div>
            </div>
          </div>
        )}

        {/* ROLLING WIN RATE CHART */}
        {data?.daily?.length ? (
          <div className="perf-section fade-in">
            <div className="trend-card">
              <div className="trend-header">
                <span className="trend-title">Rolling Win Rate</span>
                <div className="legend">
                  <div className="leg"><div className="leg-line" style={{background:'#4EABDE'}}/> 7-Day</div>
                  <div className="leg"><div className="leg-line" style={{background:'#3ab05a'}}/> 30-Day</div>
                  <div className="leg"><div className="leg-line" style={{background:'#D4AF37',opacity:0.8}}/> PSI+ Added</div>
                </div>
              </div>
              <div id="perfChartScroll" style={{overflowX:'auto',overflowY:'hidden',WebkitOverflowScrolling:'touch' as any,display:'flex'}}>
                <div style={{position:'sticky',left:0,zIndex:2,background:'var(--surf)',flex:'0 0 auto',height:'160px'}}>
                  <canvas ref={axisRef}/>
                </div>
                <div style={{position:'relative',height:'160px',flex:'1 0 auto'}}>
                  <canvas ref={chartRef}/>
                </div>
              </div>
              <div style={{textAlign:'right',fontSize:'9px',color:'rgba(212,175,55,0.35)',marginTop:'4px',letterSpacing:'0.05em'}}>← scroll to view earlier dates</div>
            </div>
          </div>
        ) : null}

        {/* THRESHOLD BREAKDOWN */}
        {data?.thresholdStats?.length ? (
          <div className="perf-section fade-in">
            <div style={{display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:'8px',marginBottom:'16px'}}>
              <div>
                <div className="perf-section-eyebrow">Breakdown</div>
                <h2 className="perf-section-title" style={{marginBottom:'4px'}}>Performance by K Line Threshold</h2>
                <p className="perf-section-sub">Where the model is strongest — and where to be cautious.</p>
              </div>
              <select
                className="filter-select"
                value={threshMonth}
                onChange={e => setThreshMonth(e.target.value)}
                style={{fontSize:'9px',padding:'4px 24px 4px 8px',minWidth:'unset',alignSelf:'flex-end'}}
              >
                <option value="all">Full Season</option>
                {calMonths.map(m => (
                  <option key={m} value={m}>{MONTH_NAMES[m] || m}</option>
                ))}
              </select>
            </div>
            {(() => {
              const activeThresholds = threshMonth === 'all'
                ? data.thresholdStats
                : (data.monthlyThresholds?.[threshMonth] ?? [])
              return activeThresholds.length === 0
                ? <div className="no-picks" style={{padding:'24px 0',textAlign:'center',color:'rgba(245,241,230,0.3)',fontSize:'13px'}}>No data for this month yet.</div>
                : (
            <div className="perf-thresh-table">
              <div className="perf-thresh-head">
                <div>Threshold</div>
                <div>Total</div>
                <div>Win %</div>
                <div>vs −110</div>
                <div>Overs</div>
                <div>Unders</div>
              </div>
              {activeThresholds.map((row) => {
                const edgePp = (row.total.pct - 52.4).toFixed(1)
                const edgeC  = row.total.pct >= 52.4 ? '#3ab05a' : '#C44536'
                return (
                  <div className="perf-thresh-row" key={row.label}>
                    <div className="perf-thresh-label">{row.label}</div>
                    <div className="perf-thresh-cell">
                      <span className="perf-thresh-big">{row.total.w}–{row.total.l}</span>
                      <span className="perf-thresh-small">n={row.total.n}</span>
                    </div>
                    <div className="perf-thresh-cell">
                      <span className="perf-thresh-big" style={{ color: gradeColor(row.total.pct) }}>
                        {row.total.pct}%
                      </span>
                      <div className="perf-bar-wrap">
                        <div className="perf-bar" style={{
                          width: `${Math.min(row.total.pct, 100)}%`,
                          background: gradeColor(row.total.pct),
                        }}/>
                      </div>
                    </div>
                    <div className="perf-thresh-cell">
                      <span className="perf-thresh-big" style={{ color: edgeC }}>
                        {row.total.pct >= 52.4 ? '+' : ''}{edgePp}pp
                      </span>
                    </div>
                    <div className="perf-thresh-cell">
                      {row.over.n > 0 ? (
                        <>
                          <span className="perf-thresh-big">{row.over.w}–{row.over.l}</span>
                          <span className="perf-thresh-small" style={{ color: gradeColor(row.over.pct) }}>
                            {row.over.pct}%
                          </span>
                        </>
                      ) : <span className="perf-thresh-small">—</span>}
                    </div>
                    <div className="perf-thresh-cell">
                      {row.under.n > 0 ? (
                        <>
                          <span className="perf-thresh-big">{row.under.w}–{row.under.l}</span>
                          <span className="perf-thresh-small" style={{ color: gradeColor(row.under.pct) }}>
                            {row.under.pct}%
                          </span>
                        </>
                      ) : <span className="perf-thresh-small">—</span>}
                    </div>
                  </div>
                )
              })}
            </div>
                )
            })()}
          </div>
        ) : null}

        {/* DAILY CALENDAR */}
        {data?.daily?.length ? (
          <div className="perf-section fade-in">
            <div style={{marginBottom:'6px',display:'flex',alignItems:'flex-end',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}>
              <div>
                <div className="perf-section-eyebrow">Daily Results</div>
                <select
                  className="filter-select"
                  value={calMonth}
                  onChange={e => setCalMonth(e.target.value)}
                  style={{fontSize:'9px',padding:'4px 24px 4px 8px',minWidth:'unset',marginTop:'6px'}}
                >
                  <option value="all">Full Season</option>
                  {calMonths.map(m => (
                    <option key={m} value={m}>{MONTH_NAMES[m] || m}</option>
                  ))}
                </select>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:'10px',fontWeight:500,color: filteredGood ? '#3ab05a' : '#C44536',marginBottom:'2px'}}>
                  {filteredPct}%
                </div>
                <div style={{fontSize:'14px',fontWeight:600,color:'#fff',lineHeight:1.1}}>
                  {filteredW}-{filteredL}
                </div>
              </div>
            </div>
            <div className="cal-grid">
              {filteredDays.map((d, i) => {
                const col = dayColor(d.p)
                return (
                  <div
                    key={i}
                    className="day fade-in"
                    title={`${d.d}  ${d.w}-${d.l}  (${d.p.toFixed(1)}%)`}
                    style={{
                      background: col.bg,
                      border: `1px solid ${col.border}`,
                      borderRadius: '6px',
                      padding: '7px 6px 5px',
                      textAlign: 'center',
                      cursor: 'default',
                    }}
                  >
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:'8px',color:'rgba(245,241,230,0.5)',letterSpacing:'0.04em',marginBottom:'3px'}}>{d.d}</div>
                    <div style={{fontFamily:"'Playfair Display',serif",fontSize:'13px',fontWeight:700,color:'var(--cream)',lineHeight:1}}>{d.w}-{d.l}</div>
                    <div style={{fontFamily:"'Inter',sans-serif",fontSize:'9px',fontWeight:600,color:col.pct,marginTop:'3px'}}>{d.p.toFixed(0)}%</div>
                  </div>
                )
              })}
            </div>
          </div>
        ) : null}

        {/* SEGMENTS */}
        {(data?.overSegs?.length || data?.underSegs?.length) ? (
          <div className="perf-section fade-in">
            <div className="perf-section-eyebrow">Segments</div>
            <h2 className="perf-section-title">Top Performing Segments</h2>
            <div className="segs-grid">
              {data.overSegs?.length ? (
                <div>
                  <div className="seg-col-h">Over Segments</div>
                  {data.overSegs.map((seg, i) => {
                    const good = seg.pct >= 52.4
                    const eStr = (seg.e >= 0 ? '+' : '') + seg.e.toFixed(1) + 'pp'
                    return (
                      <div key={i} className="sr fade-in" style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <div style={{flex:1,fontSize:'11px',color:'rgba(245,241,230,0.75)'}}>{seg.l}</div>
                        <div style={{fontSize:'11px',fontWeight:600,color:'rgba(245,241,230,0.55)',whiteSpace:'nowrap'}}>{seg.w}-{seg.lo}</div>
                        <div style={{fontSize:'11px',fontWeight:600,color: good ? '#3ab05a' : '#C44536',width:'52px',textAlign:'right'}}>{eStr}</div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
              {data.underSegs?.length ? (
                <div>
                  <div className="seg-col-h">Under Segments</div>
                  {data.underSegs.map((seg, i) => {
                    const good = seg.pct >= 52.4
                    const eStr = (seg.e >= 0 ? '+' : '') + seg.e.toFixed(1) + 'pp'
                    return (
                      <div key={i} className="sr fade-in" style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 0',borderBottom:'1px solid rgba(255,255,255,0.04)'}}>
                        <div style={{flex:1,fontSize:'11px',color:'rgba(245,241,230,0.75)'}}>{seg.l}</div>
                        <div style={{fontSize:'11px',fontWeight:600,color:'rgba(245,241,230,0.55)',whiteSpace:'nowrap'}}>{seg.w}-{seg.lo}</div>
                        <div style={{fontSize:'11px',fontWeight:600,color: good ? '#3ab05a' : '#C44536',width:'52px',textAlign:'right'}}>{eStr}</div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* FOOTER */}
        <div className="perf-footer-note fade-in">
          <span>−110 breakeven = 52.4% · PSI+ V2 · {s?.date_range || '2026 Season'}</span>
          <Link href="/" className="perf-back-link">← Back to home</Link>
        </div>

      </div>
    </>
  )
}
