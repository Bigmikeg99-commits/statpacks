import { notFound } from 'next/navigation'
import Link from 'next/link'
import type { Metadata } from 'next'
import { NavBar } from '../_components/NavBar'
import {
  loadArchive,
  formatDate,
  slugify,
  computeRecord,
  dotColor,
  resultLabel,
  recordColor,
  getModelLabel,
  type ArchivePick,
} from '../_lib/data'

/* ---- static generation ---- */
export async function generateStaticParams() {
  const archive = loadArchive()
  return archive.map(d => ({ date: d.date }))
}

/* ---- metadata ---- */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ date: string }>
}): Promise<Metadata> {
  const { date } = await params
  const archive = loadArchive()
  const day = archive.find(d => d.date === date)
  if (!day) return { title: 'Not Found — StatPacks' }

  const label = formatDate(date)
  const rec = computeRecord(day.picks)
  const recStr = (rec.w + rec.l) > 0 ? `${rec.w}-${rec.l}` : `${day.picks.length} picks`
  const title = `${label} — ${recStr} · StatPacks K Model`
  const description = `${day.picks.length} MLB strikeout picks for ${label}. ${recStr} record. StatPacks PSI+ model.`
  const ogImageUrl = `https://statpacks.app/picks/${date}/opengraph-image`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: `https://statpacks.app/picks/${date}`,
      siteName: 'StatPacks',
      type: 'article',
      images: [{ url: ogImageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [ogImageUrl],
    },
  }
}

/* ---- pick row ---- */
function PickRow({ p, isLast }: { p: ArchivePick; isLast: boolean }) {
  const edgeStr = p.edge != null ? (p.edge >= 0 ? '+' : '') + p.edge.toFixed(1) : null
  const initials = p.name.split(' ').map((n: string) => n[0]).slice(0, 2).join('')
  const dot = dotColor(p.result)
  const hasDot = p.result !== null
  const slug = slugify(p.name)

  return (
    <div
      id={slug}
      style={{
        padding: '12px 20px',
        borderBottom: isLast ? 'none' : '1px solid rgba(255,255,255,0.04)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        scrollMarginTop: '80px',
      }}
    >
      {/* Headshot */}
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          flexShrink: 0,
          background: 'rgba(212,175,55,0.08)',
          border: '1px solid rgba(212,175,55,0.15)',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: "'Inter',sans-serif",
          fontSize: '11px',
          fontWeight: 700,
          color: 'rgba(212,175,55,0.7)',
        }}
      >
        {p.mlbamid ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={`https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:67:current.png/w_67,q_auto:best/v1/people/${p.mlbamid}/headshot/67/current`}
            alt={p.name}
            width={36}
            height={36}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          initials
        )}
      </div>

      {/* Name + matchup */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontFamily: "'Inter',sans-serif",
            fontSize: '13px',
            fontWeight: 600,
            color: 'var(--cream)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {p.name}
        </div>
        <div
          style={{
            fontFamily: "'Inter',sans-serif",
            fontSize: '10px',
            color: 'rgba(245,241,230,0.65)',
            marginTop: '2px',
          }}
        >
          {p.team} {p.ha === 'Home' ? 'vs' : '@'} {p.opp}
        </div>
      </div>

      {/* Pick + stats */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div
          style={{
            fontFamily: "'Inter',sans-serif",
            fontSize: '11px',
            fontWeight: 700,
            color: 'var(--cream)',
            letterSpacing: '0.05em',
          }}
        >
          {p.rec} {p.line}K
        </div>
        {edgeStr != null && (
          <div
            style={{
              fontFamily: "'Inter',sans-serif",
              fontSize: '10px',
              color: p.edge != null && p.edge > 0 ? '#3ab05a' : '#C44536',
              marginTop: '2px',
            }}
          >
            {edgeStr} edge
          </div>
        )}
        {p.actual_k != null && (
          <div
            style={{
              fontFamily: "'Inter',sans-serif",
              fontSize: '10px',
              color: 'rgba(245,241,230,0.65)',
              marginTop: '2px',
            }}
          >
            Strikeouts: {p.actual_k}
          </div>
        )}
      </div>

      {/* Status dot */}
      <div
        title={resultLabel(p.result)}
        style={{
          width: '9px',
          height: '9px',
          borderRadius: '50%',
          background: hasDot ? dot : 'transparent',
          border: hasDot ? 'none' : '1px solid rgba(245,241,230,0.2)',
          flexShrink: 0,
        }}
      />
    </div>
  )
}

/* ---- page ---- */
export default async function PickDatePage({
  params,
}: {
  params: Promise<{ date: string }>
}) {
  const { date } = await params
  const archive = loadArchive()
  const day = archive.find(d => d.date === date)

  if (!day) notFound()

  const picks = day.picks
  const rec = computeRecord(picks)
  const label = formatDate(date)
  const settled = (rec.w + rec.l) > 0
  const recColor = recordColor(rec.w, rec.l)
  const modelLabel = getModelLabel(date)
  const permalinkUrl = `https://statpacks.app/picks/${date}`

  return (
    <>
      <NavBar />

      <div
        style={{
          maxWidth: '600px',
          margin: '0 auto',
          padding: '40px 20px 80px',
        }}
      >
        {/* Breadcrumb */}
        <div
          style={{
            fontFamily: "'Inter',sans-serif",
            fontSize: '11px',
            color: 'rgba(245,241,230,0.4)',
            letterSpacing: '0.08em',
            marginBottom: '24px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}
        >
          <Link
            href="/picks"
            style={{ color: 'var(--gold)', textDecoration: 'none' }}
          >
            Archive
          </Link>
          <span>›</span>
          <span>{label}</span>
        </div>

        {/* Header */}
        <div
          style={{
            background: 'rgba(13,30,53,0.98)',
            border: '1px solid rgba(212,175,55,0.2)',
            borderRadius: '12px',
            overflow: 'hidden',
            boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          }}
        >
          {/* Card header */}
          <div
            style={{
              padding: '20px 20px 16px',
              borderBottom: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: '12px',
            }}
          >
            <div>
              <div
                style={{
                  fontFamily: "'Inter',sans-serif",
                  fontSize: '10px',
                  letterSpacing: '0.2em',
                  textTransform: 'uppercase',
                  color: 'var(--gold)',
                  fontWeight: 600,
                  marginBottom: '6px',
                }}
              >
                Pick Archive · {modelLabel}
              </div>
              <div
                style={{
                  fontFamily: "'Playfair Display',serif",
                  fontSize: '22px',
                  fontWeight: 700,
                  color: 'var(--cream)',
                  lineHeight: 1.1,
                }}
              >
                {label}
              </div>
              <div
                style={{
                  fontFamily: "'Inter',sans-serif",
                  fontSize: '10px',
                  color: 'rgba(245,241,230,0.4)',
                  marginTop: '4px',
                }}
              >
                {picks.length} pick{picks.length !== 1 ? 's' : ''}
                {rec.p > 0 ? ` · ${rec.p} push${rec.p !== 1 ? 'es' : ''}` : ''}
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexShrink: 0 }}>
              {settled && (
                <span
                  style={{
                    fontFamily: "'Inter',sans-serif",
                    fontSize: '15px',
                    fontWeight: 700,
                    color: recColor,
                  }}
                >
                  {rec.w}-{rec.l}
                </span>
              )}

              {/* Permalink copy button */}
              <a
                href={permalinkUrl}
                title="Copy permalink"
                style={{
                  fontFamily: "'Inter',sans-serif",
                  fontSize: '10px',
                  color: 'rgba(245,241,230,0.45)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  borderRadius: '5px',
                  padding: '5px 8px',
                  textDecoration: 'none',
                  letterSpacing: '0.04em',
                  whiteSpace: 'nowrap',
                }}
              >
                ↗ Permalink
              </a>
            </div>
          </div>

          {/* Pick rows */}
          <div>
            {picks.length === 0 ? (
              <div
                style={{
                  padding: '32px 20px',
                  textAlign: 'center',
                  fontFamily: "'Inter',sans-serif",
                  fontSize: '12px',
                  color: 'rgba(245,241,230,0.35)',
                }}
              >
                No picks recorded for this date.
              </div>
            ) : (
              picks.map((p, i) => (
                <PickRow key={i} p={p} isLast={i === picks.length - 1} />
              ))
            )}
          </div>

          {/* Legend */}
          <div
            style={{
              padding: '12px 20px',
              borderTop: '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              gap: '16px',
              flexWrap: 'wrap',
            }}
          >
            {[
              ['#3ab05a', 'Win'],
              ['#C44536', 'Loss'],
              ['#D4AF37', 'Push'],
              ['#4EABDE', 'PPD'],
            ].map(([c, l]) => (
              <span
                key={l}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                  fontFamily: "'Inter',sans-serif",
                  fontSize: '10px',
                  color: 'rgba(245,241,230,0.6)',
                }}
              >
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: c,
                    display: 'inline-block',
                    flexShrink: 0,
                  }}
                />
                {l}
              </span>
            ))}
          </div>
        </div>

        {/* Model version footnote */}
        <div
          style={{
            marginTop: '16px',
            fontFamily: "'Inter',sans-serif",
            fontSize: '10px',
            color: 'rgba(245,241,230,0.3)',
            letterSpacing: '0.04em',
            textAlign: 'center',
          }}
        >
          {modelLabel} · −110 breakeven = 52.4% ·{' '}
          <Link href="/performance" style={{ color: 'rgba(212,175,55,0.5)', textDecoration: 'none' }}>
            Full season →
          </Link>
        </div>

        {/* Nav back to archive */}
        <div
          style={{
            marginTop: '32px',
            display: 'flex',
            justifyContent: 'center',
            gap: '24px',
          }}
        >
          <Link
            href="/picks"
            style={{
              fontFamily: "'Inter',sans-serif",
              fontSize: '11px',
              color: 'rgba(245,241,230,0.45)',
              letterSpacing: '0.06em',
              textDecoration: 'none',
            }}
          >
            ← All Dates
          </Link>
          <Link
            href="/performance"
            style={{
              fontFamily: "'Inter',sans-serif",
              fontSize: '11px',
              color: 'rgba(245,241,230,0.45)',
              letterSpacing: '0.06em',
              textDecoration: 'none',
            }}
          >
            ← Performance
          </Link>
        </div>
      </div>
    </>
  )
}
