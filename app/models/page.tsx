'use client'
import { useState } from 'react'
import Link from 'next/link'

const sports = [
  {
    key: 'mlb',
    name: 'MLB',
    status: 'live' as const,
    statusLabel: 'Live',
    model: 'PSI+ V2 · Strikeout Props',
    record: '64-41',
    pct: '60.9%',
    href: '/',
  },
  {
    key: 'nhl',
    name: 'NHL',
    status: 'offseason' as const,
    statusLabel: 'Off-season',
    model: 'Shots on Goal Props',
    record: null,
    pct: null,
    href: null,
  },
  {
    key: 'nfl',
    name: 'NFL',
    status: 'offseason' as const,
    statusLabel: 'Off-season',
    model: 'Returns September',
    record: null,
    pct: null,
    href: null,
  },
  {
    key: 'golf',
    name: 'Golf',
    status: 'soon' as const,
    statusLabel: 'Coming soon',
    model: 'In development',
    record: null,
    pct: null,
    href: null,
  },
]

export default function ModelsPage() {
  const [menuOpen, setMenuOpen] = useState(false)

  return (
    <>
      {/* NAV */}
      <nav className="nav">
        <div className="nav-brand">
          <div className="nav-logo-badge"><span>StatPacks</span></div>
        </div>
        <div className="nav-links">
          <a href="/">Home</a>
          <a href="/#picks">Picks</a>
          <a href="/performance">Performance</a>
          <a href="/psi" style={{color:'var(--gold)'}}>PSI+</a>
        </div>
        <button
          className={`nav-hamburger${menuOpen ? ' open' : ''}`}
          aria-label="Menu"
          onClick={() => setMenuOpen(o => !o)}
        >
          <span /><span /><span />
        </button>
      </nav>
      <div className={`nav-mobile${menuOpen ? ' open' : ''}`}>
        <a href="/" onClick={() => setMenuOpen(false)}>Home</a>
        <a href="/#picks" onClick={() => setMenuOpen(false)}>Picks</a>
        <a href="/performance" onClick={() => setMenuOpen(false)}>Performance</a>
        <a href="/psi" onClick={() => setMenuOpen(false)} style={{color:'var(--gold)'}}>PSI+</a>
      </div>

      {/* PAGE HEADER */}
      <div style={{
        background: 'var(--navy)',
        borderBottom: '1px solid rgba(212,175,55,0.12)',
        padding: '64px 40px 40px',
        textAlign: 'center',
      }}>
        <div style={{
          fontFamily: "'Inter', sans-serif",
          fontSize: '11px',
          letterSpacing: '0.3em',
          color: 'var(--gold)',
          textTransform: 'uppercase',
          marginBottom: '14px',
        }}>
          Predictive Models
        </div>
        <h1 style={{
          fontFamily: "'Playfair Display', serif",
          fontSize: 'clamp(36px, 5vw, 56px)',
          fontWeight: 900,
          color: 'var(--cream)',
          lineHeight: 1,
          marginBottom: '12px',
        }}>
          Every Sport We Cover
        </h1>
        <p style={{
          fontSize: '13px',
          color: 'rgba(245,241,230,0.45)',
          letterSpacing: '0.03em',
        }}>
          Built independently. Tracked transparently.
        </p>
      </div>

      {/* SPORT CARDS */}
      <div style={{
        background: 'var(--navy)',
        minHeight: 'calc(100vh - 260px)',
        padding: '48px 40px 80px',
      }}>
        <div style={{
          maxWidth: '900px',
          margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))',
          gap: '16px',
        }}>
          {sports.map(sport => {
            const isLive = sport.status === 'live'
            const isOff = sport.status === 'offseason'
            const isSoon = sport.status === 'soon'
            const dim = isOff || isSoon

            const card = (
              <div
                key={sport.key}
                style={{
                  background: isLive ? 'rgba(212,175,55,0.06)' : 'rgba(245,241,230,0.025)',
                  border: isLive
                    ? '1px solid rgba(212,175,55,0.3)'
                    : '1px solid rgba(245,241,230,0.07)',
                  borderRadius: '10px',
                  padding: '28px 28px 24px',
                  cursor: isLive ? 'pointer' : 'default',
                  transition: 'background .2s, border-color .2s, transform .15s',
                  position: 'relative',
                }}
                onMouseEnter={e => {
                  if (!isLive) return
                  const el = e.currentTarget as HTMLDivElement
                  el.style.background = 'rgba(212,175,55,0.1)'
                  el.style.borderColor = 'rgba(212,175,55,0.45)'
                  el.style.transform = 'translateY(-2px)'
                }}
                onMouseLeave={e => {
                  if (!isLive) return
                  const el = e.currentTarget as HTMLDivElement
                  el.style.background = 'rgba(212,175,55,0.06)'
                  el.style.borderColor = 'rgba(212,175,55,0.3)'
                  el.style.transform = 'translateY(0)'
                }}
              >
                {/* Top row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '20px',
                    fontWeight: 700,
                    color: dim ? 'rgba(245,241,230,0.35)' : 'var(--cream)',
                    letterSpacing: '0.02em',
                  }}>
                    {sport.name}
                  </span>
                  <span style={{
                    fontFamily: "'Inter', sans-serif",
                    fontSize: '9px',
                    letterSpacing: '0.18em',
                    textTransform: 'uppercase',
                    color: isLive ? 'var(--gold)' : 'rgba(245,241,230,0.25)',
                    border: `1px solid ${isLive ? 'rgba(212,175,55,0.4)' : 'rgba(245,241,230,0.12)'}`,
                    padding: '3px 10px',
                    borderRadius: '20px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '5px',
                  }}>
                    {isLive && (
                      <span style={{
                        width: '5px', height: '5px', borderRadius: '50%',
                        background: 'var(--gold)',
                        display: 'inline-block',
                      }} />
                    )}
                    {sport.statusLabel}
                  </span>
                </div>

                {/* Model label */}
                <div style={{
                  fontFamily: "'Inter', sans-serif",
                  fontSize: '11px',
                  color: dim ? 'rgba(245,241,230,0.25)' : 'rgba(245,241,230,0.5)',
                  letterSpacing: '0.04em',
                  marginBottom: sport.record ? '18px' : '0',
                }}>
                  {sport.model}
                </div>

                {/* Record */}
                {sport.record && (
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                    <span style={{
                      fontFamily: "'Playfair Display', serif",
                      fontSize: '28px',
                      fontWeight: 700,
                      color: 'var(--gold)',
                      lineHeight: 1,
                    }}>
                      {sport.record}
                    </span>
                    <span style={{
                      fontFamily: "'Inter', sans-serif",
                      fontSize: '13px',
                      color: 'rgba(245,241,230,0.45)',
                    }}>
                      · {sport.pct} this season
                    </span>
                  </div>
                )}

                {/* Arrow for live */}
                {isLive && (
                  <div style={{
                    position: 'absolute',
                    right: '24px',
                    bottom: '24px',
                    color: 'rgba(212,175,55,0.4)',
                    fontSize: '16px',
                  }}>
                    →
                  </div>
                )}
              </div>
            )

            return sport.href
              ? <Link key={sport.key} href={sport.href} style={{ textDecoration: 'none', display: 'block' }}>{card}</Link>
              : <div key={sport.key}>{card}</div>
          })}
        </div>
      </div>
    </>
  )
}
