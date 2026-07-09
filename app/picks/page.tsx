import Link from 'next/link'
import type { Metadata } from 'next'
import { NavBar } from './_components/NavBar'
import { loadArchive, formatDate, computeRecord, recordColor } from './_lib/data'

export const metadata: Metadata = {
  title: 'Pick Archive — StatPacks K Model',
  description:
    'Every day of MLB strikeout picks from the StatPacks PSI+ model. Browse the full graded archive.',
  openGraph: {
    title: 'Pick Archive — StatPacks K Model',
    description:
      'Every day of MLB strikeout picks from the StatPacks PSI+ model.',
    url: 'https://statpacks.app/picks',
    siteName: 'StatPacks',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'Pick Archive — StatPacks K Model',
    description: 'Browse every day of MLB strikeout picks from StatPacks.',
  },
}

const MONTH_NAMES: Record<string, string> = {
  '1': 'January', '2': 'February', '3': 'March', '4': 'April',
  '5': 'May', '6': 'June', '7': 'July', '8': 'August',
  '9': 'September', '10': 'October', '11': 'November', '12': 'December',
}

export default function PicksIndexPage() {
  const archive = loadArchive()

  // Sort newest first
  const sorted = [...archive].sort((a, b) => (a.date > b.date ? -1 : 1))

  // Group by year-month
  const grouped: Record<string, typeof sorted> = {}
  for (const day of sorted) {
    const [y, m] = day.date.split('-')
    const key = `${y}-${m}`
    if (!grouped[key]) grouped[key] = []
    grouped[key].push(day)
  }

  const monthKeys = Object.keys(grouped).sort((a, b) => (a > b ? -1 : 1))

  // Season totals
  const totals = archive.reduce(
    (a, day) => {
      const rec = computeRecord(day.picks)
      a.w += rec.w
      a.l += rec.l
      a.p += rec.p
      return a
    },
    { w: 0, l: 0, p: 0 }
  )
  const seasonPct =
    (totals.w + totals.l) > 0
      ? ((totals.w / (totals.w + totals.l)) * 100).toFixed(1)
      : '0.0'
  const seasonColor = recordColor(totals.w, totals.l)

  return (
    <>
      <NavBar />

      <div
        style={{
          maxWidth: '680px',
          margin: '0 auto',
          padding: '48px 20px 80px',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '40px' }}>
          <div
            style={{
              fontFamily: "'Inter',sans-serif",
              fontSize: '10px',
              letterSpacing: '0.25em',
              textTransform: 'uppercase',
              color: 'var(--gold)',
              fontWeight: 600,
              marginBottom: '8px',
            }}
          >
            StatPacks · MLB K Model
          </div>
          <div
            style={{
              fontFamily: "'Playfair Display',serif",
              fontSize: '34px',
              fontWeight: 900,
              color: 'var(--cream)',
              lineHeight: 1.05,
              marginBottom: '12px',
            }}
          >
            Pick Archive
          </div>
          <div
            style={{
              fontFamily: "'Inter',sans-serif",
              fontSize: '13px',
              color: 'rgba(245,241,230,0.5)',
              lineHeight: 1.6,
            }}
          >
            Every slate, graded. {archive.length} days of MLB strikeout picks.
          </div>
        </div>

        {/* Season summary bar */}
        <div
          style={{
            background: 'rgba(13,30,53,0.8)',
            border: '1px solid rgba(212,175,55,0.15)',
            borderRadius: '10px',
            padding: '16px 20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '40px',
            gap: '16px',
            flexWrap: 'wrap',
          }}
        >
          <div>
            <div
              style={{
                fontFamily: "'Inter',sans-serif",
                fontSize: '9px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(245,241,230,0.35)',
                marginBottom: '4px',
              }}
            >
              Season Record
            </div>
            <div
              style={{
                fontFamily: "'Playfair Display',serif",
                fontSize: '26px',
                fontWeight: 700,
                color: seasonColor,
                lineHeight: 1,
              }}
            >
              {totals.w}-{totals.l}
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div
              style={{
                fontFamily: "'Inter',sans-serif",
                fontSize: '9px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(245,241,230,0.35)',
                marginBottom: '4px',
              }}
            >
              Win Rate
            </div>
            <div
              style={{
                fontFamily: "'Playfair Display',serif",
                fontSize: '26px',
                fontWeight: 700,
                color: seasonColor,
              }}
            >
              {seasonPct}%
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div
              style={{
                fontFamily: "'Inter',sans-serif",
                fontSize: '9px',
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                color: 'rgba(245,241,230,0.35)',
                marginBottom: '4px',
              }}
            >
              Days Tracked
            </div>
            <div
              style={{
                fontFamily: "'Playfair Display',serif",
                fontSize: '26px',
                fontWeight: 700,
                color: 'var(--cream)',
              }}
            >
              {archive.length}
            </div>
          </div>
        </div>

        {/* Month groups */}
        {monthKeys.map(key => {
          const [y, m] = key.split('-')
          const monthName = `${MONTH_NAMES[String(+m)] || m} ${y}`
          const days = grouped[key]

          return (
            <div key={key} style={{ marginBottom: '36px' }}>
              <div
                style={{
                  fontFamily: "'Inter',sans-serif",
                  fontSize: '11px',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  color: 'rgba(212,175,55,0.7)',
                  fontWeight: 600,
                  marginBottom: '12px',
                  paddingBottom: '8px',
                  borderBottom: '1px solid rgba(212,175,55,0.12)',
                }}
              >
                {monthName}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                {days.map(day => {
                  const rec = computeRecord(day.picks)
                  const settled = (rec.w + rec.l) > 0
                  const col = settled ? recordColor(rec.w, rec.l) : 'rgba(245,241,230,0.3)'
                  const pct = settled
                    ? ((rec.w / (rec.w + rec.l)) * 100).toFixed(0) + '%'
                    : null

                  return (
                    <Link
                      key={day.date}
                      href={`/picks/${day.date}`}
                      style={{ textDecoration: 'none' }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '11px 14px',
                          borderRadius: '7px',
                          background: 'rgba(13,30,53,0.5)',
                          border: '1px solid rgba(255,255,255,0.04)',
                          transition: 'border-color 0.15s',
                          gap: '12px',
                        }}
                      >
                        {/* Date label */}
                        <div
                          style={{
                            fontFamily: "'Inter',sans-serif",
                            fontSize: '13px',
                            fontWeight: 500,
                            color: 'var(--cream)',
                            minWidth: '130px',
                          }}
                        >
                          {formatDate(day.date)}
                        </div>

                        {/* Pick count */}
                        <div
                          style={{
                            fontFamily: "'Inter',sans-serif",
                            fontSize: '11px',
                            color: 'rgba(245,241,230,0.35)',
                            flex: 1,
                          }}
                        >
                          {day.picks.length} pick{day.picks.length !== 1 ? 's' : ''}
                        </div>

                        {/* Record + pct */}
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'baseline',
                            gap: '8px',
                            flexShrink: 0,
                          }}
                        >
                          {settled && (
                            <>
                              <span
                                style={{
                                  fontFamily: "'Inter',sans-serif",
                                  fontSize: '13px',
                                  fontWeight: 700,
                                  color: col,
                                }}
                              >
                                {rec.w}-{rec.l}
                              </span>
                              {pct && (
                                <span
                                  style={{
                                    fontFamily: "'Inter',sans-serif",
                                    fontSize: '10px',
                                    color: col,
                                    opacity: 0.65,
                                  }}
                                >
                                  {pct}
                                </span>
                              )}
                            </>
                          )}
                          {!settled && (
                            <span
                              style={{
                                fontFamily: "'Inter',sans-serif",
                                fontSize: '10px',
                                color: 'rgba(245,241,230,0.2)',
                                letterSpacing: '0.04em',
                              }}
                            >
                              pending
                            </span>
                          )}
                        </div>

                        {/* Arrow */}
                        <span
                          style={{
                            color: 'rgba(245,241,230,0.2)',
                            fontSize: '12px',
                            flexShrink: 0,
                          }}
                        >
                          →
                        </span>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}

        {/* Footer */}
        <div
          style={{
            marginTop: '16px',
            textAlign: 'center',
            fontFamily: "'Inter',sans-serif",
            fontSize: '10px',
            color: 'rgba(245,241,230,0.25)',
            letterSpacing: '0.06em',
          }}
        >
          −110 breakeven = 52.4% · PSI+ V2 active since 6/11/2026 ·{' '}
          <Link href="/performance" style={{ color: 'rgba(212,175,55,0.4)' }}>
            Performance charts →
          </Link>
        </div>
      </div>
    </>
  )
}
