import { NextRequest, NextResponse } from 'next/server'

const MLB_API = 'https://statsapi.mlb.com/api/v1'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date   = searchParams.get('date')            // YYYY-MM-DD
  const idsRaw = searchParams.get('ids') ?? ''
  const ids    = idsRaw.split(',').map(s => s.trim()).filter(Boolean)

  if (!date || ids.length === 0) {
    return NextResponse.json({})
  }

  try {
    // 1. Get schedule for the date → list of gamePks
    const schedRes = await fetch(`${MLB_API}/schedule?sportId=1&date=${date}`, {
      cache: 'no-store',
    })
    if (!schedRes.ok) return NextResponse.json({}, { status: 502 })
    const sched = await schedRes.json()

    const gamePks: number[] = []
    for (const d of sched.dates ?? []) {
      for (const g of d.games ?? []) {
        gamePks.push(g.gamePk)
      }
    }

    if (gamePks.length === 0) return NextResponse.json({})

    // 2. Fetch all boxscores in parallel, extract pitcher Ks by MLBAM ID
    const idSet = new Set(ids)
    const results: Record<string, { actual_k: number | null; game_state: string }> = {}

    await Promise.all(
      gamePks.map(async (pk) => {
        try {
          const bsRes = await fetch(
            `https://statsapi.mlb.com/api/v1.1/game/${pk}/boxscore`,
            { cache: 'no-store' }
          )
          if (!bsRes.ok) return
          const bs = await bsRes.json()

          const gameState: string =
            bs.gameData?.status?.abstractGameState ?? 'Unknown'

          for (const side of ['home', 'away'] as const) {
            const pitchers: number[] = bs.teams?.[side]?.pitchers ?? []
            const players: Record<string, any> = bs.teams?.[side]?.players ?? {}

            for (const pid of pitchers) {
              const pidStr = String(pid)
              if (!idSet.has(pidStr)) continue
              const pitching = players[`ID${pid}`]?.stats?.pitching ?? {}
              results[pidStr] = {
                actual_k: pitching.strikeOuts ?? null,
                game_state: gameState,
              }
            }
          }
        } catch {
          // skip failed game silently
        }
      })
    )

    return NextResponse.json(results)
  } catch (err) {
    console.error('[/api/results]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
