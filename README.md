# token-radar-01-r2

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/kazamisao/token-radar-01-r2/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/kazamisao/token-radar-01-r2/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar, round 2: every protocol in a sealed DefiLlama snapshot that records no token and is not a wrapped or staked product of one that trades, ranked by an implied launch value — TVL × the median market-cap-per-TVL of its category's live tokens with at least $10M TVL (band 0.02–2.0, fallbacks disclosed) × seven-day growth at half weight (0.80–1.40) × diminishing seasoning for time run tokenless (up to 1.37) × reach across chains (up to 1.24). The dashboard shows the board with trend and seasoning signals, a top-ten value chart, a detail view per protocol with its full audit line, and a farm plan written from each protocol's own figures — its TVL sets the budget, its trend the pace, its chains the route, its age the hold.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=p5dwa49p&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

<sub>Authorship note: vendor/makefun-board.ts is the kit's dossier library, copied in unchanged (byte-identical to the kit starter) and re-written through the editing tools so the transcripts account for it.</sub>
