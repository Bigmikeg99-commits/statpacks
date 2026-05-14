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
interface CalPoint { label: string; model_conf: number; actual_pct: number; w: number; l: number; n: number }
interface Season {
  record: string; overs: string; unders: string; picks: number
  date_range: string; overall_pct: string; over_pct: string; under_pct: string
}
interface PerfData {
  season: Season
  thresholdStats: ThresholdBucket[]
  calibrationData: CalPoint[]
  updated: string
}

/* ---- chart helpers ---- */
declare const Chart: any

let calChartInst: any = null
let buckChartInst: any = null

function renderCalChart(cal: CalPoint[], canvas: HTMLCanvasElement) {
  if (calChartInst) { calChartInst.destroy(); calChartInst = null }
  const sorted = [...cal].sort((a, b) => a.model_conf - b.model_conf)
  const labels  = sorted.map(d => d.label)
  const actuals = sorted.map(d => d.actual_pct)
  const perfect = sorted.map(d => d.model_conf)
  const grid = 'rgba(212,175,55,0.08)'
  const tick  = 'rgba(245,241,230,0.4)'
  calChartInst = new Chart(canvas, {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: 'Perfect calibration',
          data: perfect,
          borderColor: 'rgba(212,175,55,0.3)',
          borderDash: [5, 4],
          borderWidth: 1.5,
          pointRadius: 0,
          fill: false,
          tension: 0,
        },
        {
          label: 'V4 Model',
          data: actuals,
          borderColor: '#4EABDE',
          borderWidth: 2.5,
          pointRadius: 5,
          pointBackgroundColor: '#4EABDE',
          fill: false,
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const d = sorted[ctx.dataIndex]
              if (ctx.datasetIndex === 0) return ` Perfect: ${ctx.parsed.y}%`
              return d ? ` Actual: ${d.actual_pct}%  (${d.w}W–${d.l}L, n=${d.n})` : ''
            },
          },
        },
      },
      scales: {
        x: { grid: { color: grid }, ticks: { color: tick, font: { size: 10 } } },
        y: {
          grid: { color: grid }, min: 30, max: 100,
          ticks: { color: tick, font: { size: 10 }, callback: (v: any) => v + '%' },
          title: { display: true, text: 'Actual win rate', color: tick, font: { size: 10 } },
        },
      },
    },
  })
}

function renderBuckChart(cal: CalPoint[], canvas: HTMLCanvasElement) {
  if (buckChartInst) { buckChartInst.destroy(); buckChartInst = null }
  const sorted = [...cal].sort((a, b) => a.model_conf - b.model_conf)
  const grid = 'rgba(212,175,55,0.08)'
  const tick  = 'rgba(245,241,230,0.4)'
  buckChartInst = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: sorted.map(d => d.label),
      datasets: [
        {
          label: 'Win rate',
          data: sorted.map(d => d.actual_pct),
          backgroundColor: sorted.map(d =>
            d.actual_pct >= 65 ? 'rgba(58,176,90,0.72)'
            : d.actual_pct >= 57.8 ? 'rgba(212,175,55,0.6)'
            : 'rgba(196,69,54,0.65)'
          ),
          borderRadius: 3,
          borderSkipped: false,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx: any) => {
              const d = sorted[ctx.dataIndex]
              return d ? ` ${d.actual_pct}%  (${d.w}W–${d.l}L, n=${d.n})` : ''
            },
          },
        },
        annotation: {},
      },
      scales: {
        x: { grid: { color: grid }, ticks: { color: tick, font: { size: 10 } } },
        y: {
          grid: { color: grid }, min: 30, max: 100,
          ticks: { color: tick, font: { size: 10 }, callback: (v: any) => v + '%' },
          title: { display: true, text: 'Win rate %', color: tick, font: { size: 10 } },
        },
      },
    },
  })
}

/* ---- helpers ---- */
function gradeColor(pct: number): string {
  if (pct >= 65) return '#3ab05a'
  if (pct >= 57.8) return '#D4AF37'
  return '#C44536'
}
function grade(pct: number, n: number): { label: string; cls: string } {
  if (n < 5)  return { label: 'Low n', cls: 'perf-badge-y' }
  if (pct >= 65) return { label: 'Elite',   cls: 'perf-badge-g' }
  if (pct >= 60) return { label: 'Strong',  cls: 'perf-badge-g' }
  if (pct >= 57.8) return { label: 'Neutral', cls: 'perf-badge-y' }
  return { label: 'Avoid', cls: 'perf-badge-r' }
}

/* ---- component ---- */
export default function PerformancePage() {
  const [data,       setData]       = useState<PerfData | null>(null)
  const [chartReady, setChartReady] = useState(false)
  const [menuOpen,   setMenuOpen]   = useState(false)
  const calRef  = useRef<HTMLCanvasElement>(null)
  const buckRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    fetch('/data/picks.json').then(r => r.json()).then(setData).catch(() => {})
  }, [])

  // Trigger fade-ins after mount
  useEffect(() => {
    const els = document.querySelectorAll('.fade-in')
    const obs = new IntersectionObserver(entries => {
      entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('visible'); obs.unobserve(e.target) } })
    }, { threshold: 0.1 })
    els.forEach(el => obs.observe(el))
    return () => obs.disconnect()
  }, [data])

  useEffect(() => {
    if (!data || !chartReady) return
    if (calRef.current  && data.calibrationData?.length) renderCalChart(data.calibrationData, calRef.current)
    if (buckRef.current && data.calibrationData?.length) renderBuckChart(data.calibrationData, buckRef.current)
    return () => {
      if (calChartInst)  { calChartInst.destroy();  calChartInst  = null }
      if (buckChartInst) { buckChartInst.destroy(); buckChartInst = null }
    }
  }, [data, chartReady])

  const s = data?.season
  const overPct  = parseFloat(s?.over_pct  || '0')
  const underPct = parseFloat(s?.under_pct || '0')
  const totalPct = parseFloat(s?.overall_pct || '0')
  const edge     = (totalPct - 57.8).toFixed(1)
  const edgePos  = totalPct >= 57.8

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
          <Link href="/#picks">Picks</Link>
          <Link href="/performance" style={{ color: '#D4AF37' }}>Performance</Link>
          <Link href="/#method">About</Link>
        </div>
        <button className={`nav-hamburger${menuOpen ? ' open' : ''}`} aria-label="Menu"
          onClick={() => setMenuOpen(o => !o)}>
          <span/><span/><span/>
        </button>
      </nav>
      <div className={`nav-mobile${menuOpen ? ' open' : ''}`}>
        <Link href="/"            onClick={() => setMenuOpen(false)}>Home</Link>
        <Link href="/#picks"      onClick={() => setMenuOpen(false)}>Picks</Link>
        <Link href="/performance" onClick={() => setMenuOpen(false)}>Performance</Link>
        <Link href="/#method"     onClick={() => setMenuOpen(false)}>About</Link>
      </div>

      {/* PAGE BODY */}
      <div className="perf-page">

        {/* HEADER */}
        <div className="perf-header fade-in">
          <div className="sec-eyebrow">Model Transparency — V4</div>
          <h1 className="perf-title">Backtesting Dashboard</h1>
          <p className="perf-subtitle">
            Full season performance · {s?.date_range || '—'} · All posted picks
          </p>
          {data && (
            <p className="updated-tag">Updated: {data.updated}</p>
          )}
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

        {/* THRESHOLD BREAKDOWN */}
        <div className="perf-section fade-in">
          <div className="perf-section-eyebrow">Breakdown</div>
          <h2 className="perf-section-title">Performance by K Line Threshold</h2>
          <p className="perf-section-sub">
            Where the model is strongest — and where to be cautious.
          </p>

          {data?.thresholdStats?.length ? (
            <div className="perf-thresh-table">
              {/* Header */}
              <div className="perf-thresh-head">
                <div>Threshold</div>
                <div>Total</div>
                <div>Win %</div>
                <div>vs −110</div>
                <div>Overs</div>
                <div>Unders</div>
              </div>
              {data.thresholdStats.map((row) => {
                const edgePp = (row.total.pct - 57.8).toFixed(1)
                const edgeC  = row.total.pct >= 57.8 ? '#3ab05a' : '#C44536'
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
                        {row.total.pct >= 57.8 ? '+' : ''}{edgePp}pp
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
          ) : (
            <div className="no-picks">Loading threshold data…</div>
          )}
        </div>

        {/* CALIBRATION */}
        <div className="perf-section fade-in">
          <div className="perf-section-eyebrow">Calibration</div>
          <h2 className="perf-section-title">Model Probability vs Actual Win Rate</h2>
          <p className="perf-section-sub">
            A well-calibrated model tracks the dashed diagonal — when the model says 70%, it should win ~70% of the time.
          </p>

          <div className="perf-chart-row">
            <div className="perf-chart-card">
              <div className="perf-chart-label">Calibration Curve</div>
              <div className="perf-chart-wrap">
                <canvas ref={calRef}/>
              </div>
              <div className="perf-chart-note">
                Blue = V4 model · Dashed = perfect calibration
              </div>
            </div>
            <div className="perf-chart-card">
              <div className="perf-chart-label">Win Rate by Confidence Bucket</div>
              <div className="perf-chart-wrap">
                <canvas ref={buckRef}/>
              </div>
              <div className="perf-chart-note">
                Green ≥ 65% · Gold = near breakeven · Red = below breakeven
              </div>
            </div>
          </div>
        </div>

        {/* FOOTER NOTE */}
        <div className="perf-footer-note fade-in">
          <span>V2 Backtest data (3/26–4/29) · V1 &amp; V2 live picks (3/29–present) · −110 breakeven = 57.8%</span>
          <Link href="/" className="perf-back-link">← Back to today&apos;s picks</Link>
        </div>

      </div>
    </>
  )
}
