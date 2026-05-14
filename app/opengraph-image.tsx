import { ImageResponse } from 'next/og'

export const runtime = 'edge'
export const alt = 'StatPacks — MLB K Model'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          background: '#0A1628',
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* Gold top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 6,
          background: 'linear-gradient(90deg, transparent, #D4AF37, transparent)',
          display: 'flex',
        }} />

        {/* Logo box */}
        <div style={{
          border: '3px solid #C44536',
          borderRadius: 10,
          padding: '12px 36px',
          marginBottom: 32,
          display: 'flex',
        }}>
          <span style={{
            fontFamily: 'serif', fontSize: 28, fontWeight: 900,
            color: '#ffffff', letterSpacing: '0.18em',
          }}>
            STATPACKS
          </span>
        </div>

        {/* Main title */}
        <div style={{
          fontFamily: 'serif', fontSize: 96, fontWeight: 900,
          color: '#D4AF37', letterSpacing: '-2px', display: 'flex',
          lineHeight: 1,
        }}>
          MLB K Model
        </div>

        {/* Subtitle */}
        <div style={{
          fontSize: 26, color: 'rgba(245,241,230,0.5)',
          marginTop: 20, letterSpacing: '6px', display: 'flex',
        }}>
          DAILY STRIKEOUT PICKS · V4
        </div>

        {/* Bottom rule */}
        <div style={{
          position: 'absolute', bottom: 48, left: '15%', right: '15%', height: 1,
          background: 'rgba(212,175,55,0.25)', display: 'flex',
        }} />
        <div style={{
          position: 'absolute', bottom: 20,
          fontSize: 18, color: 'rgba(212,175,55,0.35)', letterSpacing: '3px',
          display: 'flex',
        }}>
          statpacks.vercel.app
        </div>
      </div>
    ),
    { ...size }
  )
}
