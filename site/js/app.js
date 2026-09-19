/* Touch Stats — UI logic */

const App = (() => {
  let currentView = 'dashboard';
  let currentCategory = null;
  let historyDetailId = null;
  let timerInterval = null;

  const HALF_SECS = 20 * 60;

  function fmtTimer(secs) {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function timerRemaining(game) {
    if (game.timerStatus !== 'running') return HALF_SECS;
    const elapsed = Math.floor((Date.now() - game.timerStartedAt) / 1000);
    return Math.max(0, HALF_SECS - elapsed);
  }

  function stopTimerInterval() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
  }

  function startTimerInterval(gameId) {
    stopTimerInterval();
    timerInterval = setInterval(() => {
      const game = Storage.getLiveGame();
      if (!game || game.id !== gameId) { stopTimerInterval(); return; }
      renderTimerSection(game);
    }, 500);
  }

  function renderTimerSection(game) {
    const display = $('#timer-display');
    const btn = $('#timer-action-btn');
    if (!display || !btn) return;

    const status = game.timerStatus || 'idle';
    const half = game.timerHalf || 1;
    const remaining = timerRemaining(game);

    if (status === 'idle') {
      display.textContent = fmtTimer(HALF_SECS);
      btn.textContent = '▶ Start';
      btn.classList.remove('hidden');
    } else if (status === 'running') {
      display.textContent = (half === 1 ? '1H ' : '2H ') + fmtTimer(remaining);
      btn.classList.add('hidden');
      if (remaining === 0) {
        if (half === 1) {
          Storage.updateGameTimer(game.id, { timerStatus: 'halftime', timerStartedAt: null });
          stopTimerInterval();
          toast('Half Time!');
        } else {
          Storage.updateGameTimer(game.id, { timerStatus: 'done', timerStartedAt: null });
          stopTimerInterval();
          toast('Full Time!');
        }
        renderTimerSection(Storage.getLiveGame());
        return;
      }
    } else if (status === 'halftime') {
      display.textContent = 'HALF TIME';
      btn.textContent = '▶ 2nd Half';
      btn.classList.remove('hidden');
    } else if (status === 'done') {
      display.textContent = 'FULL TIME';
      btn.classList.add('hidden');
    }

    btn.onclick = () => {
      const g = Storage.getLiveGame();
      if (!g) return;
      const st = g.timerStatus || 'idle';
      if (st === 'idle') {
        Storage.updateGameTimer(g.id, { timerStatus: 'running', timerHalf: 1, timerStartedAt: Date.now() });
      } else if (st === 'halftime') {
        Storage.updateGameTimer(g.id, { timerStatus: 'running', timerHalf: 2, timerStartedAt: Date.now() });
      }
      startTimerInterval(g.id);
      renderTimerSection(Storage.getLiveGame());
    };
  }

  // ---------- utils ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $all(sel, root) { return Array.from((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    const e = document.createElement(tag);
    if (attrs) for (const k in attrs) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'html') e.innerHTML = attrs[k];
      else if (k.startsWith('on') && typeof attrs[k] === 'function') e.addEventListener(k.slice(2), attrs[k]);
      else e.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(c => { if (c) e.appendChild(typeof c === 'string' ? document.createTextNode(c) : c); });
    return e;
  }
  function fmtDate(d) {
    const dt = new Date(d + 'T00:00:00');
    if (isNaN(dt)) return d;
    return dt.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' });
  }
  function toast(msg) {
    const t = el('div', { class: 'toast' }, [msg]);
    document.body.appendChild(t);
    requestAnimationFrame(() => t.classList.add('show'));
    setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, 1800);
  }
  function statCount(game, playerId, statId) {
    let n = 0;
    for (const e of game.log) if (e.playerId === playerId && e.statId === statId) n += e.delta;
    return n;
  }
  function categoriesFromDefs(defs) {
    const seen = [];
    for (const d of defs) if (!seen.includes(d.category)) seen.push(d.category);
    return seen;
  }

  // ---------- modal ----------
  function openModal(contentEl) {
    const root = $('#modal-root');
    root.innerHTML = '';
    const overlay = el('div', { class: 'modal-overlay' });
    const box = el('div', { class: 'modal-box' }, [contentEl]);
    overlay.appendChild(box);
    overlay.addEventListener('click', (ev) => { if (ev.target === overlay) closeModal(); });
    root.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
  }
  function closeModal() {
    const root = $('#modal-root');
    root.innerHTML = '';
  }

  // ---------- navigation ----------
  function switchView(name) {
    if (name !== 'live') stopTimerInterval();
    currentView = name;
    $all('.view').forEach(v => v.classList.remove('active'));
    $(`#view-${name}`).classList.add('active');
    $all('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === name));
    renderCurrentView();
  }

  function renderCurrentView() {
    if (currentView === 'dashboard') renderDashboard();
    else if (currentView === 'live') renderLive();
    else if (currentView === 'roster') renderRoster();
    else if (currentView === 'history') renderHistory();
    else if (currentView === 'settings') renderSettings();
    updateLiveIndicator();
  }

  function updateLiveIndicator() {
    const live = Storage.getLiveGame();
    $('#live-indicator').classList.toggle('hidden', !live);
  }

  // ---------- DASHBOARD ----------
  function renderDashboard() {
    const data = Storage.get();
    const live = Storage.getLiveGame();
    updateOfflineStatus();
    const banner = $('#live-banner');
    if (live) {
      banner.classList.remove('hidden');
      banner.innerHTML = '';
      banner.appendChild(el('div', { class: 'live-banner-inner' }, [
        el('div', {}, [
          el('strong', {}, [`Game in progress: vs ${live.opponent}`]),
          el('div', { class: 'muted small' }, [`${live.teamScore} – ${live.oppScore}`]),
        ]),
        el('button', { class: 'btn btn-primary', onclick: () => switchView('live') }, ['Go to Live Game']),
      ]));
    } else {
      banner.classList.add('hidden');
    }

    const nextCard = $('#next-game-card');
    const next = live ? null : Storage.nextFixture();
    if (next) {
      nextCard.classList.remove('hidden');
      nextCard.innerHTML = '';
      nextCard.appendChild(el('div', { class: 'next-game-inner' }, [
        el('div', {}, [
          el('div', { class: 'muted small' }, ['NEXT GAME']),
          el('strong', {}, [`vs ${next.opponent}`]),
          el('div', { class: 'muted small' }, [`${fmtDate(next.date)}${next.time ? ' · ' + next.time : ''}${next.round ? ' · ' + next.round : ''}${next.venue ? ' · ' + next.venue : ''}`]),
        ]),
        el('button', { class: 'btn btn-primary', onclick: () => openNewGameModal(next.id) }, ['Start This Game']),
      ]));
    } else {
      nextCard.classList.add('hidden');
    }

    const rec = Storage.record();
    const recordCards = $('#record-cards');
    recordCards.innerHTML = '';
    [
      ['Played', rec.played], ['Won', rec.w], ['Lost', rec.l], ['Drawn', rec.d],
    ].forEach(([label, val]) => {
      recordCards.appendChild(el('div', { class: 'stat-card' }, [
        el('div', { class: 'stat-card-val' }, [String(val)]),
        el('div', { class: 'stat-card-label' }, [label]),
      ]));
    });

    const games = Storage.completedGames();
    $('#games-played-label').textContent = `${games.length} game${games.length === 1 ? '' : 's'} completed`;
    const teamTotals = Storage.teamTotalsFor(games);
    const totalsWrap = $('#team-totals');
    totalsWrap.innerHTML = '';
    data.statDefs.forEach(sd => {
      totalsWrap.appendChild(el('div', { class: 'stat-card' }, [
        el('div', { class: 'stat-card-val' }, [String(teamTotals[sd.id] || 0)]),
        el('div', { class: 'stat-card-label' }, [sd.label]),
      ]));
    });

    // leaderboard
    const sel = $('#leaderboard-stat');
    const prevVal = sel.value;
    sel.innerHTML = '';
    data.statDefs.forEach(sd => sel.appendChild(el('option', { value: sd.id }, [sd.label])));
    if (prevVal && data.statDefs.some(s => s.id === prevVal)) sel.value = prevVal;
    sel.onchange = renderLeaderboard;
    renderLeaderboard();

    function renderLeaderboard() {
      const statId = sel.value || (data.statDefs[0] && data.statDefs[0].id);
      const cum = Storage.cumulativeTotals();
      const rows = data.players.map(p => ({ p, count: (cum[p.id] && cum[p.id][statId]) || 0 }))
        .sort((a, b) => b.count - a.count)
        .filter(r => r.count > 0)
        .slice(0, 8);
      const wrap = $('#leaderboard');
      wrap.innerHTML = '';
      if (rows.length === 0) {
        wrap.appendChild(el('p', { class: 'muted' }, ['No stats recorded yet — complete a game to see the leaderboard.']));
        return;
      }
      rows.forEach((r, i) => {
        wrap.appendChild(el('div', { class: 'leader-row' }, [
          el('span', { class: 'leader-rank' }, [String(i + 1)]),
          el('span', { class: 'leader-num' }, [r.p.number != null ? String(r.p.number) : '—']),
          el('span', { class: 'leader-name' }, [r.p.name]),
          el('span', { class: 'leader-count' }, [String(r.count)]),
        ]));
      });
    }
  }

  // ---------- LIVE GAME ----------
  function renderLive() {
    const live = Storage.getLiveGame();
    $('#no-live-game').classList.toggle('hidden', !!live);
    $('#live-game-panel').classList.toggle('hidden', !live);
    if (!live) return;

    const data = Storage.get();
    $('#live-round').textContent = live.round || '';
    $('#live-opponent-label').textContent = `vs ${live.opponent}`;
    $('#live-date').textContent = fmtDate(live.date);
    $('#score-us').textContent = live.teamScore;
    $('#score-them').textContent = live.oppScore;
    $('#sticky-opponent').textContent = `vs ${live.opponent}`;
    $('#sticky-score').textContent = `${live.teamScore} – ${live.oppScore}`;

    $('#opp-plus').onclick = () => { Storage.setOppScore(live.id, live.oppScore + 1); renderLive(); };
    $('#opp-minus').onclick = () => { Storage.setOppScore(live.id, live.oppScore - 1); renderLive(); };

    $('#btn-undo').onclick = () => {
      const entry = Storage.undoLast(live.id);
      if (entry) {
        const sd = data.statDefs.find(s => s.id === entry.statId);
        const p = data.players.find(pl => pl.id === entry.playerId);
        toast(`Undone: ${p ? p.name : ''} ${sd ? sd.label : ''}`);
      }
      renderLive();
    };
    $('#btn-edit-squad').onclick = () => openEditSquadModal(live);
    $('#btn-end-game').onclick = () => confirmEndGame(live);

    const categories = categoriesFromDefs(data.statDefs);
    if (!currentCategory || !categories.includes(currentCategory)) currentCategory = categories[0];

    const tabRow = $('#category-tabs');
    tabRow.innerHTML = '';
    categories.forEach(cat => {
      tabRow.appendChild(el('button', {
        class: 'tab-chip' + (cat === currentCategory ? ' active' : ''),
        onclick: () => { currentCategory = cat; renderLive(); },
      }, [cat]));
    });

    renderStatTiles(live, data, currentCategory);
    renderRecapGrid(live, data, currentCategory);
    renderRecentActivity(live, data);

    stopTimerInterval();
    renderTimerSection(live);
    if ((live.timerStatus || 'idle') === 'running') startTimerInterval(live.id);
  }

  function renderRecentActivity(game, data) {
    const wrap = $('#recent-activity');
    wrap.innerHTML = '';
    const recent = game.log.slice(-8).reverse();
    if (recent.length === 0) {
      wrap.appendChild(el('p', { class: 'muted small' }, ['Nothing logged yet this game.']));
      return;
    }
    recent.forEach(entry => {
      const sd = data.statDefs.find(s => s.id === entry.statId);
      const p = data.players.find(pl => pl.id === entry.playerId);
      const time = new Date(entry.ts).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
      wrap.appendChild(el('div', { class: 'activity-row' }, [
        el('span', { class: 'player-num' }, [p && p.number != null ? String(p.number) : '–']),
        el('span', { class: 'activity-text grow' }, [
          `${p ? p.name : 'Unknown'} — ${sd ? sd.label : entry.statId}`,
          el('span', { class: 'muted small activity-time' }, [` ${time}`]),
        ]),
        el('button', {
          class: 'btn-icon danger',
          onclick: () => {
            Storage.removeLogEntry(game.id, entry.id);
            toast(`Removed: ${p ? p.name : ''} ${sd ? sd.label : ''}`);
            renderLive();
          },
        }, ['✕']),
      ]));
    });
  }

  function renderStatTiles(game, data, category) {
    const stats = data.statDefs.filter(s => s.category === category);
    const players = data.players.filter(p => game.playerIds.includes(p.id));
    const wrap = $('#stat-tiles');
    wrap.innerHTML = '';
    stats.forEach(s => {
      const total = players.reduce((sum, p) => sum + statCount(game, p.id, s.id), 0);
      wrap.appendChild(el('button', {
        class: 'stat-tile',
        onclick: () => openPlayerPicker(game, s),
      }, [
        el('span', { class: 'stat-tile-count' }, [String(total)]),
        el('span', { class: 'stat-tile-label' }, [s.label]),
      ]));
    });
  }

  function renderRecapGrid(game, data, category) {
    const stats = data.statDefs.filter(s => s.category === category);
    const players = data.players.filter(p => game.playerIds.includes(p.id));
    const table = $('#stat-grid');
    table.innerHTML = '';

    const thead = el('thead');
    const headRow = el('tr');
    headRow.appendChild(el('th', { class: 'col-player' }, ['Player']));
    stats.forEach(s => headRow.appendChild(el('th', { class: 'col-stat', title: s.label }, [s.short || s.label])));
    thead.appendChild(headRow);
    table.appendChild(thead);

    const tbody = el('tbody');
    if (players.length === 0) {
      const tr = el('tr');
      const td = el('td', { colspan: String(stats.length + 1), class: 'muted empty-cell' }, ['No players selected for this game. Tap "Edit Squad" to add players.']);
      tr.appendChild(td);
      tbody.appendChild(tr);
    }
    players.forEach(p => {
      const tr = el('tr');
      tr.appendChild(el('td', { class: 'col-player' }, [
        el('span', { class: 'player-num' }, [p.number != null ? String(p.number) : '–']),
        el('span', { class: 'player-name' }, [p.name]),
      ]));
      stats.forEach(s => tr.appendChild(el('td', { class: 'col-stat' }, [String(statCount(game, p.id, s.id))])));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
  }

  function openPlayerPicker(game, statDef) {
    const data = Storage.get();
    const players = data.players
      .filter(p => game.playerIds.includes(p.id))
      .sort((a, b) => (a.number != null ? a.number : 999) - (b.number != null ? b.number : 999));

    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, [statDef.label]));
    wrap.appendChild(el('p', { class: 'muted' }, ['Who was it?']));

    if (players.length === 0) {
      wrap.appendChild(el('p', { class: 'muted' }, ['No players selected for this game. Tap "Edit Squad" first.']));
    }

    const grid = el('div', { class: 'player-picker-grid' });
    players.forEach(p => {
      grid.appendChild(el('button', {
        class: 'player-pick-btn',
        onclick: () => {
          Storage.logStat(game.id, p.id, statDef.id, 1);
          closeModal();
          toast(`${statDef.label} — #${p.number != null ? p.number : '–'} ${p.name}`);
          renderLive();
        },
      }, [
        el('span', { class: 'player-pick-num' }, [p.number != null ? String(p.number) : '–']),
        el('span', { class: 'player-pick-name' }, [p.name]),
      ]));
    });
    wrap.appendChild(grid);

    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
    wrap.appendChild(btnRow);
    openModal(wrap);
  }

  function openNewGameModal(preselectFixtureId) {
    const upcoming = Storage.listFixtures().filter(f => !f.game);
    let selectedFixtureId = preselectFixtureId || null;

    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, ['Start New Game']));

    const opponent = el('input', { type: 'text', placeholder: 'Opponent team name' });
    const date = el('input', { type: 'date', value: new Date().toISOString().slice(0, 10) });
    const round = el('input', { type: 'text', placeholder: 'e.g. Pool A – Round 3' });

    function applyFixture(id) {
      const f = upcoming.find(x => x.id === id);
      if (f) {
        opponent.value = f.opponent;
        date.value = f.date || date.value;
        round.value = f.round || '';
      }
    }

    if (upcoming.length > 0) {
      const fixtureSelect = el('select', {});
      fixtureSelect.appendChild(el('option', { value: '' }, ['— Enter manually —']));
      upcoming.forEach(f => {
        fixtureSelect.appendChild(el('option', { value: f.id }, [
          `${fmtDate(f.date)}${f.time ? ' ' + f.time : ''} — vs ${f.opponent}${f.round ? ' (' + f.round + ')' : ''}`,
        ]));
      });
      if (selectedFixtureId) fixtureSelect.value = selectedFixtureId;
      fixtureSelect.onchange = () => {
        selectedFixtureId = fixtureSelect.value || null;
        applyFixture(selectedFixtureId);
      };
      wrap.appendChild(el('label', {}, ['Pick from the draw (optional)', fixtureSelect]));
    }

    if (selectedFixtureId) applyFixture(selectedFixtureId);

    wrap.appendChild(el('label', {}, ['Opponent', opponent]));
    wrap.appendChild(el('label', {}, ['Date', date]));
    wrap.appendChild(el('label', {}, ['Round / Notes (optional)', round]));
    const btnRow = el('div', { class: 'btn-row' });
    const cancelBtn = el('button', { class: 'btn', onclick: closeModal }, ['Cancel']);
    const startBtn = el('button', {
      class: 'btn btn-primary',
      onclick: () => {
        if (!opponent.value.trim()) { opponent.focus(); return; }
        const existingLive = Storage.getLiveGame();
        if (existingLive) Storage.endGame(existingLive.id);
        Storage.createGame({ opponent: opponent.value.trim(), date: date.value, round: round.value.trim(), fixtureId: selectedFixtureId });
        closeModal();
        currentCategory = null;
        switchView('live');
      },
    }, ['Start Game']);
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(startBtn);
    wrap.appendChild(btnRow);
    openModal(wrap);
    setTimeout(() => opponent.focus(), 50);
  }

  function openEditSquadModal(game) {
    const data = Storage.get();
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, ['Edit Squad for this Game']));
    wrap.appendChild(el('p', { class: 'muted' }, ['Choose who is available for this match.']));
    const list = el('div', { class: 'checklist' });
    data.players.forEach(p => {
      const checked = game.playerIds.includes(p.id);
      const id = 'sq-' + p.id;
      const cb = el('input', { type: 'checkbox', id });
      cb.checked = checked;
      const row = el('label', { class: 'check-row', for: id }, [
        cb,
        el('span', { class: 'player-num' }, [p.number != null ? String(p.number) : '–']),
        el('span', {}, [p.name]),
      ]);
      list.appendChild(row);
    });
    wrap.appendChild(list);
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
    btnRow.appendChild(el('button', {
      class: 'btn btn-primary',
      onclick: () => {
        const ids = data.players.filter(p => $(`#sq-${p.id}`).checked).map(p => p.id);
        Storage.updateGameMeta(game.id, { playerIds: ids });
        closeModal();
        renderLive();
      },
    }, ['Save Squad']));
    wrap.appendChild(btnRow);
    openModal(wrap);
  }

  function confirmEndGame(game) {
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, ['End Game?']));
    wrap.appendChild(el('p', {}, [`Final score vs ${game.opponent}: ${game.teamScore} – ${game.oppScore}. This will add the game to your season totals. You can still edit it later from History.`]));
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Keep Playing']));
    btnRow.appendChild(el('button', {
      class: 'btn btn-danger',
      onclick: () => {
        Storage.endGame(game.id);
        closeModal();
        openPostGameModal(game.id);
      },
    }, ['End Game']));
    wrap.appendChild(btnRow);
    openModal(wrap);
  }

  function openPostGameModal(gameId) {
    const game = Storage.getGame(gameId);
    const data = Storage.get();
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, ['Game Saved']));
    wrap.appendChild(el('p', {}, [`Final score vs ${game.opponent}: ${game.teamScore} – ${game.oppScore}. It's been added to your season totals.`]));
    wrap.appendChild(el('p', { class: 'muted small' }, ['Worth backing up now while it’s fresh — everything only lives on this iPad.']));
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', {
      class: 'btn',
      onclick: () => {
        const d = Storage.get();
        downloadFile(`${d.team.name.replace(/\s+/g, '_')}_backup.json`, Storage.exportJSON(), 'application/json');
        toast('Backup exported');
      },
    }, ['Export Backup']));
    btnRow.appendChild(el('button', { class: 'btn', onclick: () => shareGameSummary(game) }, ['Share Result']));
    btnRow.appendChild(el('button', {
      class: 'btn btn-primary',
      onclick: () => { closeModal(); switchView('dashboard'); },
    }, ['Done']));
    wrap.appendChild(btnRow);
    openModal(wrap);
  }

  function shareGameSummary(game) {
    const data = Storage.get();
    const result = game.teamScore > game.oppScore ? 'Won' : game.teamScore < game.oppScore ? 'Lost' : 'Drew';
    const lines = [
      `${data.team.name} vs ${game.opponent}`,
      `${fmtDate(game.date)}${game.round ? ' · ' + game.round : ''}`,
      `${result} ${game.teamScore} – ${game.oppScore}`,
    ];
    const scorers = data.players
      .map(p => ({ p, count: statCount(game, p.id, 'touchdowns') }))
      .filter(r => r.count > 0)
      .sort((a, b) => b.count - a.count);
    if (scorers.length) {
      lines.push('', 'Touchdowns: ' + scorers.map(r => `${r.p.name}${r.count > 1 ? ' x' + r.count : ''}`).join(', '));
    }
    const text = lines.join('\n');
    const title = `${data.team.name} vs ${game.opponent}`;

    if (navigator.share) {
      navigator.share({ title, text }).catch(() => {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(text).then(() => toast('Result copied to clipboard')).catch(() => {
        openTextFallbackModal(title, text);
      });
    } else {
      openTextFallbackModal(title, text);
    }
  }

  function openTextFallbackModal(title, text) {
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, [title]));
    const box = el('textarea', { readonly: true, rows: '8', style: 'width:100%;font-size:14px;padding:10px;border-radius:10px;border:1px solid var(--border);background:var(--bg);color:var(--text);' });
    box.value = text;
    wrap.appendChild(box);
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn btn-primary', onclick: closeModal }, ['Close']));
    wrap.appendChild(btnRow);
    openModal(wrap);
    setTimeout(() => box.select(), 50);
  }

  // ---------- ROSTER ----------
  function renderRoster() {
    const data = Storage.get();
    const list = $('#roster-list');
    list.innerHTML = '';
    if (data.players.length === 0) {
      list.appendChild(el('p', { class: 'muted' }, ['No players yet. Add your squad above.']));
    }
    data.players
      .slice()
      .sort((a, b) => (a.number || 999) - (b.number || 999))
      .forEach(p => {
        const row = el('div', { class: 'roster-row' }, [
          el('span', { class: 'player-num' }, [p.number != null ? String(p.number) : '–']),
          el('span', { class: 'player-name grow' }, [p.name]),
          el('label', { class: 'switch' }, [
            (() => { const cb = el('input', { type: 'checkbox' }); cb.checked = p.active; cb.onchange = () => Storage.updatePlayer(p.id, { active: cb.checked }); return cb; })(),
            el('span', { class: 'slider' }),
          ]),
          el('button', { class: 'btn-icon', onclick: () => openEditPlayerModal(p) }, ['✎']),
          el('button', { class: 'btn-icon danger', onclick: () => confirmRemovePlayer(p) }, ['✕']),
        ]);
        list.appendChild(row);
      });
  }

  function openEditPlayerModal(player) {
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, [player ? 'Edit Player' : 'Add Player']));
    const name = el('input', { type: 'text', placeholder: 'Full name', value: player ? player.name : '' });
    const number = el('input', { type: 'number', placeholder: 'Jersey number', value: player && player.number != null ? player.number : '' });
    wrap.appendChild(el('label', {}, ['Name', name]));
    wrap.appendChild(el('label', {}, ['Number', number]));
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
    btnRow.appendChild(el('button', {
      class: 'btn btn-primary',
      onclick: () => {
        if (!name.value.trim()) { name.focus(); return; }
        const num = number.value ? parseInt(number.value, 10) : null;
        if (player) Storage.updatePlayer(player.id, { name: name.value.trim(), number: num });
        else Storage.addPlayer(name.value.trim(), num);
        closeModal();
        renderRoster();
      },
    }, ['Save']));
    wrap.appendChild(btnRow);
    openModal(wrap);
    setTimeout(() => name.focus(), 50);
  }

  function confirmRemovePlayer(player) {
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, ['Remove Player?']));
    wrap.appendChild(el('p', {}, [`Remove ${player.name} from the roster? Past game stats already recorded for them will be kept in history.`]));
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
    btnRow.appendChild(el('button', { class: 'btn btn-danger', onclick: () => { Storage.removePlayer(player.id); closeModal(); renderRoster(); } }, ['Remove']));
    wrap.appendChild(btnRow);
    openModal(wrap);
  }

  // ---------- HISTORY ----------
  function renderHistory() {
    $('#game-detail').classList.add('hidden');
    $('#history-list').classList.remove('hidden');
    const data = Storage.get();
    const list = $('#history-list');
    list.innerHTML = '';
    const games = data.games.slice().sort((a, b) => b.createdAt - a.createdAt);
    if (games.length === 0) {
      list.appendChild(el('p', { class: 'muted' }, ['No games recorded yet.']));
      return;
    }
    games.forEach(g => {
      const result = g.status === 'live' ? 'LIVE' : (g.teamScore > g.oppScore ? 'WIN' : g.teamScore < g.oppScore ? 'LOSS' : 'DRAW');
      const row = el('div', { class: 'history-row', onclick: () => openGameDetail(g.id) }, [
        el('div', { class: 'history-result ' + result.toLowerCase() }, [result]),
        el('div', { class: 'grow' }, [
          el('div', { class: 'history-opp' }, [`vs ${g.opponent}`]),
          el('div', { class: 'muted small' }, [`${fmtDate(g.date)}${g.round ? ' · ' + g.round : ''}`]),
        ]),
        el('div', { class: 'history-score' }, [`${g.teamScore} – ${g.oppScore}`]),
      ]);
      list.appendChild(row);
    });
  }

  function openGameDetail(gameId) {
    historyDetailId = gameId;
    const game = Storage.getGame(gameId);
    const data = Storage.get();
    $('#history-list').classList.add('hidden');
    $('#game-detail').classList.remove('hidden');
    const content = $('#game-detail-content');
    content.innerHTML = '';

    if (game.status === 'live') {
      content.appendChild(el('div', { class: 'card' }, [
        el('p', {}, ['This game is still live.']),
        el('button', { class: 'btn btn-primary', onclick: () => switchView('live') }, ['Go to Live Game']),
      ]));
      return;
    }

    const header = el('div', { class: 'card' }, [
      el('h2', {}, [`vs ${game.opponent}`]),
      el('p', { class: 'muted' }, [`${fmtDate(game.date)}${game.round ? ' · ' + game.round : ''}`]),
      el('div', { class: 'big-score' }, [`${game.teamScore} – ${game.oppScore}`]),
    ]);
    content.appendChild(header);

    const players = data.players.filter(p => game.playerIds.includes(p.id));
    const table = el('table', { class: 'stat-grid detail-grid' });
    const thead = el('thead');
    const headRow = el('tr');
    headRow.appendChild(el('th', { class: 'col-player' }, ['Player']));
    data.statDefs.forEach(s => headRow.appendChild(el('th', { title: s.label }, [s.short || s.label])));
    thead.appendChild(headRow);
    table.appendChild(thead);
    const tbody = el('tbody');
    players.forEach(p => {
      const tr = el('tr');
      tr.appendChild(el('td', { class: 'col-player' }, [
        el('span', { class: 'player-num' }, [p.number != null ? String(p.number) : '–']),
        el('span', { class: 'player-name' }, [p.name]),
      ]));
      data.statDefs.forEach(s => tr.appendChild(el('td', {}, [String(statCount(game, p.id, s.id))])));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);

    const tfoot = el('tfoot');
    const totalRow = el('tr', { class: 'team-total-row' });
    totalRow.appendChild(el('td', { class: 'col-player' }, ['TEAM TOTAL']));
    data.statDefs.forEach(s => {
      const total = players.reduce((sum, p) => sum + statCount(game, p.id, s.id), 0);
      totalRow.appendChild(el('td', {}, [String(total)]));
    });
    tfoot.appendChild(totalRow);
    table.appendChild(tfoot);
    const gridCard = el('div', { class: 'card grid-wrap' }, [table]);
    content.appendChild(gridCard);

    const actions = el('div', { class: 'btn-row' }, [
      el('button', { class: 'btn', onclick: () => shareGameSummary(game) }, ['Share Result']),
      el('button', { class: 'btn', onclick: () => { Storage.reopenGame(game.id); currentCategory = null; switchView('live'); } }, ['Reopen Game']),
      el('button', { class: 'btn btn-danger', onclick: () => confirmDeleteGame(game) }, ['Delete Game']),
    ]);
    content.appendChild(actions);
  }

  function confirmDeleteGame(game) {
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, ['Delete Game?']));
    wrap.appendChild(el('p', {}, [`This permanently deletes the vs ${game.opponent} game and removes its stats from your season totals.`]));
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
    btnRow.appendChild(el('button', {
      class: 'btn btn-danger',
      onclick: () => { Storage.deleteGame(game.id); closeModal(); renderHistory(); },
    }, ['Delete']));
    wrap.appendChild(btnRow);
    openModal(wrap);
  }

  // ---------- SETTINGS ----------
  function renderSettings() {
    const data = Storage.get();
    $('#set-team-name').value = data.team.name;
    $('#set-team-club').value = data.team.club;
    $('#set-team-event').value = data.team.event;

    updateOfflineStatus();
    const outdoorToggle = $('#set-outdoor-mode');
    outdoorToggle.checked = !!data.settings.outdoorMode;
    outdoorToggle.onchange = () => {
      Storage.updateSettings({ outdoorMode: outdoorToggle.checked });
      applyOutdoorMode(outdoorToggle.checked);
    };

    renderFixturesList();

    const list = $('#stat-defs-list');
    list.innerHTML = '';
    data.statDefs.forEach((s, i) => {
      const row = el('div', { class: 'roster-row' }, [
        el('span', { class: 'grow' }, [`${s.label} `, el('span', { class: 'muted small' }, [`(${s.category})`])]),
        el('button', { class: 'btn-icon', disabled: i === 0, onclick: () => moveStat(s.id, -1) }, ['↑']),
        el('button', { class: 'btn-icon', disabled: i === data.statDefs.length - 1, onclick: () => moveStat(s.id, 1) }, ['↓']),
        el('button', { class: 'btn-icon', onclick: () => openEditStatModal(s) }, ['✎']),
        el('button', { class: 'btn-icon danger', onclick: () => confirmRemoveStat(s) }, ['✕']),
      ]);
      list.appendChild(row);
    });

    $('#btn-save-team').onclick = () => {
      Storage.get().team.name = $('#set-team-name').value;
      Storage.get().team.club = $('#set-team-club').value;
      Storage.get().team.event = $('#set-team-event').value;
      localStorage.setItem('touchstats_v1', JSON.stringify(Storage.get()));
      updateHeader();
      toast('Team details saved');
    };
  }

  function renderFixturesList() {
    const fixtures = Storage.listFixtures();
    const list = $('#fixtures-list');
    list.innerHTML = '';
    if (fixtures.length === 0) {
      list.appendChild(el('p', { class: 'muted' }, ['No fixtures loaded yet. Add them once the draw is released so games can be started with a tap.']));
      return;
    }
    fixtures.forEach(f => {
      const status = !f.game ? 'Scheduled' : f.game.status === 'live' ? 'Live' : 'Played';
      const row = el('div', { class: 'roster-row' }, [
        el('span', { class: 'grow' }, [
          el('strong', {}, [`vs ${f.opponent}`]), ' ',
          el('span', { class: 'muted small' }, [`— ${fmtDate(f.date)}${f.time ? ' ' + f.time : ''}${f.round ? ' · ' + f.round : ''}${f.venue ? ' · ' + f.venue : ''} · ${status}`]),
        ]),
        el('button', { class: 'btn-icon', disabled: !!f.game, onclick: () => openEditFixtureModal(f) }, ['✎']),
        el('button', { class: 'btn-icon danger', disabled: !!f.game, onclick: () => confirmRemoveFixture(f) }, ['✕']),
      ]);
      list.appendChild(row);
    });
  }

  function openEditFixtureModal(fixture) {
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, [fixture ? 'Edit Fixture' : 'Add Fixture']));
    const opponent = el('input', { type: 'text', placeholder: 'Opponent team name', value: fixture ? fixture.opponent : '' });
    const date = el('input', { type: 'date', value: fixture ? fixture.date : '' });
    const time = el('input', { type: 'time', value: fixture ? fixture.time : '' });
    const round = el('input', { type: 'text', placeholder: 'e.g. Pool A – Round 3', value: fixture ? fixture.round : '' });
    const venue = el('input', { type: 'text', placeholder: 'e.g. Field 4', value: fixture ? fixture.venue : '' });
    wrap.appendChild(el('label', {}, ['Opponent', opponent]));
    wrap.appendChild(el('label', {}, ['Date', date]));
    wrap.appendChild(el('label', {}, ['Time (optional)', time]));
    wrap.appendChild(el('label', {}, ['Round / Pool (optional)', round]));
    wrap.appendChild(el('label', {}, ['Venue / Field (optional)', venue]));
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
    btnRow.appendChild(el('button', {
      class: 'btn btn-primary',
      onclick: () => {
        if (!opponent.value.trim() || !date.value) { (opponent.value.trim() ? date : opponent).focus(); return; }
        const fields = { opponent: opponent.value.trim(), date: date.value, time: time.value, round: round.value.trim(), venue: venue.value.trim() };
        if (fixture) Storage.updateFixture(fixture.id, fields);
        else Storage.addFixture(fields);
        closeModal();
        renderFixturesList();
        if (currentView === 'dashboard') renderDashboard();
      },
    }, ['Save']));
    wrap.appendChild(btnRow);
    openModal(wrap);
    setTimeout(() => opponent.focus(), 50);
  }

  function confirmRemoveFixture(fixture) {
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, ['Remove Fixture?']));
    wrap.appendChild(el('p', {}, [`Remove the fixture vs ${fixture.opponent}?`]));
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
    btnRow.appendChild(el('button', { class: 'btn btn-danger', onclick: () => { Storage.removeFixture(fixture.id); closeModal(); renderFixturesList(); } }, ['Remove']));
    wrap.appendChild(btnRow);
    openModal(wrap);
  }

  function moveStat(id, dir) {
    const data = Storage.get();
    const ids = data.statDefs.map(s => s.id);
    const idx = ids.indexOf(id);
    const swap = idx + dir;
    if (swap < 0 || swap >= ids.length) return;
    [ids[idx], ids[swap]] = [ids[swap], ids[idx]];
    Storage.reorderStatDefs(ids);
    renderSettings();
  }

  function openEditStatModal(stat) {
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, [stat ? 'Edit Stat' : 'Add Stat']));
    const label = el('input', { type: 'text', placeholder: 'Stat name, e.g. Tap & Go', value: stat ? stat.label : '' });
    const category = el('input', { type: 'text', placeholder: 'Category, e.g. Attack', value: stat ? stat.category : '' });
    const short = el('input', { type: 'text', placeholder: 'Short code (2-4 letters)', value: stat ? stat.short : '', maxlength: '4' });
    wrap.appendChild(el('label', {}, ['Stat Name', label]));
    wrap.appendChild(el('label', {}, ['Category', category]));
    wrap.appendChild(el('label', {}, ['Short Code (shown in grid)', short]));
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
    btnRow.appendChild(el('button', {
      class: 'btn btn-primary',
      onclick: () => {
        if (!label.value.trim()) { label.focus(); return; }
        const shortCode = short.value.trim() || label.value.trim().slice(0, 3).toUpperCase();
        if (stat) Storage.updateStatDef(stat.id, { label: label.value.trim(), category: category.value.trim() || 'Other', short: shortCode });
        else Storage.addStatDef(label.value.trim(), category.value.trim() || 'Other');
        closeModal();
        renderSettings();
      },
    }, ['Save']));
    wrap.appendChild(btnRow);
    openModal(wrap);
    setTimeout(() => label.focus(), 50);
  }

  function confirmRemoveStat(stat) {
    const wrap = el('div', { class: 'form-card' });
    wrap.appendChild(el('h2', {}, ['Remove Stat?']));
    wrap.appendChild(el('p', {}, [`Remove "${stat.label}"? Historical counts already logged for it will no longer be shown.`]));
    const btnRow = el('div', { class: 'btn-row' });
    btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
    btnRow.appendChild(el('button', { class: 'btn btn-danger', onclick: () => { Storage.removeStatDef(stat.id); closeModal(); renderSettings(); } }, ['Remove']));
    wrap.appendChild(btnRow);
    openModal(wrap);
  }

  function updateHeader() {
    const data = Storage.get();
    $('#team-name').textContent = data.team.name;
    $('#team-sub').textContent = `${data.team.club} · ${data.team.event}`;
  }

  // ---------- export/import ----------
  function downloadFile(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  function exportCSV() {
    const data = Storage.get();
    const games = Storage.completedGames();
    const cum = Storage.cumulativeTotals();
    let rows = [['Number', 'Player', ...data.statDefs.map(s => s.label)]];
    data.players.forEach(p => {
      rows.push([p.number != null ? p.number : '', p.name, ...data.statDefs.map(s => (cum[p.id] && cum[p.id][s.id]) || 0)]);
    });
    rows.push([]);
    rows.push(['Games completed', games.length]);
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    downloadFile(`${data.team.name.replace(/\s+/g, '_')}_stats.csv`, csv, 'text/csv');
  }

  // ---------- init ----------
  // Reports whether the offline cache (service worker) is actually installed on this device.
  let offlineRetries = 0;
  async function updateOfflineStatus() {
    const warn = $('#offline-warning');
    const line = $('#offline-status');
    let ok = false;
    let msg = '';
    try {
      if (!('serviceWorker' in navigator)) {
        msg = 'Offline use is NOT available at this address — the app must be installed from an https:// address to work without internet.';
      } else {
        const reg = await navigator.serviceWorker.getRegistration();
        if (!reg || !reg.active) {
          msg = 'Offline cache not installed yet — stay in the app for a few seconds while online, then close and reopen it.';
        } else {
          let files = 0;
          for (const key of await caches.keys()) files += (await (await caches.open(key)).keys()).length;
          ok = files > 0;
          msg = ok ? `Ready for offline use — ${files} files cached on this device.` : 'Offline cache is empty — reopen the app while online.';
        }
      }
    } catch (e) {
      msg = 'Could not check offline status: ' + e.message;
    }
    if (line) {
      line.textContent = (ok ? '✓ ' : '⚠ ') + msg;
      line.classList.toggle('status-ok', ok);
      line.classList.toggle('status-warn', !ok);
    }
    if (warn) {
      warn.textContent = '⚠ ' + msg;
      warn.classList.toggle('hidden', ok);
    }
    // The worker usually finishes installing a moment after first load — re-check a few times.
    if (!ok && 'serviceWorker' in navigator && offlineRetries < 5) { offlineRetries++; setTimeout(updateOfflineStatus, 4000); }
    if (ok) offlineRetries = 0;
  }

  function applyOutdoorMode(enabled) {
    document.documentElement.classList.toggle('outdoor-mode', !!enabled);
  }

  function init() {
    updateHeader();
    applyOutdoorMode(Storage.get().settings.outdoorMode);
    $all('.tab-btn').forEach(btn => btn.addEventListener('click', () => switchView(btn.dataset.view)));
    $('#btn-new-game-dash').addEventListener('click', openNewGameModal);
    $('#btn-new-game-live').addEventListener('click', openNewGameModal);
    $('#btn-add-player').addEventListener('click', () => openEditPlayerModal(null));
    $('#btn-add-stat').addEventListener('click', () => openEditStatModal(null));
    $('#btn-add-fixture').addEventListener('click', () => openEditFixtureModal(null));
    $('#btn-back-history').addEventListener('click', renderHistory);
    $('#btn-export-json').addEventListener('click', () => {
      const data = Storage.get();
      downloadFile(`${data.team.name.replace(/\s+/g, '_')}_backup.json`, Storage.exportJSON(), 'application/json');
    });
    $('#btn-export-csv').addEventListener('click', exportCSV);
    $('#import-file').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          Storage.importJSON(reader.result);
          toast('Backup restored');
          renderCurrentView();
          updateHeader();
        } catch (err) {
          alert('Could not read that file as a valid backup.');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });
    $('#btn-reset-all').addEventListener('click', () => {
      const wrap = el('div', { class: 'form-card' });
      wrap.appendChild(el('h2', {}, ['Reset All Data?']));
      wrap.appendChild(el('p', {}, ['This deletes every player, game and stat permanently. Export a backup first if you might want this data later.']));
      const btnRow = el('div', { class: 'btn-row' });
      btnRow.appendChild(el('button', { class: 'btn', onclick: closeModal }, ['Cancel']));
      btnRow.appendChild(el('button', { class: 'btn btn-danger', onclick: () => { Storage.resetAll(); closeModal(); updateHeader(); switchView('dashboard'); } }, ['Reset Everything']));
      wrap.appendChild(btnRow);
      openModal(wrap);
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && currentView === 'live') {
        const game = Storage.getLiveGame();
        if (game) renderTimerSection(game);
      }
    });

    switchView('dashboard');

    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err));
      });
    }
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', App.init);
