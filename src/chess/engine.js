/**
 * The room's chess player: Stockfish, in a Web Worker, told to play badly.
 *
 * `public/stockfish/` carries the lite single-threaded build (see
 * `scripts/import-stockfish.sh`) — 1.8 MB, fetched the first time a game starts and
 * never before, since almost nobody who opens the room plays it. It talks UCI over
 * `postMessage`, one line per message, so this is a thin conversation: handshake,
 * options, `position`, `go`, wait for `bestmove`.
 *
 * Strength is a level from 1 to 10 (see `LEVELS`), which sets Stockfish's own
 * `Skill Level` — a deliberate weakening — and how deep it searches. The engine's
 * `UCI_Elo` floor is 1320, far above the beginner this is for, so the bottom levels
 * are made worse a second way: the engine reports its three best lines and one of them
 * is picked at random. A shallow search that always plays its best move is still
 * uncannily accurate; one that plays its third choice a third of the time loses pieces
 * the way a person does.
 */

const ENGINE_URL = 'stockfish/stockfish-19-lite-single.js';

/**
 * One entry per level: Stockfish's `Skill Level` (0–20), the search depth, and how
 * many of the top lines the reply is drawn from (1 = always the best).
 */
export const LEVELS = [
  { skill: 0, depth: 1, choices: 3 },
  { skill: 2, depth: 2, choices: 3 },
  { skill: 4, depth: 2, choices: 2 },
  { skill: 6, depth: 3, choices: 1 },
  { skill: 8, depth: 4, choices: 1 },
  { skill: 10, depth: 5, choices: 1 },
  { skill: 12, depth: 6, choices: 1 },
  { skill: 14, depth: 8, choices: 1 },
  { skill: 16, depth: 10, choices: 1 },
  { skill: 20, depth: 12, choices: 1 },
];

/**
 * Starts the worker on first use. `bestMove(fen)` resolves to a UCI move such as
 * `e7e5` or `e7e8q`; `stop()` abandons a search in progress (its promise resolves to
 * null) and `dispose()` ends the worker.
 */
export function createEngine() {
  let worker = null;
  let ready = null;
  let level = 1;
  /** The search in flight, if any: its resolver and the lines gathered so far. */
  let search = null;
  /**
   * Searches stopped whose `bestmove` has not come back yet. Stockfish answers a `stop`
   * with one, and it must not be taken for the answer to a search started since.
   */
  let stale = 0;

  const send = (line) => worker.postMessage(line);

  const boot = () => {
    if (ready) return ready;
    worker = new Worker(ENGINE_URL);
    ready = new Promise((resolve) => {
      const onLine = (event) => {
        const line = String(event.data);
        if (line === 'uciok') send('isready');
        else if (line === 'readyok') {
          worker.removeEventListener('message', onLine);
          resolve();
        }
      };
      worker.addEventListener('message', onLine);
      send('uci');
    }).then(() => {
      worker.addEventListener('message', onMessage);
      applyLevel();
    });
    return ready;
  };

  const applyLevel = () => {
    const { skill, choices } = LEVELS[level - 1];
    send(`setoption name Skill Level value ${skill}`);
    send(`setoption name MultiPV value ${choices}`);
  };

  const onMessage = (event) => {
    const line = String(event.data);
    if (stale && line.startsWith('bestmove')) {
      stale -= 1;
      return;
    }
    if (!search) return;
    // `info depth N multipv K ... pv e2e4 ...` — the K-th best line at that depth. Only
    // the final depth's lines are kept: each new depth starts the set over.
    if (line.startsWith('info ')) {
      const depth = /\bdepth (\d+)/.exec(line);
      const rank = /\bmultipv (\d+)/.exec(line);
      const pv = /\bpv (\S+)/.exec(line);
      if (!depth || !rank || !pv) return;
      const d = Number(depth[1]);
      if (d !== search.depth) {
        search.depth = d;
        search.lines = [];
      }
      search.lines[Number(rank[1]) - 1] = pv[1];
      return;
    }
    if (line.startsWith('bestmove')) {
      const best = line.split(/\s+/)[1];
      const { resolve, lines } = search;
      search = null;
      const pool = lines.filter(Boolean);
      // Never a "(none)" from a finished game, and the best move whenever the
      // gathered lines are somehow empty.
      const pick = pool.length ? pool[Math.floor(Math.random() * pool.length)] : best;
      resolve(pick && pick !== '(none)' ? pick : null);
    }
  };

  return {
    get level() { return level; },

    /** Sets the level (1–10); takes effect on the next search. */
    setLevel(next) {
      level = Math.min(LEVELS.length, Math.max(1, Math.round(next) || 1));
      if (worker && !search) applyLevel();
    },

    /** Fetches and boots the engine ahead of the first move, so the reply is not the download. */
    warm: () => boot(),

    async bestMove(fen) {
      await boot();
      if (search) this.stop();
      const { depth } = LEVELS[level - 1];
      // Options are applied per search: a level changed mid-game has to land before
      // the next `go`, and `applyLevel` is skipped while one is running.
      applyLevel();
      return new Promise((resolve) => {
        search = { resolve, depth: 0, lines: [] };
        send('ucinewgame');
        send(`position fen ${fen}`);
        send(`go depth ${depth}`);
      });
    },

    /** Abandons the running search, if any; its promise resolves to null. */
    stop() {
      if (!search) return;
      const { resolve } = search;
      search = null;
      stale += 1;
      send('stop');
      resolve(null);
    },

    dispose() {
      this.stop();
      worker?.terminate();
      worker = null;
      ready = null;
      stale = 0;
    },
  };
}
