import { NextRequest, NextResponse } from 'next/server'

const HEADERS = {
  'User-Agent': 'StatPacks/1.0 (statpacks.vercel.app)',
  'Accept': 'application/json',
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const date   = searchParams.get('date')   // YYYY-MM-DD
  const idsRaw = searchParams.get('ids') ?? ''

  // ids format: "mlbamid:teamId,mlbamid:teamId,..." — teamId is optional for back-compat
  const idEntries = idsRaw.split(',').map(s => s.trim()).filter(Boolean)
  const ids: string[] = []
  const mlbamToTeam: Record<string, number> = {}
  for (const entry of idEntries) {
    const [mlbamid, teamIdStr] = entry.split(':')
    if (mlbamid) {
      ids.push(mlbamid)
      if (teamIdStr) mlbamToTeam[mlbamid] = parseInt(teamIdStr)
    }
  }

  if (!date || ids.length === 0) return NextResponse.json({})

  try {
    // 1. Get schedule for the date → gamePks + game states + team IDs
    const schedRes = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}`,
      { cache: 'no-store', headers: HEADERS }
    )
    if (!schedRes.ok) return NextResponse.json({})
    const sched = await schedRes.json()

    const gamePks: number[] = []
    const gameStates: Record<number, string> = {}
    const postponedTeamIds = new Set<number>()
    const teamGameState: Record<number, string> = {}

    for (const d of sched.dates ?? []) {
      for (const g of d.games ?? []) {
        gamePks.push(g.gamePk)
        gameStates[g.gamePk] = g.status?.abstractGameState ?? 'Unknown'
        const detailed: string = g.status?.detailedState ?? ''
        if (detailed.toLowerCase().includes('postponed')) {
          const homeId: number = g.teams?.home?.team?.id
          const awayId: number = g.teams?.away?.team?.id
          if (homeId) postponedTeamIds.add(homeId)
          if (awayId) postponedTeamIds.add(awayId)
        }
        const homeId: number = g.teams?.home?.team?.id
        const awayId: number = g.teams?.away?.team?.id
        const state = g.status?.abstractGameState ?? 'Unknown'
        if (homeId) teamGameState[homeId] = state
        if (awayId) teamGameState[awayId] = state
      }
    }

    if (gamePks.length === 0) return NextResponse.json({})

    // 2. Fetch boxscores in parallel, extract pitcher Ks by MLBAM ID
    const idSet = new Set(ids)
    const results: Record<string, { actual_k: number | null; game_state: string; started: boolean }> = {}

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
            const starterId = pitchers.length > 0 ? String(pitchers[0]) : null
            for (const pid of pitchers) {
              const pidStr = String(pid)
              if (!idSet.has(pidStr)) continue
              const pitching = players[`ID${pid}`]?.stats?.pitching ?? {}
              results[pidStr] = {
                actual_k: pitching.strikeOuts ?? null,
                game_state: gameState,
                started: pidStr === starterId,
              }
            }
          }
        } catch { /* skip failed game */ }
      })
    )

    // 3. For any pitcher not found in boxscores, check if their team's game was
    //    postponed, or if their team's game finished and they simply never
    //    appeared (scratched, bumped from the rotation, swapped to bullpen, etc.)
    //    — both cases should resolve to a DNP stamp rather than staying pending.
    for (const mlbamid of ids) {
      if (results[mlbamid]) continue
      const teamId = mlbamToTeam[mlbamid]
      if (!teamId) continue
      if (postponedTeamIds.has(teamId)) {
        results[mlbamid] = { actual_k: null, game_state: 'Postponed', started: false }
      } else if (teamGameState[teamId] === 'Final') {
        results[mlbamid] = { actual_k: null, game_state: 'Final', started: false }
      }
    }

    return NextResponse.json(results)
  } catch (err) {
    console.error('[/api/results]', err)
    return NextResponse.json({})
  }
}
