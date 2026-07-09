import { ImageResponse } from 'next/og'
import { loadArchive, formatDate, computeRecord, recordColor } from '../_lib/data'

export const runtime = 'nodejs'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default async function OgImage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  const archive = loadArchive()
  const day = archive.find(d => d.date === date)

  const label = day ? formatDate(date) : date
  const picks = day?.picks ?? []
  const rec = computeRecord(picks)
  const settled = (rec.w + rec.l) > 0
  const recStr = settled ? `${rec.w}–${rec.l}` : `${picks.length} picks`
  const recCol = settled ? recordColor(rec.w, rec.l) : '#F5F1E6'
  const pct = settled
    ? ((rec.w / (rec.w + rec.l)) * 100).toFixed(0) + '%'
    : ''

  return new ImageResponse(
    (
      <div
        style={{
          width: '1200px',
          height: '630px',
          background: '#0A1628',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          fontFamily: 'sans-serif',
        }}
      >
        {/* Background grid lines */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background:
              'repeating-linear-gradient(0deg,transparent,transparent 59px,rgba(212,175,55,0.04) 60px),' +
              'repeating-linear-gradient(90deg,transparent,transparent 59px,rgba(212,175,55,0.04) 60px)',
          }}
        />

        {/* Gold border accent */}
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height: '3px',
            background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)',
          }}
        />

        {/* Content */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0px',
            zIndex: 1,
          }}
        >
          {/* Wordmark */}
          <div
            style={{
              fontSize: '14px',
              letterSpacing: '0.35em',
              color: '#D4AF37',
              textTransform: 'uppercase',
              marginBottom: '28px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', border: '2px solid #C44536', borderRadius: '5px', padding: '4px 10px' }}>
              STATPACKS
            </span>
            <span style={{ color: 'rgba(245,241,230,0.3)' }}>MLB K MODEL</span>
          </div>

          {/* Date */}
          <div
            style={{
              fontSize: '56px',
              fontWeight: 900,
              color: '#F5F1E6',
              letterSpacing: '-0.01em',
              lineHeight: 1,
              marginBottom: '24px',
            }}
          >
            {label}
          </div>

          {/* Record */}
          <div
            style={{
              display: 'flex',
              alignItems: 'baseline',
              gap: '16px',
            }}
          >
            <span
              style={{
                fontSize: '72px',
                fontWeight: 900,
                color: recCol,
                lineHeight: 1,
              }}
            >
              {recStr}
            </span>
            {pct && (
              <span
                style={{
                  fontSize: '28px',
                  fontWeight: 600,
                  color: recCol,
                  opacity: 0.7,
                }}
              >
                {pct}
              </span>
            )}
          </div>

          {/* Pick count */}
          <div
            style={{
              fontSize: '16px',
              color: 'rgba(245,241,230,0.4)',
              marginTop: '16px',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {picks.length} pick{picks.length !== 1 ? 's' : ''} · statpacks.app
          </div>
        </div>
      </div>
    ),
    { ...size }
  )
}
