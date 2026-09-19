/* Touch Stats — data layer. All state lives in localStorage so the app works fully offline. */

const DB_KEY = 'touchstats_v1';

function uid() {
  return (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now() + '-' + Math.random().toString(16).slice(2));
}

const DEFAULT_STAT_DEFS = [
  { id: 'touchdowns',    label: 'Touchdowns',              category: 'Score',    short: 'TD'   },

  { id: 'td_assist',     label: 'Touchdown Assist',        category: 'Attack',   short: 'TDA'  },
  { id: 'line_break',    label: 'Line Break',              category: 'Attack',   short: 'LB'   },
  { id: 'half_scoot',    label: 'Half Scoot Break',        category: 'Attack',   short: 'HSB'  },
  { id: 'strike_dump',   label: 'Strike Dump',             category: 'Attack',   short: 'SD'   },

  { id: 'strike_touch',  label: 'Strike Touch',            category: 'Defence',  short: 'ST'   },
  { id: 'td_save',       label: 'Touchdown Save',          category: 'Defence',  short: 'TDS'  },

  { id: 'forward_pass',  label: 'Forward Pass',            category: 'Errors',   short: 'FP'   },
  { id: 'touch_and_pass',label: 'Touch & Pass',             category: 'Errors',   short: 'T&P'  },
  { id: 'drop_ball',     label: 'Drop Ball',               category: 'Errors',   short: 'DB'   },
  { id: 'pen_offside',   label: 'Penalty - Offside',       category: 'Errors',   short: 'OFF'  },
  { id: 'pen_ruck',      label: 'Penalty - Ruck Infringement', category: 'Errors', short: 'RUCK' },
  { id: 'pen_discipline',label: 'Penalty - Discipline',    category: 'Errors',   short: 'DISC' },
];

// The roster is deliberately NOT seeded in code: this file is published to a public URL.
// Load the squad on the iPad via Settings → Restore Backup, or add players in the Roster tab.
const DEFAULT_PLAYERS = [];

function defaultData() {
  return {
    version: 1,
    team: {
      name: '16 Boys Red',
      club: 'Brisbane Cobras',
      event: 'National Youth Championships 2026',
      venue: 'Coffs Harbour',
    },
    players: DEFAULT_PLAYERS,
    statDefs: DEFAULT_STAT_DEFS,
    games: [], // { id, date, opponent, round, status: 'live'|'completed', teamScore, oppScore, playerIds, log: [{id, playerId, statId, ts}], createdAt, fixtureId }
    fixtures: [], // { id, opponent, date, time, round, venue, createdAt }
    settings: { outdoorMode: false },
  };
}

const Storage = (() => {
  let data = null;

  function load() {
    if (data) return data;
    try {
      const raw = localStorage.getItem(DB_KEY);
      data = raw ? JSON.parse(raw) : defaultData();
      // Backfill in case of partial/legacy data
      if (!data.team) data.team = defaultData().team;
      if (!data.players) data.players = [];
      if (!data.statDefs) data.statDefs = DEFAULT_STAT_DEFS;
      if (!data.games) data.games = [];
      if (!data.fixtures) data.fixtures = [];
      if (!data.settings) data.settings = { outdoorMode: false };
    } catch (e) {
      console.error('Failed to load data, resetting.', e);
      data = defaultData();
    }
    return data;
  }

  function save() {
    localStorage.setItem(DB_KEY, JSON.stringify(data));
  }

  function get() {
    return load();
  }

  // ---- Players ----
  function addPlayer(name, number) {
    load();
    const p = { id: uid(), name, number: number || null, active: true };
    data.players.push(p);
    save();
    return p;
  }

  function updatePlayer(id, fields) {
    load();
    const p = data.players.find(x => x.id === id);
    if (p) Object.assign(p, fields);
    save();
    return p;
  }

  function removePlayer(id) {
    load();
    data.players = data.players.filter(x => x.id !== id);
    save();
  }

  // ---- Stat defs ----
  function addStatDef(label, category) {
    load();
    const s = { id: uid(), label, category: category || 'Other', short: label.slice(0, 3).toUpperCase() };
    data.statDefs.push(s);
    save();
    return s;
  }

  function updateStatDef(id, fields) {
    load();
    const s = data.statDefs.find(x => x.id === id);
    if (s) Object.assign(s, fields);
    save();
    return s;
  }

  function removeStatDef(id) {
    load();
    data.statDefs = data.statDefs.filter(x => x.id !== id);
    save();
  }

  function reorderStatDefs(idsInOrder) {
    load();
    const byId = Object.fromEntries(data.statDefs.map(s => [s.id, s]));
    data.statDefs = idsInOrder.map(id => byId[id]).filter(Boolean);
    save();
  }

  // ---- Games ----
  function createGame({ opponent, date, round, fixtureId }) {
    load();
    const g = {
      id: uid(),
      date: date || new Date().toISOString().slice(0, 10),
      opponent: opponent || 'Opponent',
      round: round || '',
      status: 'live',
      teamScore: 0,
      oppScore: 0,
      playerIds: data.players.filter(p => p.active).map(p => p.id),
      log: [],
      createdAt: Date.now(),
      fixtureId: fixtureId || null,
      timerHalf: 1,
      timerStatus: 'idle',
      timerStartedAt: null,
    };
    data.games.push(g);
    save();
    return g;
  }

  function updateGameTimer(gameId, patch) {
    load();
    const g = data.games.find(x => x.id === gameId);
    if (!g) return;
    Object.assign(g, patch);
    save();
  }

  function getGame(id) {
    load();
    return data.games.find(g => g.id === id);
  }

  function getLiveGame() {
    load();
    return data.games.find(g => g.status === 'live');
  }

  function logStat(gameId, playerId, statId, delta) {
    load();
    const g = data.games.find(x => x.id === gameId);
    if (!g) return;
    g.log.push({ id: uid(), playerId, statId, delta, ts: Date.now() });
    if (statId === 'touchdowns' && delta > 0) g.teamScore += delta;
    if (statId === 'touchdowns' && delta < 0) g.teamScore = Math.max(0, g.teamScore + delta);
    save();
  }

  function undoLast(gameId) {
    load();
    const g = data.games.find(x => x.id === gameId);
    if (!g || g.log.length === 0) return null;
    const entry = g.log.pop();
    if (entry.statId === 'touchdowns') {
      g.teamScore = Math.max(0, g.teamScore - entry.delta);
    }
    save();
    return entry;
  }

  function removeLogEntry(gameId, entryId) {
    load();
    const g = data.games.find(x => x.id === gameId);
    if (!g) return null;
    const idx = g.log.findIndex(e => e.id === entryId);
    if (idx === -1) return null;
    const [entry] = g.log.splice(idx, 1);
    if (entry.statId === 'touchdowns') {
      g.teamScore = Math.max(0, g.teamScore - entry.delta);
    }
    save();
    return entry;
  }

  function setOppScore(gameId, score) {
    load();
    const g = data.games.find(x => x.id === gameId);
    if (g) { g.oppScore = Math.max(0, score); save(); }
  }

  function updateGameMeta(gameId, fields) {
    load();
    const g = data.games.find(x => x.id === gameId);
    if (g) { Object.assign(g, fields); save(); }
  }

  function endGame(gameId) {
    load();
    const g = data.games.find(x => x.id === gameId);
    if (g) { g.status = 'completed'; g.endedAt = Date.now(); save(); }
    return g;
  }

  function reopenGame(gameId) {
    load();
    // only one live game at a time
    data.games.forEach(g => { if (g.status === 'live') g.status = 'completed'; });
    const g = data.games.find(x => x.id === gameId);
    if (g) { g.status = 'live'; delete g.endedAt; save(); }
    return g;
  }

  function deleteGame(gameId) {
    load();
    data.games = data.games.filter(g => g.id !== gameId);
    save();
  }

  // ---- Fixtures (the draw) ----
  function addFixture({ opponent, date, time, round, venue }) {
    load();
    const f = { id: uid(), opponent: opponent || 'Opponent', date: date || '', time: time || '', round: round || '', venue: venue || '', createdAt: Date.now() };
    data.fixtures.push(f);
    save();
    return f;
  }

  function updateFixture(id, fields) {
    load();
    const f = data.fixtures.find(x => x.id === id);
    if (f) Object.assign(f, fields);
    save();
    return f;
  }

  function removeFixture(id) {
    load();
    data.fixtures = data.fixtures.filter(x => x.id !== id);
    save();
  }

  // Fixtures sorted by date/time, each annotated with the linked game (if that fixture has been started/played)
  function listFixtures() {
    load();
    return data.fixtures
      .map(f => ({ ...f, game: data.games.find(g => g.fixtureId === f.id) || null }))
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  }

  function nextFixture() {
    return listFixtures().find(f => !f.game);
  }

  // ---- Aggregation ----
  // Returns { playerId: { statId: count } } across given games (defaults to completed games)
  function computeTotals(games) {
    load();
    const totals = {};
    for (const p of data.players) totals[p.id] = {};
    for (const g of games) {
      for (const entry of g.log) {
        if (!totals[entry.playerId]) totals[entry.playerId] = {};
        totals[entry.playerId][entry.statId] = (totals[entry.playerId][entry.statId] || 0) + entry.delta;
      }
    }
    return totals;
  }

  function completedGames() {
    load();
    return data.games.filter(g => g.status === 'completed').sort((a, b) => a.createdAt - b.createdAt);
  }

  function cumulativeTotals() {
    return computeTotals(completedGames());
  }

  function teamTotalsFor(games) {
    load();
    const totals = {};
    for (const s of data.statDefs) totals[s.id] = 0;
    for (const g of games) {
      for (const entry of g.log) {
        totals[entry.statId] = (totals[entry.statId] || 0) + entry.delta;
      }
    }
    return totals;
  }

  function record() {
    load();
    const games = completedGames();
    let w = 0, l = 0, d = 0;
    for (const g of games) {
      if (g.teamScore > g.oppScore) w++;
      else if (g.teamScore < g.oppScore) l++;
      else d++;
    }
    return { w, l, d, played: games.length };
  }

  function exportJSON() {
    load();
    return JSON.stringify(data, null, 2);
  }

  function importJSON(json) {
    const parsed = JSON.parse(json);
    data = parsed;
    save();
  }

  function resetAll() {
    data = defaultData();
    save();
  }

  function updateSettings(fields) {
    load();
    Object.assign(data.settings, fields);
    save();
  }

  return {
    get, addPlayer, updatePlayer, removePlayer,
    addStatDef, updateStatDef, removeStatDef, reorderStatDefs,
    createGame, getGame, getLiveGame, logStat, undoLast, removeLogEntry, setOppScore, updateGameMeta, updateGameTimer, endGame, reopenGame, deleteGame,
    addFixture, updateFixture, removeFixture, listFixtures, nextFixture,
    computeTotals, completedGames, cumulativeTotals, teamTotalsFor, record,
    exportJSON, importJSON, resetAll, updateSettings,
    uid,
  };
})();
