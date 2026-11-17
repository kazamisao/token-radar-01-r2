// Token Launch Radar, round 2 — entrypoint (Node 22, standard library only).
//
// Reads the sealed snapshot, ranks the launch candidates with the radar-3
// model in lib/radar.ts, and writes everything the gate and the judge need:
//
//   /output/board.json    the ranked board
//   /output/data.js       the same board, as a script the dashboard reads
//   /output/dashboard/    a copy of this repository's dashboard/
//   /output/screenshots/  a copy of this repository's screenshots/
//   /output/dossier.json  the dossier, written last with the vendored
//                          make.fun library, byte for byte as the scorer
//                          rebuilds it
//
// Run it outside the grader like this:
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json|directory>
//
// It never touches the network and never writes a timestamp, so two runs
// over the same snapshot produce the same bytes.

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { checkBoard, emitDataScript, loadSealed, rankBoard } from './lib/radar.ts';
import { buildDossier } from './vendor/makefun-board.ts';

const repoRoot = fileURLToPath(new URL('.', import.meta.url));

/** The caps the scorer holds the dossier to. */
const DOSSIER_TEXT_CAP = 65_536;
const SHOT_CAP = { max: 4, max_bytes: 524_288 };
const DASH_CAP = { max_files: 400, max_bytes: 4_194_304 };
const SHOT_NAME = /^[A-Za-z0-9_][A-Za-z0-9._-]{0,127}$/;

/** Read a `--flag value` or `--flag=value` argument, or the fallback. */
function flagValue(flag: string, fallback: string): string {
  const position = process.argv.indexOf(`--${flag}`);
  if (position >= 0 && position + 1 < process.argv.length) return process.argv[position + 1]!;
  const joined = process.argv.find((a) => a.startsWith(`--${flag}=`));
  if (joined !== undefined) return joined.slice(flag.length + 3);
  return fallback;
}

function fail(message: string, code = 1): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(code);
}

const inputGiven = flagValue('input', '/input');
const snapshotPath = inputGiven.endsWith('.json') ? inputGiven : join(inputGiven, 'snapshot.json');
if (!existsSync(snapshotPath)) {
  fail(`no snapshot at ${snapshotPath}: pass --input <snapshot.json|directory> or mount the sealed /input`, 2);
}
const outDir = flagValue('output', process.env.MAKEFUN_OUTPUT_DIR ?? '/output');

const snapshot = loadSealed(readFileSync(snapshotPath, 'utf8'));
const radar = rankBoard(snapshot);
const problem = checkBoard(radar.rows, snapshot);
if (problem !== null) fail(`the model wrote a board the gate refuses: ${problem}`);

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'board.json'), `${JSON.stringify({ rows: radar.rows })}\n`);
writeFileSync(join(outDir, 'data.js'), emitDataScript(radar));

/** Copy a directory's plain files into `to`, skipping dot-names. */
function copyPlain(from: string, to: string): string[] {
  if (!existsSync(from)) return [];
  mkdirSync(to, { recursive: true });
  const copied: string[] = [];
  for (const name of readdirSync(from)) {
    if (name.startsWith('.')) continue;
    const source = join(from, name);
    if (!statSync(source).isFile()) continue;
    copyFileSync(source, join(to, name));
    copied.push(name);
  }
  return copied;
}

copyPlain(join(repoRoot, 'dashboard'), join(outDir, 'dashboard'));
const shots = copyPlain(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'));
if (shots.length < 3) {
  fail(`screenshots/ holds ${shots.length} image${shots.length === 1 ? '' : 's'}: hand in 3, the board, a detail view and a filtered view`);
}
for (const name of shots) {
  if (!SHOT_NAME.test(name)) {
    fail(`screenshots/${name}: a name is letters, digits and . _ -, 1 to 128 characters`);
  }
}

// The dossier is written last: the scorer rebuilds it from this /output and compares bytes.
const dossierPath = join(outDir, 'dossier.json');
writeFileSync(
  dossierPath,
  buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_CAP, screenshots: SHOT_CAP, dashboard: DASH_CAP }),
);
// Refuse a dossier past the scorer's own 1.5 MiB cap instead of handing in a dead entry.
if (statSync(dossierPath).size > 1_572_864) {
  fail(`dossier.json is ${statSync(dossierPath).size} bytes, past the 1,572,864-byte cap`);
}

const leader = radar.rows[0];
process.stdout.write(
  `token radar: board leader is ${leader ? leader.name : 'none'} at $${leader ? leader.implied_value_usd : 0} implied value\n` +
    `token radar: ${snapshot.protocols.length} protocols, ${snapshot.watchlist.length} on the watchlist, ` +
    `${radar.rows.length} rows ranked (${radar.meta.early_total} early finds, ${radar.meta.live_total} live tokens set aside as reference)\n` +
    `token radar: wrote ${join(outDir, 'board.json')}, ${join(outDir, 'data.js')}, ${join(outDir, 'dashboard')}, ` +
    `${join(outDir, 'screenshots')} (${shots.length} images) and ${join(outDir, 'dossier.json')}\n`,
);
