import { NextRequest, NextResponse } from 'next/server'

const HEADERS = {
  'User-Agent': 'StatPacks/1.0 (statpacks.vercel.app)',
  'Accept': 'application/json',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date   = searchParams.get('date')   // YYYY-MM-DD
  const idsRaw = searchParams.get('ids') ?? ''
  const ids    = idsRaw.split(',').map(s => s.trim()).filter(Boolean)

  if (!date || ids.length === 0) return NextResponse.json({})

  try {
    // 1. Get schedule for the date → gamePks + game states
    const schedRes = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`,
      { cache: 'no-store', headers: HEADERS }
    )
    if (!schedRes.ok) return NextResponse.json({})
    const sched = await schedRes.json()

    const gamePks: number[] = []
    const gameStates: Record<number, string> = {}
    for (const d of sched.dates ?? []) {
      for (const g of d.games ?? []) {
        gamePks.push(g.gamePk)
        gameStates[g.gamePk] = g.status?.abstractGameState ?? 'Unknown'
      }
    }

    if (gamePks.length === 0) return NextResponse.json({})

    // 2. Fetch boxscores in parallel, extract pitcher Ks by MLBAM ID
    const idSet = new Set(ids)
    const results: Record<string, { actual_k: number | null; game_state: string }> = {}

    await Promise.all(
      gamePks.map(async (pk) => {
        try {
          const bsRes = await fetch(
            `https://statsapi.mlb.com/api/v1/game/${pk}/boxscore`,
            { cache: 'no-store', headers: HEADERS }
          )
          if (!bsRes.ok) return
          const bs = await bsRes.json()
          const gameState = gameStates[pk] ?? 'Unknown'

          for (const side of ['home', 'away'] as const) {
            const pitchers: number[] = bs.teams?.[side]?.pitchers ?? []
            const players: Record<string, any> = bs.teams?.[side]?.players ?? {}
            for (const pid of pitchers) {
              const pidStr = String(pid)
              if (!idSet.has(pidStr)) continue
              const pitching = players[`ID${pid}`]?.stats?.pitching ?? {}
              results[pidStr] = { actual_k: pitching.strikeOuts ?? null, game_state: gameState }
            }
          }
        } catch { /* skip failed game */ }
      })
    )

    return NextResponse.json(results)
  } catch (err) {
    console.error('[/api/results]', err)
    return NextResponse.json({})
  }
}
