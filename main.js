// =========================================================================
// Wリーグ プレミア 選手・チーム総合分析ダッシュボード メインスクリプト
// =========================================================================

const PALETTE = [
    '#2563eb', '#e11d48', '#059669', '#d97706',
    '#7c3aed', '#0891b2', '#db2777', '#4f46e5',
    '#ea580c', '#16a34a'
];

const TEAM_COLORS = {
    'ENEOSサンフラワーズ': '#f59e0b',
    '富士通 レッドウェーブ': '#dc2626',
    'デンソー アイリス': '#e11d48',
    'トヨタ自動車 アンテロープス': '#16a34a',
    'シャンソン化粧品 シャンソンVマジック': '#ec4899',
    'トヨタ紡織 サンシャインラビッツ': '#ea580c',
    '日立ハイテク クーガーズ': '#2563eb',
    'アイシン ウィングス': '#0284c7'
};

let APP_STATE = {
    bundle: null,
    players: [],
    teams: [],
    heaveEvents: [],
    selectedPlayers: [],
    rule: 'normal',       // 'normal' | 'nba'
    statMode: 'avg',      // 'avg' | 'total' | 'per40'
    minMinutes: 10,
    radarNorm: 'filtered_max',
    teamFilter: 'all',
    searchQuery: '',
    rankingSortKey: 'ポイント',
    rankingSortAsc: false,
    detailPlayerName: null,
    activeTab: 'tab-compare'
};

document.addEventListener('DOMContentLoaded', () => {
    loadInitialData();
    bindGlobalEvents();
});

// -------------------------------------------------------------------------
// 1. データ読み込み (fetch + ローカル file:// 用 JSバンドルフォールバック)
// -------------------------------------------------------------------------
function loadInitialData() {
    fetch('data/w_premire_full_data.json')
        .then(res => {
            if (!res.ok) throw new Error('HTTP status ' + res.status);
            return res.json();
        })
        .then(bundle => {
            hydrateBundle(bundle, bundle.source_file || 'W_League_Stats_Premire.csv');
        })
        .catch(() => {
            if (window.W_LEAGUE_BUNDLE) {
                hydrateBundle(window.W_LEAGUE_BUNDLE, window.W_LEAGUE_BUNDLE.source_file || 'W_League_Stats_Premire.csv');
            } else {
                alert('データの読み込みに失敗しました。w_player_data.py を実行するか、画面右上の「CSV直接読込」からCSVファイルを選択してください。');
            }
        });
}

function hydrateBundle(bundle, sourceLabel) {
    APP_STATE.bundle = bundle;
    APP_STATE.players = bundle.players || [];
    APP_STATE.teams = bundle.teams || [];
    APP_STATE.heaveEvents = bundle.heave_events || [];

    const badge = document.getElementById('data-source-badge');
    if (badge) badge.textContent = sourceLabel;

    // 初期選択: 平均10分以上の得点上位4名
    const eligible = APP_STATE.players
        .filter(p => p['出場時間_分'] >= 10)
        .sort((a, b) => b['ポイント'] - a['ポイント']);

    if (eligible.length >= 4) {
        APP_STATE.selectedPlayers = eligible.slice(0, 4).map(p => p['選手名']);
    } else {
        APP_STATE.selectedPlayers = APP_STATE.players.slice(0, 3).map(p => p['選手名']);
    }

    if (eligible.length > 0) {
        APP_STATE.detailPlayerName = eligible[0]['選手名'];
    } else if (APP_STATE.players.length > 0) {
        APP_STATE.detailPlayerName = APP_STATE.players[0]['選手名'];
    }

    populateSelectMenus();
    renderAll();
}

// -------------------------------------------------------------------------
// 2. イベントバインディング
// -------------------------------------------------------------------------
function bindGlobalEvents() {
    // タブ切替
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            switchTab(btn.dataset.tab);
        });
    });

    // ルール切替 (公式 vs NBAルール)
    document.querySelectorAll('input[name="rule"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            APP_STATE.rule = e.target.value;
            renderAll();
        });
    });

    // CSV直接アップロード
    const csvInput = document.getElementById('csv-file-input');
    if (csvInput) {
        csvInput.addEventListener('change', handleCsvUpload);
    }

    // 用語集ポップアップモーダル開閉
    const glossaryModal = document.getElementById('glossary-modal');
    const openGlossaryBtn = document.getElementById('open-glossary-btn');
    const closeGlossaryBtn = document.getElementById('close-glossary-btn');

    if (openGlossaryBtn && glossaryModal) {
        openGlossaryBtn.addEventListener('click', () => {
            glossaryModal.classList.add('open');
            glossaryModal.setAttribute('aria-hidden', 'false');
        });
    }
    if (closeGlossaryBtn && glossaryModal) {
        closeGlossaryBtn.addEventListener('click', () => {
            glossaryModal.classList.remove('open');
            glossaryModal.setAttribute('aria-hidden', 'true');
        });
    }
    if (glossaryModal) {
        glossaryModal.addEventListener('click', (e) => {
            if (e.target === glossaryModal) {
                glossaryModal.classList.remove('open');
                glossaryModal.setAttribute('aria-hidden', 'true');
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && glossaryModal.classList.contains('open')) {
                glossaryModal.classList.remove('open');
                glossaryModal.setAttribute('aria-hidden', 'true');
            }
        });
    }

    // Tab 1 コントロール
    document.getElementById('stat-mode-select').addEventListener('change', (e) => {
        APP_STATE.statMode = e.target.value;
        updateTab1();
    });

    document.getElementById('min-filter-select').addEventListener('change', (e) => {
        APP_STATE.minMinutes = parseFloat(e.target.value) || 0;
        renderPlayerCheckboxList();
        updateTab1();
    });

    document.getElementById('radar-norm-select').addEventListener('change', (e) => {
        APP_STATE.radarNorm = e.target.value;
        updateTab1();
    });

    document.getElementById('team-select').addEventListener('change', (e) => {
        APP_STATE.teamFilter = e.target.value;
        renderPlayerCheckboxList();
        renderLeagueRankingTable();
        renderScatterPlot();
    });

    document.getElementById('player-search-input').addEventListener('input', (e) => {
        APP_STATE.searchQuery = e.target.value.trim().toLowerCase();
        renderPlayerCheckboxList();
        renderLeagueRankingTable();
    });

    document.getElementById('deselect-all-btn').addEventListener('click', () => {
        APP_STATE.selectedPlayers = [];
        renderPlayerCheckboxList();
        updateTab1();
    });

    // プリセットボタン
    document.querySelectorAll('.btn-preset').forEach(btn => {
        btn.addEventListener('click', () => {
            applyPresetSelection(btn.dataset.preset);
        });
    });

    // 散布図セレクト
    ['scatter-x-select', 'scatter-y-select', 'scatter-size-select'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => renderScatterPlot());
    });

    // ランキングハイライト指標セレクト
    document.getElementById('ranking-metric-select').addEventListener('change', (e) => {
        APP_STATE.rankingSortKey = e.target.value;
        APP_STATE.rankingSortAsc = false;
        renderLeagueRankingTable();
    });

    // ランキングテーブルの列ソート
    document.querySelectorAll('#league-ranking-table th[data-sort]').forEach(th => {
        th.addEventListener('click', () => {
            const key = th.dataset.sort;
            if (key === 'rank') return;
            if (APP_STATE.rankingSortKey === key) {
                APP_STATE.rankingSortAsc = !APP_STATE.rankingSortAsc;
            } else {
                APP_STATE.rankingSortKey = key;
                APP_STATE.rankingSortAsc = (key === '選手名' || key === 'チーム名');
            }
            renderLeagueRankingTable();
        });
    });

    // Tab 2: 選手個人詳細
    document.getElementById('detail-team-filter').addEventListener('change', () => {
        populateDetailPlayerSelect();
        renderTab2PlayerDetail();
    });

    document.getElementById('detail-player-select').addEventListener('change', (e) => {
        APP_STATE.detailPlayerName = e.target.value;
        renderTab2PlayerDetail();
    });

    document.getElementById('player-trend-metric').addEventListener('change', () => {
        renderTab2PlayerDetail();
    });

    document.getElementById('add-current-to-compare-btn').addEventListener('click', () => {
        const name = APP_STATE.detailPlayerName;
        if (name && !APP_STATE.selectedPlayers.includes(name)) {
            APP_STATE.selectedPlayers.push(name);
            renderPlayerCheckboxList();
            updateTab1();
        }
        switchTab('tab-compare');
    });

    // Tab 3: チーム傾向
    document.getElementById('team-share-metric').addEventListener('change', () => {
        renderTeamPlayerShareChart();
    });

    document.getElementById('team-game-log-select').addEventListener('change', () => {
        renderTeamGameTrendChart();
    });

    // Tab 4: NBAルール比較
    document.getElementById('nba-impact-metric').addEventListener('change', () => {
        renderNbaTab();
    });
}

function switchTab(tabId) {
    APP_STATE.activeTab = tabId;
    document.querySelectorAll('.tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tabId);
    });
    document.querySelectorAll('.tab-panel').forEach(panel => {
        panel.classList.toggle('active', panel.id === tabId);
    });

    // 表示されたタブ内のPlotlyチャートをリサイズ
    setTimeout(() => {
        const activePanel = document.getElementById(tabId);
        if (activePanel) {
            activePanel.querySelectorAll('.js-plotly-plot').forEach(plotDiv => {
                Plotly.Plots.resize(plotDiv);
            });
        }
    }, 50);
}

function jumpToPlayerDetail(playerName) {
    APP_STATE.detailPlayerName = playerName;
    const teamFilter = document.getElementById('detail-team-filter');
    if (teamFilter) teamFilter.value = 'all';
    populateDetailPlayerSelect();
    const sel = document.getElementById('detail-player-select');
    if (sel) sel.value = playerName;
    renderTab2PlayerDetail();
    switchTab('tab-player');
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// -------------------------------------------------------------------------
// 3. セレクトメニュー・チェックボックス初期化
// -------------------------------------------------------------------------
function populateSelectMenus() {
    const teams = APP_STATE.teams.map(t => t['チーム名']);

    // Tab 1 チーム選択
    const teamSelect = document.getElementById('team-select');
    teamSelect.innerHTML = `<option value="all">すべてのチーム (${teams.length}チーム)</option>`;
    teams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        teamSelect.appendChild(opt);
    });

    // Tab 2 チーム選択
    const detailTeamFilter = document.getElementById('detail-team-filter');
    detailTeamFilter.innerHTML = `<option value="all">すべてのチーム (${teams.length}チーム)</option>`;
    teams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        detailTeamFilter.appendChild(opt);
    });

    populateDetailPlayerSelect();

    // Tab 3 チーム試合推移セレクト
    const teamLogSelect = document.getElementById('team-game-log-select');
    teamLogSelect.innerHTML = '';
    teams.forEach(t => {
        const opt = document.createElement('option');
        opt.value = t;
        opt.textContent = t;
        teamLogSelect.appendChild(opt);
    });
}

function populateDetailPlayerSelect() {
    const teamVal = document.getElementById('detail-team-filter').value;
    const select = document.getElementById('detail-player-select');
    const filtered = APP_STATE.players
        .filter(p => teamVal === 'all' || p['チーム名'] === teamVal)
        .sort((a, b) => b['ポイント'] - a['ポイント']);

    select.innerHTML = '';
    filtered.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p['選手名'];
        opt.textContent = `[${p['チーム名']}] #${p['背番号']} ${p['選手名']} (${p['ポイント'].toFixed(1)} PPG / 出場${p['出場試合数']}・先発${p['先発試合数']})`;
        select.appendChild(opt);
    });

    if (APP_STATE.detailPlayerName && filtered.some(p => p['選手名'] === APP_STATE.detailPlayerName)) {
        select.value = APP_STATE.detailPlayerName;
    } else if (filtered.length > 0) {
        APP_STATE.detailPlayerName = filtered[0]['選手名'];
        select.value = APP_STATE.detailPlayerName;
    }
}

function renderPlayerCheckboxList() {
    const container = document.getElementById('player-checkbox-list');
    container.innerHTML = '';

    const sorted = [...APP_STATE.players].sort((a, b) => b['ポイント'] - a['ポイント']);
    sorted.forEach(player => {
        const matchTeam = APP_STATE.teamFilter === 'all' || player['チーム名'] === APP_STATE.teamFilter;
        const matchMin = player['出場時間_分'] >= APP_STATE.minMinutes;
        const matchSearch = !APP_STATE.searchQuery ||
            player['選手名'].toLowerCase().includes(APP_STATE.searchQuery) ||
            player['チーム名'].toLowerCase().includes(APP_STATE.searchQuery);

        const isChecked = APP_STATE.selectedPlayers.includes(player['選手名']);
        if (!matchTeam || (!matchMin && !isChecked) || !matchSearch) {
            return;
        }

        const label = document.createElement('label');
        if (isChecked) label.classList.add('checked-item');

        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.value = player['選手名'];
        cb.checked = isChecked;

        cb.addEventListener('change', () => {
            if (cb.checked) {
                if (!APP_STATE.selectedPlayers.includes(cb.value)) {
                    APP_STATE.selectedPlayers.push(cb.value);
                }
            } else {
                APP_STATE.selectedPlayers = APP_STATE.selectedPlayers.filter(n => n !== cb.value);
            }
            renderPlayerCheckboxList();
            updateTab1();
        });

        const nameSpan = document.createElement('span');
        const shortTeam = player['チーム名'].split(' ')[0];
        nameSpan.textContent = `${player['選手名']} (${shortTeam})`;

        const metaSpan = document.createElement('span');
        metaSpan.className = 'player-meta-pill';
        metaSpan.textContent = `${player['ポイント'].toFixed(1)}P`;

        label.appendChild(cb);
        label.appendChild(nameSpan);
        label.appendChild(metaSpan);
        container.appendChild(label);
    });

    const badge = document.getElementById('selected-count-badge');
    if (badge) badge.textContent = `${APP_STATE.selectedPlayers.length}名選択中`;
}

function applyPresetSelection(presetType) {
    const pool = APP_STATE.players.filter(p => p['出場時間_分'] >= APP_STATE.minMinutes &&
        (APP_STATE.teamFilter === 'all' || p['チーム名'] === APP_STATE.teamFilter));

    let sorted = [];
    const efgKey = getRuleKey('eFG%');
    if (presetType === 'pts') {
        sorted = [...pool].sort((a, b) => b['ポイント'] - a['ポイント']);
    } else if (presetType === 'reb') {
        sorted = [...pool].sort((a, b) => b['トータルリバウンド数'] - a['トータルリバウンド数']);
    } else if (presetType === 'ast') {
        sorted = [...pool].sort((a, b) => b['アシスト数'] - a['アシスト数']);
    } else if (presetType === 'efg') {
        sorted = [...pool].filter(p => (p['通算']?.FGA || 0) >= 15).sort((a, b) => b[efgKey] - a[efgKey]);
    } else if (presetType === 'def') {
        sorted = [...pool].sort((a, b) => b['守備的圧力'] - a['守備的圧力']);
    } else if (presetType === 'heave') {
        sorted = [...APP_STATE.players].filter(p => (p['通算']?.['ヒーブ除外数'] || 0) > 0)
            .sort((a, b) => b['3P%_diff'] - a['3P%_diff']);
    }

    APP_STATE.selectedPlayers = sorted.slice(0, 5).map(p => p['選手名']);
    renderPlayerCheckboxList();
    updateTab1();
}

// -------------------------------------------------------------------------
// 4. ヘルパー関数 (ルール別キー取得・表示モード換算)
// -------------------------------------------------------------------------
function getRuleKey(baseKey) {
    if (APP_STATE.rule === 'nba') {
        if (baseKey === 'eFG%') return 'eFG%_NBA';
        if (baseKey === '3P%') return '3P%_NBA';
        if (baseKey === 'TS%') return 'TS%_NBA';
        if (baseKey === 'FG%') return 'FG%_NBA';
    }
    return baseKey;
}

function getStatVal(player, key) {
    const actualKey = getRuleKey(key);
    // パーセンテージ・比率系はモードによらずそのまま返す
    const pctKeys = ['2P%', '3P%', '3P%_NBA', 'FT%', 'eFG%', 'eFG%_NBA', 'TS%', 'TS%_NBA', 'FG%', 'FG%_NBA', '堅実性', 'AST_TO'];
    if (pctKeys.includes(actualKey)) {
        return Number(player[actualKey] || 0);
    }

    const mode = APP_STATE.statMode;
    if (mode === 'total' && player['通算'] && player['通算'][actualKey] !== undefined) {
        return Number(player['通算'][actualKey] || 0);
    }
    if (mode === 'per40') {
        const totMin = player['通算']?.['出場時間_分'] || 0;
        if (actualKey === '出場時間_分') return Number(player['出場時間_分'] || 0);
        if (totMin > 0 && player['通算'] && player['通算'][actualKey] !== undefined) {
            return Number(((player['通算'][actualKey] / totMin) * 40.0).toFixed(2));
        }
    }
    return Number(player[actualKey] || 0);
}

// -------------------------------------------------------------------------
// 5. 全体描画 (KPIバー + 各タブ更新)
// -------------------------------------------------------------------------
function renderAll() {
    renderKpiSummaryBar();
    renderPlayerCheckboxList();
    updateTab1();
    renderTab2PlayerDetail();
    renderTab3TeamTrends();
    renderNbaTab();
}

function renderKpiSummaryBar() {
    const bar = document.getElementById('kpi-summary-bar');
    const activePlayers = APP_STATE.players.filter(p => p['出場試合数'] > 0);
    const totalGames = APP_STATE.teams.reduce((acc, t) => acc + t['試合数'], 0) / 2;

    const topScorer = [...activePlayers].sort((a, b) => b['ポイント'] - a['ポイント'])[0];
    const topReb = [...activePlayers].sort((a, b) => b['トータルリバウンド数'] - a['トータルリバウンド数'])[0];
    const topAst = [...activePlayers].sort((a, b) => b['アシスト数'] - a['アシスト数'])[0];

    const total3PM = APP_STATE.teams.reduce((s, t) => s + t['3P_成功_合計'], 0);
    const total3PA = APP_STATE.teams.reduce((s, t) => s + t['3P_試投_合計'], 0);
    const total3PA_NBA = APP_STATE.teams.reduce((s, t) => s + t['3P_NBA_試投_合計'], 0);
    const totalHeaves = APP_STATE.teams.reduce((s, t) => s + t['ヒーブ除外数_合計'], 0);

    const lg3P_normal = total3PA > 0 ? ((total3PM / total3PA) * 100).toFixed(1) : '0.0';
    const lg3P_nba = total3PA_NBA > 0 ? ((total3PM / total3PA_NBA) * 100).toFixed(1) : '0.0';

    bar.innerHTML = `
        <div class="kpi-card">
            <div class="kpi-label">収録試合・出場選手数</div>
            <div class="kpi-value">${totalGames}試合 / ${activePlayers.length}名</div>
            <div class="kpi-sub">プレミア全${APP_STATE.teams.length}チーム (登録${APP_STATE.players.length}名)</div>
        </div>
        <div class="kpi-card accent-red">
            <div class="kpi-label">得点リーダー (1試合平均)</div>
            <div class="kpi-value">${topScorer ? topScorer['ポイント'].toFixed(1) : '-'} <small>PPG</small></div>
            <div class="kpi-sub">${topScorer ? `${topScorer['選手名']} (${topScorer['チーム名'].split(' ')[0]})` : '-'}</div>
        </div>
        <div class="kpi-card accent-green">
            <div class="kpi-label">リバウンドリーダー</div>
            <div class="kpi-value">${topReb ? topReb['トータルリバウンド数'].toFixed(1) : '-'} <small>RPG</small></div>
            <div class="kpi-sub">${topReb ? `${topReb['選手名']} (${topReb['チーム名'].split(' ')[0]})` : '-'}</div>
        </div>
        <div class="kpi-card">
            <div class="kpi-label">アシストリーダー</div>
            <div class="kpi-value">${topAst ? topAst['アシスト数'].toFixed(1) : '-'} <small>APG</small></div>
            <div class="kpi-sub">${topAst ? `${topAst['選手名']} (${topAst['チーム名'].split(' ')[0]})` : '-'}</div>
        </div>
        <div class="kpi-card accent-amber">
            <div class="kpi-label">リーグ全体 3P% (NBAヒーブ補正)</div>
            <div class="kpi-value">${lg3P_normal}% → ${lg3P_nba}%</div>
            <div class="kpi-sub">ヒーブ除外: 計${totalHeaves}本 (${APP_STATE.heaveEvents.length}試合レコード)</div>
        </div>
    `;
}

// -------------------------------------------------------------------------
// 6. TAB 1: 選手比較・リーグ俯瞰
// -------------------------------------------------------------------------
function updateTab1() {
    renderComparisonTable();
    renderComparisonCharts();
    renderScatterPlot();
    renderLeagueRankingTable();
}

function renderComparisonTable() {
    const tbody = document.querySelector('#stats-table tbody');
    tbody.innerHTML = '';

    const selectedData = APP_STATE.players
        .filter(p => APP_STATE.selectedPlayers.includes(p['選手名']))
        .sort((a, b) => getStatVal(b, 'ポイント') - getStatVal(a, 'ポイント'));

    if (selectedData.length === 0) {
        tbody.innerHTML = `<tr><td colspan="20" style="text-align:center; padding:24px; color:#64748b;">比較する選手が選択されていません。上のリストまたはプリセットボタンから選択してください。</td></tr>`;
        return;
    }

    const digits = APP_STATE.statMode === 'total' ? 0 : 1;

    selectedData.forEach((player, i) => {
        const color = PALETTE[i % PALETTE.length];
        const tr = document.createElement('tr');
        tr.style.borderLeft = `5px solid ${color}`;

        const p3Val = getStatVal(player, '3P%');
        const efgVal = getStatVal(player, 'eFG%');
        const tsVal = getStatVal(player, 'TS%');
        const heaveCount = player['通算']?.['ヒーブ除外数'] || 0;
        const heaveBadge = (APP_STATE.rule === 'nba' && heaveCount > 0)
            ? ` <span class="heave-tag" title="ヒーブ除外 ${heaveCount}本 (+${player['eFG%_diff'].toFixed(1)}%)">⚡+${player['eFG%_diff'].toFixed(1)}</span>`
            : '';

        tr.innerHTML = `
            <td>
                <a class="player-link" data-player="${player['選手名']}">${player['選手名']}</a>
                <span class="team-sub">#${player['背番号']} ${player['チーム名'].split(' ')[0]}</span>
            </td>
            <td style="text-align:center;">${player['出場試合数']}(${player['先発試合数']})</td>
            <td>${getStatVal(player, '出場時間_分').toFixed(1)}</td>
            <td style="font-weight:800;">${getStatVal(player, 'ポイント').toFixed(digits)}</td>
            <td>${player['2P%'].toFixed(1)}%</td>
            <td>${p3Val.toFixed(1)}%</td>
            <td>${player['FT%'].toFixed(1)}%</td>
            <td class="highlight-col">${efgVal.toFixed(1)}%${heaveBadge}</td>
            <td>${tsVal.toFixed(1)}%</td>
            <td>${getStatVal(player, 'オフェンスリバウンド数').toFixed(digits)}</td>
            <td>${getStatVal(player, 'ディフェンスリバウンド数').toFixed(digits)}</td>
            <td style="font-weight:700;">${getStatVal(player, 'トータルリバウンド数').toFixed(digits)}</td>
            <td style="font-weight:700;">${getStatVal(player, 'アシスト数').toFixed(digits)}</td>
            <td>${getStatVal(player, 'スティール数').toFixed(digits)}</td>
            <td>${getStatVal(player, 'ブロック数').toFixed(digits)}</td>
            <td>${getStatVal(player, 'ターンオーバー数').toFixed(digits)}</td>
            <td>${getStatVal(player, '攻撃権創出').toFixed(digits)}</td>
            <td>${getStatVal(player, '守備的圧力').toFixed(digits)}</td>
            <td>${player['堅実性'].toFixed(2)}</td>
            <td style="font-weight:700;">${getStatVal(player, 'EFF').toFixed(digits)}</td>
        `;

        tr.querySelector('.player-link').addEventListener('click', () => {
            jumpToPlayerDetail(player['選手名']);
        });
        tbody.appendChild(tr);
    });
}

function renderComparisonCharts() {
    const selectedData = APP_STATE.players
        .filter(p => APP_STATE.selectedPlayers.includes(p['選手名']))
        .sort((a, b) => getStatVal(b, 'ポイント') - getStatVal(a, 'ポイント'));

    if (selectedData.length === 0) {
        Plotly.purge('radar-chart');
        Plotly.purge('bar-chart');
        return;
    }

    // 正規化基準プールの決定（出場0分や1試投のみの150%外れ値を防ぐため、デフォルトはフィルタ内選手）
    let refPool = APP_STATE.players.filter(p => p['出場時間_分'] >= APP_STATE.minMinutes);
    if (APP_STATE.radarNorm === 'league_max' || refPool.length === 0) {
        refPool = APP_STATE.players.filter(p => p['出場試合数'] > 0);
    }

    const maxValues = {
        pts: Math.max(...refPool.map(d => getStatVal(d, 'ポイント')), 1),
        efg: Math.max(...refPool.filter(d => (d['通算']?.FGA || 0) >= 5).map(d => getStatVal(d, 'eFG%')), 60),
        rel: Math.max(...refPool.map(d => d['堅実性'] || 1), 1),
        extra: Math.max(...refPool.map(d => getStatVal(d, '攻撃権創出')), 1),
        def: Math.max(...refPool.map(d => getStatVal(d, '守備的圧力')), 1),
        eff: Math.max(...refPool.map(d => getStatVal(d, 'EFF')), 1)
    };

    const radarLabels = [
        'スコアリング (PTS)',
        'シュート効率 (eFG%)',
        '堅実性 (貢献/TO)',
        '攻撃権創出 (OR+STL)',
        '守備的圧力 (DR+2×Stocks)',
        '総合貢献度 (EFF)'
    ];

    const radarTraces = selectedData.map((player, i) => {
        const pts = getStatVal(player, 'ポイント');
        const efg = getStatVal(player, 'eFG%');
        const rel = player['堅実性'];
        const extra = getStatVal(player, '攻撃権創出');
        const def = getStatVal(player, '守備的圧力');
        const eff = Math.max(getStatVal(player, 'EFF'), 0);

        const rVals = [
            Math.min((pts / maxValues.pts) * 100, 100),
            Math.min((efg / maxValues.efg) * 100, 100),
            Math.min((rel / maxValues.rel) * 100, 100),
            Math.min((extra / maxValues.extra) * 100, 100),
            Math.min((def / maxValues.def) * 100, 100),
            Math.min((eff / maxValues.eff) * 100, 100)
        ];

        return {
            type: 'scatterpolar',
            r: [...rVals, rVals[0]],
            theta: [...radarLabels, radarLabels[0]],
            fill: 'toself',
            name: player['選手名'],
            line: { color: PALETTE[i % PALETTE.length], width: 2 },
            customdata: [pts, efg, rel, extra, def, eff, pts],
            hovertemplate: '<b>%{fullData.name}</b><br>%{theta}<br>実数値: %{customdata:.2f} (スコア: %{r:.1f})<extra></extra>'
        };
    });

    const ruleBadgeText = APP_STATE.rule === 'nba' ? 'NBAルール (ヒーブ除外)' : 'Wリーグ公式ルール';
    Plotly.newPlot('radar-chart', radarTraces, {
        title: {
            text: `<b>ポジションレス・6軸レーダーチャート</b><br><span style="font-size:11px;color:#64748b;">[${ruleBadgeText}] 基準最大値=100として正規化</span>`,
            font: { size: 15 }
        },
        polar: {
            radialaxis: { visible: true, range: [0, 100], ticksuffix: '', gridcolor: '#e2e8f0' }
        },
        legend: { orientation: 'h', y: -0.15, x: 0.5, xanchor: 'center' },
        margin: { t: 65, l: 55, r: 55, b: 60 }
    }, { responsive: true, displayModeBar: false });

    // 棒グラフ
    const barTraces = selectedData.map((player, i) => ({
        x: ['得点 (PTS)', '総合貢献 (EFF)', '攻撃権創出<br>(OR+STL)', '守備的圧力<br>(DR+2×Stocks)', '堅実性<br>((P+R+A)/TO)'],
        y: [
            getStatVal(player, 'ポイント'),
            getStatVal(player, 'EFF'),
            getStatVal(player, '攻撃権創出'),
            getStatVal(player, '守備的圧力'),
            player['堅実性']
        ],
        name: player['選手名'],
        type: 'bar',
        marker: { color: PALETTE[i % PALETTE.length] },
        hovertemplate: '<b>%{fullData.name}</b><br>%{x}: %{y:.2f}<extra></extra>'
    }));

    const modeLabel = APP_STATE.statMode === 'total' ? 'シーズン通算' : (APP_STATE.statMode === 'per40' ? '40分換算' : '1試合平均');
    Plotly.newPlot('bar-chart', barTraces, {
        title: {
            text: `<b>主要・独自指標 ボリューム比較 (${modeLabel})</b>`,
            font: { size: 15 }
        },
        barmode: 'group',
        legend: { orientation: 'h', y: -0.18, x: 0.5, xanchor: 'center' },
        margin: { t: 55, l: 45, r: 20, b: 70 },
        yaxis: { gridcolor: '#f1f5f9' }
    }, { responsive: true, displayModeBar: false });
}

function renderScatterPlot() {
    const xKey = document.getElementById('scatter-x-select').value;
    const yKey = document.getElementById('scatter-y-select').value;
    const sizeKey = document.getElementById('scatter-size-select').value;

    const xLabel = document.getElementById('scatter-x-select').selectedOptions[0].text;
    const yLabel = document.getElementById('scatter-y-select').selectedOptions[0].text;
    const sizeLabel = document.getElementById('scatter-size-select').selectedOptions[0].text;

    const pool = APP_STATE.players.filter(p =>
        p['出場時間_分'] >= APP_STATE.minMinutes &&
        (APP_STATE.teamFilter === 'all' || p['チーム名'] === APP_STATE.teamFilter)
    );

    if (pool.length === 0) {
        Plotly.purge('scatter-chart');
        return;
    }

    const unselected = pool.filter(p => !APP_STATE.selectedPlayers.includes(p['選手名']));
    const selected = pool.filter(p => APP_STATE.selectedPlayers.includes(p['選手名']));

    const calcSize = (p) => {
        const v = Math.max(getStatVal(p, sizeKey), 1);
        return Math.max(Math.min(Math.sqrt(v) * 6.5, 36), 9);
    };

    const traceOthers = {
        x: unselected.map(p => getStatVal(p, xKey)),
        y: unselected.map(p => getStatVal(p, yKey)),
        text: unselected.map(p => `${p['選手名']} (${p['チーム名'].split(' ')[0]})`),
        customdata: unselected.map(p => [p['選手名'], getStatVal(p, sizeKey)]),
        mode: 'markers',
        name: 'その他の選手',
        marker: {
            size: unselected.map(calcSize),
            color: '#94a3b8',
            opacity: 0.55,
            line: { width: 1, color: '#475569' }
        },
        hovertemplate: '<b>%{text}</b><br>' + xLabel + ': %{x:.2f}<br>' + yLabel + ': %{y:.2f}<br>' + sizeLabel + ': %{customdata[1]:.2f}<extra></extra>'
    };

    const traceSelected = {
        x: selected.map(p => getStatVal(p, xKey)),
        y: selected.map(p => getStatVal(p, yKey)),
        text: selected.map(p => p['選手名']),
        customdata: selected.map(p => [p['チーム名'], getStatVal(p, sizeKey)]),
        mode: 'markers+text',
        textposition: 'top center',
        textfont: { size: 11, color: '#0f172a', weight: 'bold' },
        name: '比較選択中の選手',
        marker: {
            size: selected.map(p => calcSize(p) + 4),
            color: selected.map((_, i) => PALETTE[i % PALETTE.length]),
            opacity: 0.95,
            line: { width: 2, color: '#ffffff' }
        },
        hovertemplate: '<b>%{text} (%{customdata[0]})</b><br>' + xLabel + ': %{x:.2f}<br>' + yLabel + ': %{y:.2f}<br>' + sizeLabel + ': %{customdata[1]:.2f}<extra></extra>'
    };

    // リーグ平均ライン
    const avgX = pool.reduce((s, p) => s + getStatVal(p, xKey), 0) / pool.length;
    const avgY = pool.reduce((s, p) => s + getStatVal(p, yKey), 0) / pool.length;

    Plotly.newPlot('scatter-chart', [traceOthers, traceSelected], {
        title: {
            text: `<b>${xLabel} × ${yLabel}</b> (バブルサイズ: ${sizeLabel} / 破線: フィルタ内平均)`,
            font: { size: 15 }
        },
        xaxis: { title: xLabel, gridcolor: '#f1f5f9', zeroline: false },
        yaxis: { title: yLabel, gridcolor: '#f1f5f9', zeroline: false },
        shapes: [
            { type: 'line', x0: avgX, x1: avgX, y0: 0, y1: 1, yref: 'paper', line: { color: '#cbd5e1', width: 1.5, dash: 'dash' } },
            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: avgY, y1: avgY, line: { color: '#cbd5e1', width: 1.5, dash: 'dash' } }
        ],
        legend: { orientation: 'h', y: 1.1, x: 1, xanchor: 'right' },
        margin: { t: 55, l: 55, r: 30, b: 50 },
        hovermode: 'closest'
    }, { responsive: true, displayModeBar: false });
}

function renderLeagueRankingTable() {
    const tbody = document.querySelector('#league-ranking-table tbody');
    tbody.innerHTML = '';

    const sortKey = APP_STATE.rankingSortKey;
    const asc = APP_STATE.rankingSortAsc;

    const filtered = APP_STATE.players.filter(p => {
        const matchMin = p['出場時間_分'] >= APP_STATE.minMinutes;
        const matchTeam = APP_STATE.teamFilter === 'all' || p['チーム名'] === APP_STATE.teamFilter;
        const matchSearch = !APP_STATE.searchQuery ||
            p['選手名'].toLowerCase().includes(APP_STATE.searchQuery) ||
            p['チーム名'].toLowerCase().includes(APP_STATE.searchQuery);
        return matchMin && matchTeam && matchSearch;
    });

    filtered.sort((a, b) => {
        if (sortKey === '選手名' || sortKey === 'チーム名') {
            return asc ? a[sortKey].localeCompare(b[sortKey], 'ja') : b[sortKey].localeCompare(a[sortKey], 'ja');
        }
        const va = getStatVal(a, sortKey);
        const vb = getStatVal(b, sortKey);
        return asc ? va - vb : vb - va;
    });

    const digits = APP_STATE.statMode === 'total' ? 0 : 1;

    filtered.forEach((p, idx) => {
        const isSelected = APP_STATE.selectedPlayers.includes(p['選手名']);
        const tr = document.createElement('tr');
        if (isSelected) tr.style.backgroundColor = '#eff6ff';

        const cellClass = (k) => (sortKey === k ? ' class="highlight-col"' : '');

        tr.innerHTML = `
            <td style="text-align:center;">
                <input type="checkbox" class="rank-cb" value="${p['選手名']}" ${isSelected ? 'checked' : ''}>
            </td>
            <td style="text-align:center; font-weight:700; color:#64748b;">${idx + 1}</td>
            <td><a class="player-link" data-player="${p['選手名']}">#${p['背番号']} ${p['選手名']}</a></td>
            <td style="text-align:left;">${p['チーム名'].split(' ')[0]}</td>
            <td style="text-align:center;"${cellClass('出場試合数')}>${p['出場試合数']}</td>
            <td style="text-align:center;"${cellClass('先発試合数')}>${p['先発試合数']}</td>
            <td${cellClass('出場時間_分')}>${getStatVal(p, '出場時間_分').toFixed(1)}</td>
            <td${cellClass('ポイント')}><b>${getStatVal(p, 'ポイント').toFixed(digits)}</b></td>
            <td${cellClass('EFF')}>${getStatVal(p, 'EFF').toFixed(digits)}</td>
            <td${cellClass('eFG%')}>${getStatVal(p, 'eFG%').toFixed(1)}%</td>
            <td${cellClass('TS%')}>${getStatVal(p, 'TS%').toFixed(1)}%</td>
            <td${cellClass('2P%')}>${p['2P%'].toFixed(1)}%</td>
            <td${cellClass('3P%')}>${getStatVal(p, '3P%').toFixed(1)}%</td>
            <td${cellClass('FT%')}>${p['FT%'].toFixed(1)}%</td>
            <td${cellClass('トータルリバウンド数')}>${getStatVal(p, 'トータルリバウンド数').toFixed(digits)}</td>
            <td${cellClass('アシスト数')}>${getStatVal(p, 'アシスト数').toFixed(digits)}</td>
            <td${cellClass('スティール数')}>${getStatVal(p, 'スティール数').toFixed(digits)}</td>
            <td${cellClass('ブロック数')}>${getStatVal(p, 'ブロック数').toFixed(digits)}</td>
            <td${cellClass('ターンオーバー数')}>${getStatVal(p, 'ターンオーバー数').toFixed(digits)}</td>
            <td${cellClass('攻撃権創出')}>${getStatVal(p, '攻撃権創出').toFixed(digits)}</td>
            <td${cellClass('守備的圧力')}>${getStatVal(p, '守備的圧力').toFixed(digits)}</td>
            <td${cellClass('堅実性')}>${p['堅実性'].toFixed(2)}</td>
        `;

        tr.querySelector('.rank-cb').addEventListener('change', (e) => {
            const name = e.target.value;
            if (e.target.checked) {
                if (!APP_STATE.selectedPlayers.includes(name)) APP_STATE.selectedPlayers.push(name);
            } else {
                APP_STATE.selectedPlayers = APP_STATE.selectedPlayers.filter(n => n !== name);
            }
            renderPlayerCheckboxList();
            updateTab1();
        });

        tr.querySelector('.player-link').addEventListener('click', () => {
            jumpToPlayerDetail(p['選手名']);
        });

        tbody.appendChild(tr);
    });
}

// -------------------------------------------------------------------------
// 7. TAB 2: 選手個人 詳細分析ページ
// -------------------------------------------------------------------------
function renderTab2PlayerDetail() {
    const player = APP_STATE.players.find(p => p['選手名'] === APP_STATE.detailPlayerName);
    if (!player) return;

    renderPlayerProfileCard(player);
    renderPlayerDetailRadar(player);
    renderPlayerShotBreakdown(player);
    renderPlayerGameTrend(player);
    renderPlayerOpponentChart(player);
    renderPlayerGameLogTable(player);
}

function getLeagueRank(player, key) {
    const pool = APP_STATE.players.filter(p => p['出場時間_分'] >= 10);
    const actualKey = getRuleKey(key);
    const sorted = [...pool].sort((a, b) => (b[actualKey] || 0) - (a[actualKey] || 0));
    const idx = sorted.findIndex(p => p['選手名'] === player['選手名']);
    return idx >= 0 ? `リーグ ${idx + 1}位` : `参考記録`;
}

function renderPlayerProfileCard(player) {
    const container = document.getElementById('player-profile-card');
    const efgVal = player[getRuleKey('eFG%')];
    const p3Val = player[getRuleKey('3P%')];
    const tsVal = player[getRuleKey('TS%')];
    const heaves = player['通算']?.['ヒーブ除外数'] || 0;

    const heaveBanner = heaves > 0
        ? `<span class="heave-tag">⚡ NBAルール補正対象: ヒーブ除外 ${heaves}本 (3P%: ${player['3P%'].toFixed(1)}% → ${player['3P%_NBA'].toFixed(1)}% / eFG%: +${player['eFG%_diff'].toFixed(1)}%)</span>`
        : `<span class="wl-badge wl-w">ヒーブ試投なし (公式 = NBAルール)</span>`;

    container.innerHTML = `
        <div class="profile-top">
            <div class="profile-identity">
                <div class="jersey-circle">#${player['背番号']}</div>
                <div>
                    <h2 class="profile-name">${player['選手名']}</h2>
                    <div class="profile-team">${player['チーム名']} | 出場: ${player['出場試合数']}試合 (先発 ${player['先発試合数']}試合 / ベンチ入り ${player['ベンチ入り試合数']}試合)</div>
                </div>
            </div>
            <div class="profile-badges">
                ${heaveBanner}
            </div>
        </div>
        <div class="stat-pill-grid">
            <div class="stat-pill">
                <div class="s-label">平均得点 (PPG)</div>
                <div class="s-val">${player['ポイント'].toFixed(1)}</div>
                <div class="s-rank">${getLeagueRank(player, 'ポイント')} (通算 ${player['通算']['ポイント']}点)</div>
            </div>
            <div class="stat-pill">
                <div class="s-label">リバウンド (RPG)</div>
                <div class="s-val">${player['トータルリバウンド数'].toFixed(1)}</div>
                <div class="s-rank">${getLeagueRank(player, 'トータルリバウンド数')} (OR ${player['オフェンスリバウンド数'].toFixed(1)} / DR ${player['ディフェンスリバウンド数'].toFixed(1)})</div>
            </div>
            <div class="stat-pill">
                <div class="s-label">アシスト (APG)</div>
                <div class="s-val">${player['アシスト数'].toFixed(1)}</div>
                <div class="s-rank">${getLeagueRank(player, 'アシスト数')} (AST/TO ${player['AST_TO'].toFixed(2)})</div>
            </div>
            <div class="stat-pill">
                <div class="s-label">出場時間 (MPG)</div>
                <div class="s-val">${player['出場時間_分'].toFixed(1)}<small>分</small></div>
                <div class="s-rank">${getLeagueRank(player, '出場時間_分')} (40分換算 ${player['PTS_per40'].toFixed(1)}点)</div>
            </div>
            <div class="stat-pill">
                <div class="s-label">有効FG率 (eFG%)</div>
                <div class="s-val">${efgVal.toFixed(1)}%</div>
                <div class="s-rank">${getLeagueRank(player, 'eFG%')} (TS% ${tsVal.toFixed(1)}%)</div>
            </div>
            <div class="stat-pill">
                <div class="s-label">3P成功率</div>
                <div class="s-val">${p3Val.toFixed(1)}%</div>
                <div class="s-rank">2P% ${player['2P%'].toFixed(1)}% / FT% ${player['FT%'].toFixed(1)}%</div>
            </div>
            <div class="stat-pill">
                <div class="s-label">守備的圧力 / 攻撃権創出</div>
                <div class="s-val">${player['守備的圧力'].toFixed(1)} / ${player['攻撃権創出'].toFixed(1)}</div>
                <div class="s-rank">${getLeagueRank(player, '守備的圧力')}</div>
            </div>
            <div class="stat-pill">
                <div class="s-label">総合貢献度 (EFF)</div>
                <div class="s-val">${player['EFF'].toFixed(1)}</div>
                <div class="s-rank">${getLeagueRank(player, 'EFF')} (堅実性 ${player['堅実性'].toFixed(2)})</div>
            </div>
        </div>
    `;
}

function renderPlayerDetailRadar(player) {
    const pool = APP_STATE.players.filter(p => p['出場時間_分'] >= 10);
    const efgKey = getRuleKey('eFG%');
    const maxV = {
        pts: Math.max(...pool.map(d => d['ポイント']), 1),
        efg: Math.max(...pool.filter(d => (d['通算']?.FGA || 0) >= 5).map(d => d[efgKey]), 60),
        rel: Math.max(...pool.map(d => d['堅実性']), 1),
        extra: Math.max(...pool.map(d => d['攻撃権創出']), 1),
        def: Math.max(...pool.map(d => d['守備的圧力']), 1),
        eff: Math.max(...pool.map(d => d['EFF']), 1)
    };

    const avgStat = (arr, k) => arr.reduce((s, d) => s + (d[k] || 0), 0) / Math.max(arr.length, 1);
    const lgPts = avgStat(pool, 'ポイント');
    const lgEfg = avgStat(pool, efgKey);
    const lgRel = avgStat(pool, '堅実性');
    const lgExtra = avgStat(pool, '攻撃権創出');
    const lgDef = avgStat(pool, '守備的圧力');
    const lgEff = avgStat(pool, 'EFF');

    const labels = ['スコアリング (PTS)', 'シュート効率 (eFG%)', '堅実性', '攻撃権創出', '守備的圧力', '貢献度 (EFF)'];
    const pNorm = [
        Math.min((player['ポイント'] / maxV.pts) * 100, 100),
        Math.min((player[efgKey] / maxV.efg) * 100, 100),
        Math.min((player['堅実性'] / maxV.rel) * 100, 100),
        Math.min((player['攻撃権創出'] / maxV.extra) * 100, 100),
        Math.min((player['守備的圧力'] / maxV.def) * 100, 100),
        Math.min((Math.max(player['EFF'], 0) / maxV.eff) * 100, 100)
    ];
    const lgNorm = [
        (lgPts / maxV.pts) * 100,
        (lgEfg / maxV.efg) * 100,
        (lgRel / maxV.rel) * 100,
        (lgExtra / maxV.extra) * 100,
        (lgDef / maxV.def) * 100,
        (Math.max(lgEff, 0) / maxV.eff) * 100
    ];

    Plotly.newPlot('player-detail-radar', [
        {
            type: 'scatterpolar',
            r: [...lgNorm, lgNorm[0]],
            theta: [...labels, labels[0]],
            fill: 'toself',
            name: 'リーグ平均 (10分以上)',
            line: { color: '#94a3b8', dash: 'dot' },
            fillcolor: 'rgba(148, 163, 184, 0.18)'
        },
        {
            type: 'scatterpolar',
            r: [...pNorm, pNorm[0]],
            theta: [...labels, labels[0]],
            fill: 'toself',
            name: player['選手名'],
            line: { color: '#2563eb', width: 2.5 },
            fillcolor: 'rgba(37, 99, 235, 0.25)'
        }
    ], {
        title: { text: `<b>個人スキルプロファイル (対リーグ平均比較)</b>`, font: { size: 15 } },
        polar: { radialaxis: { visible: true, range: [0, 100] } },
        legend: { orientation: 'h', y: -0.15, x: 0.5, xanchor: 'center' },
        margin: { t: 55, l: 55, r: 55, b: 55 }
    }, { responsive: true, displayModeBar: false });
}

function renderPlayerShotBreakdown(player) {
    const t = player['通算'];
    const p2Pts = t['2P_成功'] * 2;
    const p3Pts = t['3P_成功'] * 3;
    const ftPts = t['FT_成功'] * 1;
    const p3Att = APP_STATE.rule === 'nba' ? t['3P_NBA_試投'] : t['3P_試投'];
    const p3Pct = APP_STATE.rule === 'nba' ? player['3P%_NBA'] : player['3P%'];

    const traceMade = {
        x: ['2ポイント', '3ポイント', 'フリースロー'],
        y: [t['2P_成功'], t['3P_成功'], t['FT_成功']],
        name: '成功数 (Made)',
        type: 'bar',
        marker: { color: '#2563eb' },
        text: [
            `${t['2P_成功']}成功 (${player['2P%'].toFixed(1)}%)<br>計${p2Pts}点`,
            `${t['3P_成功']}成功 (${p3Pct.toFixed(1)}%)<br>計${p3Pts}点`,
            `${t['FT_成功']}成功 (${player['FT%'].toFixed(1)}%)<br>計${ftPts}点`
        ],
        textposition: 'auto'
    };

    const traceMiss = {
        x: ['2ポイント', '3ポイント', 'フリースロー'],
        y: [t['2P_試投'] - t['2P_成功'], p3Att - t['3P_成功'], t['FT_試投'] - t['FT_成功']],
        name: '失敗数 (Missed)',
        type: 'bar',
        marker: { color: '#cbd5e1' }
    };

    Plotly.newPlot('player-shot-breakdown', [traceMade, traceMiss], {
        title: {
            text: `<b>シーズン通算 シュート試投・成功内訳 (総得点: ${t['ポイント']}点)</b><br><span style="font-size:11px;color:#64748b;">2P得点: ${p2Pts}点 / 3P得点: ${p3Pts}点 / FT得点: ${ftPts}点</span>`,
            font: { size: 15 }
        },
        barmode: 'stack',
        yaxis: { title: '試投本数 (Attempts)', gridcolor: '#f1f5f9' },
        legend: { orientation: 'h', y: -0.15, x: 0.5, xanchor: 'center' },
        margin: { t: 65, l: 50, r: 25, b: 55 }
    }, { responsive: true, displayModeBar: false });
}

function renderPlayerGameTrend(player) {
    const mode = document.getElementById('player-trend-metric').value;
    const logs = player['試合ログ'].filter(g => g['出場フラグ']);

    if (logs.length === 0) {
        Plotly.purge('player-game-trend-chart');
        return;
    }

    const xLabels = logs.map(g => `${g['試合日'].slice(5)}<br>vs ${g['対戦相手'].split(' ')[0]}(${g['勝敗']})`);
    let traces = [];
    let yTitle = '';

    if (mode === 'main') {
        yTitle = 'スタッツ値';
        traces = [
            { x: xLabels, y: logs.map(g => g['ポイント']), name: '得点 (PTS)', type: 'bar', marker: { color: '#3b82f6' } },
            { x: xLabels, y: logs.map(g => g['トータルリバウンド数']), name: 'リバウンド (TR)', type: 'scatter', mode: 'lines+markers', line: { color: '#059669', width: 2.5 } },
            { x: xLabels, y: logs.map(g => g['アシスト数']), name: 'アシスト (AST)', type: 'scatter', mode: 'lines+markers', line: { color: '#d97706', width: 2.5 } }
        ];
    } else if (mode === 'shooting') {
        yTitle = '成功率 (%)';
        traces = [
            { x: xLabels, y: logs.map(g => g['eFG%']), name: '公式 eFG%', type: 'scatter', mode: 'lines+markers', line: { color: '#64748b', dash: 'dot', width: 2 } },
            { x: xLabels, y: logs.map(g => g['eFG%_NBA']), name: 'NBAルール eFG%', type: 'scatter', mode: 'lines+markers', line: { color: '#e11d48', width: 2.5 } },
            { x: xLabels, y: logs.map(g => g['TS%_NBA']), name: 'TS% (NBA)', type: 'scatter', mode: 'lines+markers', line: { color: '#2563eb', width: 2 } }
        ];
    } else {
        yTitle = '指数スコア';
        traces = [
            { x: xLabels, y: logs.map(g => g['EFF']), name: '貢献度 (EFF)', type: 'bar', marker: { color: '#7c3aed' } },
            { x: xLabels, y: logs.map(g => g['守備的圧力']), name: '守備的圧力', type: 'scatter', mode: 'lines+markers', line: { color: '#0891b2', width: 2.5 } },
            { x: xLabels, y: logs.map(g => g['攻撃権創出']), name: '攻撃権創出', type: 'scatter', mode: 'lines+markers', line: { color: '#16a34a', width: 2.5 } }
        ];
    }

    Plotly.newPlot('player-game-trend-chart', traces, {
        title: { text: `<b>試合別 パフォーマンス推移 (${logs.length}試合)</b>`, font: { size: 15 } },
        yaxis: { title: yTitle, gridcolor: '#f1f5f9' },
        legend: { orientation: 'h', y: -0.22, x: 0.5, xanchor: 'center' },
        margin: { t: 45, l: 50, r: 20, b: 75 }
    }, { responsive: true, displayModeBar: false });
}

function renderPlayerOpponentChart(player) {
    const logs = player['試合ログ'].filter(g => g['出場フラグ']);
    const oppMap = {};
    logs.forEach(g => {
        const opp = g['対戦相手'].split(' ')[0];
        if (!oppMap[opp]) oppMap[opp] = { count: 0, pts: 0, reb: 0, ast: 0, eff: 0 };
        oppMap[opp].count += 1;
        oppMap[opp].pts += g['ポイント'];
        oppMap[opp].reb += g['トータルリバウンド数'];
        oppMap[opp].ast += g['アシスト数'];
        oppMap[opp].eff += g['EFF'];
    });

    const opps = Object.keys(oppMap);
    const traces = [
        {
            x: opps,
            y: opps.map(o => oppMap[o].pts / oppMap[o].count),
            name: '平均得点 (PPG)',
            type: 'bar',
            marker: { color: '#2563eb' }
        },
        {
            x: opps,
            y: opps.map(o => oppMap[o].eff / oppMap[o].count),
            name: '平均貢献度 (EFF)',
            type: 'bar',
            marker: { color: '#059669' }
        },
        {
            x: opps,
            y: opps.map(o => oppMap[o].reb / oppMap[o].count),
            name: '平均リバウンド (RPG)',
            type: 'bar',
            marker: { color: '#f59e0b' }
        }
    ];

    Plotly.newPlot('player-opponent-chart', traces, {
        title: { text: `<b>対戦相手別 平均スタッツ比較</b>`, font: { size: 15 } },
        barmode: 'group',
        yaxis: { gridcolor: '#f1f5f9' },
        legend: { orientation: 'h', y: -0.2, x: 0.5, xanchor: 'center' },
        margin: { t: 55, l: 45, r: 20, b: 65 }
    }, { responsive: true, displayModeBar: false });
}

function renderPlayerGameLogTable(player) {
    const tbody = document.querySelector('#player-gamelog-table tbody');
    tbody.innerHTML = '';

    player['試合ログ'].forEach(g => {
        const tr = document.createElement('tr');
        if (!g['出場フラグ']) {
            tr.style.opacity = '0.5';
        }
        const wlClass = g['勝敗'] === 'W' ? 'wl-w' : 'wl-l';
        const heaveMark = g['ヒーブ除外数'] > 0
            ? `<span class="heave-tag">⚡${g['3ポイント_NBA']} (-${g['ヒーブ除外数']})</span>`
            : g['3ポイント_NBA'];
        const efgVal = APP_STATE.rule === 'nba' ? g['eFG%_NBA'] : g['eFG%'];
        const tsVal = APP_STATE.rule === 'nba' ? g['TS%_NBA'] : g['TS%'];

        tr.innerHTML = `
            <td>${g['試合日']}</td>
            <td style="text-align:left;">${g['対戦相手']}</td>
            <td style="text-align:center;"><span class="wl-badge ${wlClass}">${g['勝敗']} ${g['スコア']}</span></td>
            <td style="text-align:center;">${g['先発'] ? '★先発' : (g['出場フラグ'] ? 'ベンチ' : 'DNP')}</td>
            <td>${g['出場時間']}</td>
            <td style="font-weight:800;">${g['ポイント']}</td>
            <td>${g['2ポイント']} (${g['2P%'].toFixed(0)}%)</td>
            <td>${g['3ポイント']} (${g['3P%'].toFixed(0)}%)</td>
            <td>${heaveMark}</td>
            <td>${g['フリースロー']}</td>
            <td class="highlight-col">${efgVal.toFixed(1)}%</td>
            <td>${tsVal.toFixed(1)}%</td>
            <td>${g['オフェンスリバウンド数']}</td>
            <td>${g['ディフェンスリバウンド数']}</td>
            <td style="font-weight:700;">${g['トータルリバウンド数']}</td>
            <td style="font-weight:700;">${g['アシスト数']}</td>
            <td>${g['スティール数']}</td>
            <td>${g['ブロック数']}</td>
            <td>${g['ターンオーバー数']}</td>
            <td>${g['ファウル数']}</td>
            <td style="font-weight:700;">${g['EFF']}</td>
        `;
        tbody.appendChild(tr);
    });
}

// -------------------------------------------------------------------------
// 8. TAB 3: チーム別・リーグ全体の傾向分析
// -------------------------------------------------------------------------
function renderTab3TeamTrends() {
    renderTeamStatsTable();
    renderTeamOffDefChart();
    renderTeamHeatmapChart();
    renderTeamPlayerShareChart();
    renderTeamGameTrendChart();
}

function renderTeamStatsTable() {
    const tbody = document.querySelector('#team-stats-table tbody');
    tbody.innerHTML = '';

    const sortedTeams = [...APP_STATE.teams].sort((a, b) => {
        if (b['勝率'] !== a['勝率']) return b['勝率'] - a['勝率'];
        return b['得失点差'] - a['得失点差'];
    });

    sortedTeams.forEach((t, i) => {
        const tr = document.createElement('tr');
        const diffSign = t['得失点差'] > 0 ? `+${t['得失点差'].toFixed(1)}` : t['得失点差'].toFixed(1);
        const diffClass = t['得失点差'] >= 0 ? 'diff-pos' : 'diff-neg';
        const efgVal = APP_STATE.rule === 'nba' ? t['eFG%_NBA'] : t['eFG%'];
        const tsVal = APP_STATE.rule === 'nba' ? t['TS%_NBA'] : t['TS%'];

        tr.innerHTML = `
            <td style="text-align:center; font-weight:800;">${i + 1}</td>
            <td style="text-align:left; font-weight:700;">${t['チーム名']}</td>
            <td style="text-align:center;">${t['試合数']}</td>
            <td style="text-align:center; font-weight:700;">${t['勝利']}勝 ${t['敗戦']}敗</td>
            <td>${t['勝率'].toFixed(1)}%</td>
            <td style="font-weight:700;">${t['得点'].toFixed(1)}</td>
            <td>${t['失点'].toFixed(1)}</td>
            <td class="${diffClass}">${diffSign}</td>
            <td>${t['2P%'].toFixed(1)}%</td>
            <td>${t['3P%'].toFixed(1)}%</td>
            <td class="highlight-col">${t['3P%_NBA'].toFixed(1)}% <small>(+${t['3P%_diff'].toFixed(2)}%)</small></td>
            <td>${t['FT%'].toFixed(1)}%</td>
            <td>${efgVal.toFixed(1)}%</td>
            <td>${tsVal.toFixed(1)}%</td>
            <td>${t['オフェンスリバウンド数'].toFixed(1)}</td>
            <td>${t['ディフェンスリバウンド数'].toFixed(1)}</td>
            <td>${t['トータルリバウンド数'].toFixed(1)}</td>
            <td>${t['アシスト数'].toFixed(1)}</td>
            <td>${t['スティール数'].toFixed(1)}</td>
            <td>${t['ブロック数'].toFixed(1)}</td>
            <td>${t['ターンオーバー数'].toFixed(1)}</td>
            <td>${t['攻撃権創出'].toFixed(1)}</td>
            <td>${t['守備的圧力'].toFixed(1)}</td>
            <td>${t['堅実性'].toFixed(2)}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderTeamOffDefChart() {
    const teams = APP_STATE.teams;
    if (teams.length === 0) return;

    const avgOff = teams.reduce((s, t) => s + t['得点'], 0) / teams.length;
    const avgDef = teams.reduce((s, t) => s + t['失点'], 0) / teams.length;

    const trace = {
        x: teams.map(t => t['得点']),
        y: teams.map(t => t['失点']),
        text: teams.map(t => `${t['チーム名'].split(' ')[0]}<br>(${t['勝利']}勝${t['敗戦']}敗)`),
        mode: 'markers+text',
        textposition: 'top center',
        marker: {
            size: teams.map(t => 14 + t['勝利'] * 3.5),
            color: teams.map(t => TEAM_COLORS[t['チーム名']] || '#2563eb'),
            line: { width: 2, color: '#fff' }
        },
        hovertemplate: '<b>%{text}</b><br>平均得点: %{x:.1f}点<br>平均失点: %{y:.1f}点<extra></extra>'
    };

    Plotly.newPlot('team-off-def-chart', [trace], {
        title: {
            text: `<b>チーム攻守マトリクス (平均得点 × 平均失点)</b><br><span style="font-size:11px;color:#64748b;">※Y軸は上が少失点（高守備力）、右上が攻守ともに優れたチーム</span>`,
            font: { size: 15 }
        },
        xaxis: { title: '平均得点 (PPG) → 高いほど攻撃力◎', gridcolor: '#f1f5f9' },
        yaxis: { title: '平均失点 (OPP PPG) → 上に行くほど守備力◎', autorange: 'reversed', gridcolor: '#f1f5f9' },
        shapes: [
            { type: 'line', x0: avgOff, x1: avgOff, y0: 0, y1: 1, yref: 'paper', line: { color: '#94a3b8', dash: 'dash' } },
            { type: 'line', x0: 0, x1: 1, xref: 'paper', y0: avgDef, y1: avgDef, line: { color: '#94a3b8', dash: 'dash' } }
        ],
        margin: { t: 65, l: 60, r: 30, b: 50 }
    }, { responsive: true, displayModeBar: false });
}

function renderTeamHeatmapChart() {
    const teams = APP_STATE.teams;
    if (teams.length === 0) return;

    const metrics = [
        { key: '得点', label: '得点', invert: false },
        { key: '失点', label: '少失点(守備)', invert: true },
        { key: getRuleKey('eFG%'), label: 'eFG%', invert: false },
        { key: getRuleKey('3P%'), label: '3P%', invert: false },
        { key: '2P%', label: '2P%', invert: false },
        { key: 'トータルリバウンド数', label: 'リバウンド', invert: false },
        { key: 'アシスト数', label: 'アシスト', invert: false },
        { key: '攻撃権創出', label: '攻撃権創出', invert: false },
        { key: '守備的圧力', label: '守備的圧力', invert: false },
        { key: '堅実性', label: '堅実性', invert: false }
    ];

    const yLabels = teams.map(t => t['チーム名'].split(' ')[0]);
    const xLabels = metrics.map(m => m.label);

    // Zスコア計算
    const zMatrix = teams.map(() => []);
    const textMatrix = teams.map(() => []);

    metrics.forEach((m) => {
        const vals = teams.map(t => Number(t[m.key] || 0));
        const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
        const std = Math.sqrt(vals.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / vals.length) || 1;

        teams.forEach((t, tIdx) => {
            const raw = Number(t[m.key] || 0);
            let z = (raw - mean) / std;
            if (m.invert) z = -z;
            zMatrix[tIdx].push(Number(z.toFixed(2)));
            textMatrix[tIdx].push(raw.toFixed(1));
        });
    });

    Plotly.newPlot('team-heatmap-chart', [{
        z: zMatrix,
        x: xLabels,
        y: yLabels,
        text: textMatrix,
        texttemplate: '%{text}',
        type: 'heatmap',
        colorscale: 'RdBu',
        reversescale: true,
        zmid: 0,
        colorbar: { title: '偏差(Z)' },
        hovertemplate: '<b>%{y}</b> - %{x}<br>実数値: %{text} (Zスコア: %{z})<extra></extra>'
    }], {
        title: {
            text: `<b>チーム特性ヒートマップ (リーグ内相対評価 Zスコア)</b><br><span style="font-size:11px;color:#64748b;">赤色が濃いほどリーグ平均より優れている項目、青色は課題項目</span>`,
            font: { size: 15 }
        },
        margin: { t: 65, l: 100, r: 20, b: 60 }
    }, { responsive: true, displayModeBar: false });
}

function renderTeamPlayerShareChart() {
    const metricKey = document.getElementById('team-share-metric').value;
    const metricLabel = document.getElementById('team-share-metric').selectedOptions[0].text;
    const teams = APP_STATE.teams.map(t => t['チーム名']);

    // 各チームの上位5名＋「その他」に分類してスタックバーを作成
    const ranks = [0, 1, 2, 3, 4];
    const traces = ranks.map(rIdx => {
        const yVals = [];
        const texts = [];
        teams.forEach(teamName => {
            const tPlayers = APP_STATE.players
                .filter(p => p['チーム名'] === teamName)
                .sort((a, b) => (b['通算'][metricKey] || 0) - (a['通算'][metricKey] || 0));
            const p = tPlayers[rIdx];
            if (p) {
                yVals.push(p['通算'][metricKey] || 0);
                texts.push(`${p['選手名']} (${Math.round(p['通算'][metricKey] || 0)})`);
            } else {
                yVals.push(0);
                texts.push('');
            }
        });
        return {
            x: teams.map(t => t.split(' ')[0]),
            y: yVals,
            text: texts,
            textposition: 'inside',
            name: `チーム内 ${rIdx + 1}位`,
            type: 'bar',
            marker: { color: PALETTE[rIdx] },
            hovertemplate: '<b>%{x}</b><br>%{text}<extra></extra>'
        };
    });

    // 6位以下合計
    const otherY = [];
    teams.forEach(teamName => {
        const tPlayers = APP_STATE.players
            .filter(p => p['チーム名'] === teamName)
            .sort((a, b) => (b['通算'][metricKey] || 0) - (a['通算'][metricKey] || 0));
        const restSum = tPlayers.slice(5).reduce((s, p) => s + (p['通算'][metricKey] || 0), 0);
        otherY.push(Math.round(restSum));
    });
    traces.push({
        x: teams.map(t => t.split(' ')[0]),
        y: otherY,
        name: '6位以下合計 (ベンチ層)',
        type: 'bar',
        marker: { color: '#cbd5e1' }
    });

    Plotly.newPlot('team-player-share-chart', traces, {
        title: { text: `<b>チーム別 主力選手シェア比較: ${metricLabel}</b>`, font: { size: 15 } },
        barmode: 'stack',
        yaxis: { title: 'シーズン通算値', gridcolor: '#f1f5f9' },
        legend: { orientation: 'h', y: -0.2, x: 0.5, xanchor: 'center' },
        margin: { t: 50, l: 55, r: 20, b: 65 }
    }, { responsive: true, displayModeBar: false });
}

function renderTeamGameTrendChart() {
    const teamName = document.getElementById('team-game-log-select').value;
    const teamObj = APP_STATE.teams.find(t => t['チーム名'] === teamName);
    if (!teamObj) return;

    const logs = teamObj['試合ログ'];
    const xLabels = logs.map(g => `${g['試合日'].slice(5)}<br>vs ${g['対戦相手'].split(' ')[0]}(${g['勝敗']})`);

    const traces = [
        {
            x: xLabels,
            y: logs.map(g => g['得点']),
            name: '自チーム得点',
            type: 'bar',
            marker: { color: '#2563eb' }
        },
        {
            x: xLabels,
            y: logs.map(g => g['失点']),
            name: '相手得点(失点)',
            type: 'bar',
            marker: { color: '#cbd5e1' }
        },
        {
            x: xLabels,
            y: logs.map(g => APP_STATE.rule === 'nba' ? g['eFG%_NBA'] : g['eFG%']),
            name: 'チーム eFG%',
            yaxis: 'y2',
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#e11d48', width: 2.5 }
        }
    ];

    Plotly.newPlot('team-game-trend-chart', traces, {
        title: { text: `<b>${teamName.split(' ')[0]} 試合別スコア＆シュート効率推移</b>`, font: { size: 15 } },
        barmode: 'group',
        yaxis: { title: '得点', gridcolor: '#f1f5f9' },
        yaxis2: { title: 'eFG% (%)', overlaying: 'y', side: 'right', range: [20, 80], showgrid: false },
        legend: { orientation: 'h', y: -0.22, x: 0.5, xanchor: 'center' },
        margin: { t: 50, l: 50, r: 50, b: 75 }
    }, { responsive: true, displayModeBar: false });
}

// -------------------------------------------------------------------------
// 9. TAB 4: NBAルール（ヒーブ除外）特化分析
// -------------------------------------------------------------------------
function renderNbaTab() {
    const heavePlayers = APP_STATE.players
        .filter(p => (p['通算']?.['ヒーブ除外数'] || 0) > 0)
        .sort((a, b) => b['3P%_diff'] - a['3P%_diff']);

    const totalHeaves = heavePlayers.reduce((s, p) => s + p['通算']['ヒーブ除外数'], 0);
    const avg3PBoost = heavePlayers.length > 0
        ? (heavePlayers.reduce((s, p) => s + p['3P%_diff'], 0) / heavePlayers.length).toFixed(2)
        : '0.00';
    const maxBoostPlayer = heavePlayers[0];

    // サマリーKPI
    const kpiBox = document.getElementById('nba-summary-stats');
    kpiBox.innerHTML = `
        <div class="nba-mini-box">
            <div class="nm-label">ヒーブ除外 発生件数</div>
            <div class="nm-val">${APP_STATE.heaveEvents.length}試合 / 計${totalHeaves}本</div>
        </div>
        <div class="nba-mini-box">
            <div class="nm-label">対象選手数</div>
            <div class="nm-val">${heavePlayers.length}名</div>
        </div>
        <div class="nba-mini-box">
            <div class="nm-label">対象選手の平均3P%改善幅</div>
            <div class="nm-val">+${avg3PBoost}%</div>
        </div>
        <div class="nba-mini-box">
            <div class="nm-label">最大3P%上昇選手</div>
            <div class="nm-val">${maxBoostPlayer ? `${maxBoostPlayer['選手名']} (+${maxBoostPlayer['3P%_diff'].toFixed(1)}%)` : '-'}</div>
        </div>
    `;

    // 1. 選手別 Before/After チャート
    const metric = document.getElementById('nba-impact-metric').value;
    const nbaKey = `${metric}_NBA`;
    const diffKey = `${metric}_diff`;

    const sortedForChart = [...heavePlayers].sort((a, b) => b[diffKey] - a[diffKey]);
    const names = sortedForChart.map(p => p['選手名']);

    Plotly.newPlot('nba-player-impact-chart', [
        {
            x: names,
            y: sortedForChart.map(p => p[metric]),
            name: `Wリーグ公式 (${metric})`,
            type: 'bar',
            marker: { color: '#94a3b8' }
        },
        {
            x: names,
            y: sortedForChart.map(p => p[nbaKey]),
            name: `NBAルール適用 (${metric})`,
            type: 'bar',
            marker: { color: '#e11d48' },
            text: sortedForChart.map(p => `+${p[diffKey].toFixed(1)}%`),
            textposition: 'outside'
        }
    ], {
        title: { text: `<b>ヒーブ試投選手の ${metric} 変化 (公式 vs NBAルール)</b>`, font: { size: 15 } },
        barmode: 'group',
        yaxis: { title: `${metric} (%)`, gridcolor: '#f1f5f9' },
        legend: { orientation: 'h', y: -0.25, x: 0.5, xanchor: 'center' },
        margin: { t: 55, l: 50, r: 20, b: 85 }
    }, { responsive: true, displayModeBar: false });

    // 2. チーム別 ヒーブ本数 & 3P%上昇幅チャート
    const sortedTeams = [...APP_STATE.teams].sort((a, b) => b['ヒーブ除外数_合計'] - a['ヒーブ除外数_合計']);
    Plotly.newPlot('nba-team-impact-chart', [
        {
            x: sortedTeams.map(t => t['チーム名'].split(' ')[0]),
            y: sortedTeams.map(t => t['ヒーブ除外数_合計']),
            name: 'ヒーブ除外本数 (計)',
            type: 'bar',
            marker: { color: '#f59e0b' }
        },
        {
            x: sortedTeams.map(t => t['チーム名'].split(' ')[0]),
            y: sortedTeams.map(t => t['3P%_diff']),
            name: 'チーム3P% 上昇幅 (%)',
            yaxis: 'y2',
            type: 'scatter',
            mode: 'lines+markers',
            line: { color: '#2563eb', width: 2.5 }
        }
    ], {
        title: { text: `<b>チーム別 ヒーブ試投数とチーム3P%への影響</b>`, font: { size: 15 } },
        yaxis: { title: 'ヒーブ除外本数 (本)', gridcolor: '#f1f5f9' },
        yaxis2: { title: '3P% 上昇幅 (+%)', overlaying: 'y', side: 'right', showgrid: false },
        legend: { orientation: 'h', y: -0.25, x: 0.5, xanchor: 'center' },
        margin: { t: 55, l: 50, r: 50, b: 85 }
    }, { responsive: true, displayModeBar: false });

    // 3. 選手別 シーズン通算ヒーブ比較テーブル
    const summaryTbody = document.querySelector('#nba-player-summary-table tbody');
    summaryTbody.innerHTML = '';
    heavePlayers.forEach(p => {
        const t = p['通算'];
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><a class="player-link" data-player="${p['選手名']}">#${p['背番号']} ${p['選手名']}</a></td>
            <td style="text-align:left;">${p['チーム名']}</td>
            <td style="text-align:center;">${p['出場試合数']}</td>
            <td style="text-align:center;"><span class="heave-tag">-${t['ヒーブ除外数']}本</span></td>
            <td style="text-align:center;">${t['3P_成功']}-${t['3P_試投']}</td>
            <td style="text-align:center; font-weight:700;">${t['3P_NBA_成功']}-${t['3P_NBA_試投']}</td>
            <td>${p['3P%'].toFixed(1)}%</td>
            <td style="font-weight:700;">${p['3P%_NBA'].toFixed(1)}%</td>
            <td class="diff-pos">+${p['3P%_diff'].toFixed(2)}%</td>
            <td>${p['eFG%'].toFixed(1)}%</td>
            <td style="font-weight:700;">${p['eFG%_NBA'].toFixed(1)}%</td>
            <td class="diff-pos">+${p['eFG%_diff'].toFixed(2)}%</td>
            <td class="diff-pos">+${p['TS%_diff'].toFixed(2)}%</td>
        `;
        tr.querySelector('.player-link').addEventListener('click', () => jumpToPlayerDetail(p['選手名']));
        summaryTbody.appendChild(tr);
    });

    // 4. 全19件のヒーブ発生試合レコードテーブル
    const eventsTbody = document.querySelector('#nba-heave-events-table tbody');
    eventsTbody.innerHTML = '';
    APP_STATE.heaveEvents.forEach(ev => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${ev['試合日']}</td>
            <td style="text-align:left;">${ev['チーム名']}</td>
            <td style="text-align:left;">${ev['対戦相手']}</td>
            <td style="text-align:center;">#${ev['背番号']}</td>
            <td style="text-align:left;"><a class="player-link" data-player="${ev['選手名']}">${ev['選手名']}</a></td>
            <td>${ev['出場時間']}</td>
            <td>${ev['ポイント']}</td>
            <td style="text-align:center;">${ev['3ポイント_通常']}</td>
            <td style="text-align:center; font-weight:700;">${ev['3ポイント_NBA']}</td>
            <td style="text-align:center;"><span class="heave-tag">-${ev['ヒーブ除外数']}本</span></td>
            <td>${ev['3P%_通常'].toFixed(1)}% → <b class="diff-pos">${ev['3P%_NBA'].toFixed(1)}%</b></td>
            <td>${ev['eFG%_通常'].toFixed(1)}% → <b class="diff-pos">${ev['eFG%_NBA'].toFixed(1)}%</b></td>
        `;
        tr.querySelector('.player-link').addEventListener('click', () => jumpToPlayerDetail(ev['選手名']));
        eventsTbody.appendChild(tr);
    });
}

// -------------------------------------------------------------------------
// 10. ブラウザ上でのCSV直接読込・再集計機能 (Python不要で任意のCSVを即分析)
// -------------------------------------------------------------------------
function handleCsvUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const text = e.target.result;
            const bundle = parseAndAggregateCsvInBrowser(text, file.name);
            hydrateBundle(bundle, file.name);
        } catch (err) {
            console.error(err);
            alert('CSVの解析中にエラーが発生しました: ' + err.message);
        }
    };
    reader.readAsText(file, 'utf-8');
}

function parseAndAggregateCsvInBrowser(csvText, fileName) {
    const lines = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) throw new Error('CSVデータが空です');

    const headers = lines[0].split(',').map(h => h.trim());
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        if (cols.length < headers.length) continue;
        const obj = {};
        headers.forEach((h, idx) => { obj[h] = (cols[idx] || '').trim(); });
        if (!obj['選手名'] || obj['選手名'] === '0' || obj['選手名'].includes('例:')) continue;
        rows.push(obj);
    }

    const parseMin = (s) => {
        if (!s || !s.includes(':')) return 0;
        const [m, sec] = s.split(':').map(Number);
        return (m || 0) + (sec || 0) / 60.0;
    };
    const parseMA = (s) => {
        if (!s || !s.includes('-')) return [0, 0];
        const [m, a] = s.split('-').map(Number);
        return [m || 0, a || 0];
    };
    const pct = (m, a) => a > 0 ? Number(((m / a) * 100).toFixed(2)) : 0;
    const efg = (fgm, fg3m, fga) => fga > 0 ? Number((((fgm + 0.5 * fg3m) / fga) * 100).toFixed(2)) : 0;
    const ts = (pts, fga, fta) => (fga + 0.44 * fta) > 0 ? Number(((pts / (2 * (fga + 0.44 * fta))) * 100).toFixed(2)) : 0;

    // チーム試合得点マップ
    const gameTeamPts = {};
    rows.forEach(r => {
        const key = `${r['試合日']}__${r['チーム名']}`;
        gameTeamPts[key] = (gameTeamPts[key] || 0) + (parseInt(r['ポイント'], 10) || 0);
    });

    const playerGroups = {};
    const teamGroups = {};
    const heaveEvents = [];

    rows.forEach(r => {
        const pKey = `${r['チーム名']}__${r['選手名']}`;
        if (!playerGroups[pKey]) playerGroups[pKey] = [];
        playerGroups[pKey].push(r);

        if (!teamGroups[r['チーム名']]) teamGroups[r['チーム名']] = [];
        teamGroups[r['チーム名']].push(r);
    });

    const playersList = Object.values(playerGroups).map(group => {
        group.sort((a, b) => a['試合日'].localeCompare(b['試合日']));
        const last = group[group.length - 1];
        const teamName = last['チーム名'];
        const playerName = last['選手名'];
        const numberStr = last['背番号'].replace('*', '');

        let gp = 0, gs = 0;
        let totPts = 0, totMin = 0, totOr = 0, totDr = 0, totTr = 0, totAst = 0, totStl = 0, totBlk = 0, totTo = 0, totPf = 0, totEff = 0;
        let tot2pm = 0, tot2pa = 0, tot3pm = 0, tot3pa = 0, tot3pmNba = 0, tot3paNba = 0, totFtm = 0, totFta = 0, totHeaves = 0;

        const gameLogs = group.map(r => {
            const minVal = parseMin(r['出場時間']);
            const played = minVal > 0;
            const starter = r['背番号'].startsWith('*');
            const [m2, a2] = parseMA(r['2ポイント']);
            const [m3, a3] = parseMA(r['3ポイント']);
            const [m3n, a3n] = r['3ポイント(NBAルール)'] ? parseMA(r['3ポイント(NBAルール)']) : [m3, a3];
            const [mft, aft] = parseMA(r['フリースロー']);
            const pts = parseInt(r['ポイント'], 10) || 0;
            const or = parseInt(r['オフェンスリバウンド数'], 10) || 0;
            const dr = parseInt(r['ディフェンスリバウンド数'], 10) || 0;
            const tr = parseInt(r['トータルリバウンド数'], 10) || 0;
            const ast = parseInt(r['アシスト数'], 10) || 0;
            const stl = parseInt(r['スティール数'], 10) || 0;
            const blk = parseInt(r['ブロック数'], 10) || 0;
            const to = parseInt(r['ターンオーバー数'], 10) || 0;
            const pf = parseInt(r['ファウル数'], 10) || 0;
            const fga = a2 + a3, fgm = m2 + m3;
            const fgaNba = a2 + a3n, fgmNba = m2 + m3n;
            const heave = Math.max(a3 - a3n, 0);
            const effVal = pts + tr + ast + stl + blk - (fga - fgm) - (aft - mft) - to;

            const tPts = gameTeamPts[`${r['試合日']}__${r['チーム名']}`] || 0;
            const oPts = gameTeamPts[`${r['試合日']}__${r['対戦相手']}`] || 0;
            const wl = tPts > oPts ? 'W' : (tPts < oPts ? 'L' : 'D');

            if (heave > 0) {
                heaveEvents.push({
                    '試合日': r['試合日'], 'チーム名': teamName, '対戦相手': r['対戦相手'],
                    '背番号': numberStr, '選手名': playerName, 'ポイント': pts, '出場時間': r['出場時間'],
                    '3ポイント_通常': r['3ポイント'], '3ポイント_NBA': r['3ポイント(NBAルール)'],
                    'ヒーブ除外数': heave,
                    '3P%_通常': pct(m3, a3), '3P%_NBA': pct(m3n, a3n),
                    'eFG%_通常': efg(fgm, m3, fga), 'eFG%_NBA': efg(fgmNba, m3n, fgaNba)
                });
            }

            if (played) {
                gp++;
                if (starter) gs++;
                totPts += pts; totMin += minVal; totOr += or; totDr += dr; totTr += tr;
                totAst += ast; totStl += stl; totBlk += blk; totTo += to; totPf += pf; totEff += effVal;
                tot2pm += m2; tot2pa += a2; tot3pm += m3; tot3pa += a3;
                tot3pmNba += m3n; tot3paNba += a3n; totFtm += mft; totFta += aft; totHeaves += heave;
            }

            return {
                '試合日': r['試合日'], '対戦相手': r['対戦相手'], '勝敗': wl, 'スコア': `${tPts}-${oPts}`,
                '先発': starter, '出場フラグ': played, '出場時間': r['出場時間'], '出場時間_分': Number(minVal.toFixed(2)),
                'ポイント': pts, '2ポイント': r['2ポイント'], '3ポイント': r['3ポイント'],
                '3ポイント_NBA': r['3ポイント(NBAルール)'] || r['3ポイント'], 'フリースロー': r['フリースロー'],
                '2P%': pct(m2, a2), '3P%': pct(m3, a3), '3P%_NBA': pct(m3n, a3n), 'FT%': pct(mft, aft),
                'eFG%': efg(fgm, m3, fga), 'eFG%_NBA': efg(fgmNba, m3n, fgaNba),
                'TS%': ts(pts, fga, aft), 'TS%_NBA': ts(pts, fgaNba, aft), 'ヒーブ除外数': heave,
                'オフェンスリバウンド数': or, 'ディフェンスリバウンド数': dr, 'トータルリバウンド数': tr,
                'アシスト数': ast, 'スティール数': stl, 'ブロック数': blk, 'Stocks': stl + blk,
                'ターンオーバー数': to, 'ファウル数': pf,
                '攻撃権創出': or + stl, '守備的圧力': dr + 2 * (stl + blk),
                '堅実性': Number(((pts + tr + ast) / Math.max(to, 1)).toFixed(2)), 'EFF': effVal
            };
        });

        const d = gp > 0 ? gp : 1;
        const totFga = tot2pa + tot3pa, totFgm = tot2pm + tot3pm;
        const totFgaNba = tot2pa + tot3paNba, totFgmNba = tot2pm + tot3pmNba;
        const totStocks = totStl + totBlk;
        const p3 = pct(tot3pm, tot3pa), p3n = pct(tot3pmNba, tot3paNba);
        const ef = efg(totFgm, tot3pm, totFga), efn = efg(totFgmNba, tot3pmNba, totFgaNba);
        const tsv = ts(totPts, totFga, totFta), tsn = ts(totPts, totFgaNba, totFta);

        return {
            '選手名': playerName, 'チーム名': teamName, '背番号': numberStr,
            '出場試合数': gp, '先発試合数': gs, 'ベンチ入り試合数': group.length,
            'ポイント': gp ? Number((totPts / d).toFixed(2)) : 0,
            '出場時間_分': gp ? Number((totMin / d).toFixed(2)) : 0,
            'オフェンスリバウンド数': gp ? Number((totOr / d).toFixed(2)) : 0,
            'ディフェンスリバウンド数': gp ? Number((totDr / d).toFixed(2)) : 0,
            'トータルリバウンド数': gp ? Number((totTr / d).toFixed(2)) : 0,
            'アシスト数': gp ? Number((totAst / d).toFixed(2)) : 0,
            'スティール数': gp ? Number((totStl / d).toFixed(2)) : 0,
            'ブロック数': gp ? Number((totBlk / d).toFixed(2)) : 0,
            'Stocks': gp ? Number((totStocks / d).toFixed(2)) : 0,
            'ターンオーバー数': gp ? Number((totTo / d).toFixed(2)) : 0,
            'ファウル数': gp ? Number((totPf / d).toFixed(2)) : 0,
            'EFF': gp ? Number((totEff / d).toFixed(2)) : 0,
            'PTS_per40': totMin > 0 ? Number(((totPts / totMin) * 40).toFixed(2)) : 0,
            'AST_TO': gp ? Number((totAst / Math.max(totTo, 1)).toFixed(2)) : 0,
            '2P%': pct(tot2pm, tot2pa), '3P%': p3, '3P%_NBA': p3n, '3P%_diff': Number((p3n - p3).toFixed(2)),
            'FT%': pct(totFtm, totFta), 'FG%': pct(totFgm, totFga), 'FG%_NBA': pct(totFgmNba, totFgaNba),
            'eFG%': ef, 'eFG%_NBA': efn, 'eFG%_diff': Number((efn - ef).toFixed(2)),
            'TS%': tsv, 'TS%_NBA': tsn, 'TS%_diff': Number((tsn - tsv).toFixed(2)),
            '攻撃権創出': gp ? Number(((totOr + totStl) / d).toFixed(2)) : 0,
            '守備的圧力': gp ? Number(((totDr + 2 * totStocks) / d).toFixed(2)) : 0,
            '堅実性': gp ? Number(((totPts + totTr + totAst) / Math.max(totTo, 1)).toFixed(2)) : 0,
            '通算': {
                'ポイント': totPts, '出場時間_分': Number(totMin.toFixed(2)),
                'オフェンスリバウンド数': totOr, 'ディフェンスリバウンド数': totDr, 'トータルリバウンド数': totTr,
                'アシスト数': totAst, 'スティール数': totStl, 'ブロック数': totBlk, 'Stocks': totStocks,
                'ターンオーバー数': totTo, 'ファウル数': totPf, 'EFF': totEff,
                '2P_成功': tot2pm, '2P_試投': tot2pa, '3P_成功': tot3pm, '3P_試投': tot3pa,
                '3P_NBA_成功': tot3pmNba, '3P_NBA_試投': tot3paNba, 'FT_成功': totFtm, 'FT_試投': totFta,
                'FGA': totFga, 'FGM': totFgm, 'FGA_NBA': totFgaNba, 'FGM_NBA': totFgmNba,
                'ヒーブ除外数': totHeaves, '攻撃権創出': totOr + totStl, '守備的圧力': totDr + 2 * totStocks
            },
            '試合ログ': gameLogs
        };
    });

    // チーム集計
    const teamsList = Object.entries(teamGroups).map(([teamName, tRows]) => {
        const dates = [...new Set(tRows.map(r => r['試合日']))].sort();
        const tGames = dates.length;
        let wins = 0, losses = 0, oppPtsTotal = 0;
        let totPts = 0, totOr = 0, totDr = 0, totTr = 0, totAst = 0, totStl = 0, totBlk = 0, totTo = 0, totPf = 0;
        let tot2pm = 0, tot2pa = 0, tot3pm = 0, tot3pa = 0, tot3pmNba = 0, tot3paNba = 0, totFtm = 0, totFta = 0, totHeaves = 0;

        const teamGameLogs = dates.map(d => {
            const gRows = tRows.filter(r => r['試合日'] === d);
            const oppName = gRows[0]['対戦相手'];
            const tPts = gameTeamPts[`${d}__${teamName}`] || 0;
            const oPts = gameTeamPts[`${d}__${oppName}`] || 0;
            oppPtsTotal += oPts;
            if (tPts > oPts) wins++; else if (tPts < oPts) losses++;

            let g2m = 0, g2a = 0, g3m = 0, g3a = 0, g3mn = 0, g3an = 0, gftm = 0, gfta = 0, gh = 0;
            gRows.forEach(r => {
                const [m2, a2] = parseMA(r['2ポイント']);
                const [m3, a3] = parseMA(r['3ポイント']);
                const [m3n, a3n] = r['3ポイント(NBAルール)'] ? parseMA(r['3ポイント(NBAルール)']) : [m3, a3];
                const [mft, aft] = parseMA(r['フリースロー']);
                g2m += m2; g2a += a2; g3m += m3; g3a += a3; g3mn += m3n; g3an += a3n; gftm += mft; gfta += aft;
                gh += Math.max(a3 - a3n, 0);
                totPts += parseInt(r['ポイント'], 10) || 0;
                totOr += parseInt(r['オフェンスリバウンド数'], 10) || 0;
                totDr += parseInt(r['ディフェンスリバウンド数'], 10) || 0;
                totTr += parseInt(r['トータルリバウンド数'], 10) || 0;
                totAst += parseInt(r['アシスト数'], 10) || 0;
                totStl += parseInt(r['スティール数'], 10) || 0;
                totBlk += parseInt(r['ブロック数'], 10) || 0;
                totTo += parseInt(r['ターンオーバー数'], 10) || 0;
                totPf += parseInt(r['ファウル数'], 10) || 0;
            });
            tot2pm += g2m; tot2pa += g2a; tot3pm += g3m; tot3pa += g3a;
            tot3pmNba += g3mn; tot3paNba += g3an; totFtm += gftm; totFta += gfta; totHeaves += gh;

            return {
                '試合日': d, '対戦相手': oppName, '勝敗': tPts > oPts ? 'W' : 'L',
                '得点': tPts, '失点': oPts, '得失点差': tPts - oPts,
                'eFG%': efg(g2m + g3m, g3m, g2a + g3a),
                'eFG%_NBA': efg(g2m + g3mn, g3mn, g2a + g3an)
            };
        });

        const totFga = tot2pa + tot3pa, totFgm = tot2pm + tot3pm;
        const totFgaNba = tot2pa + tot3paNba, totFgmNba = tot2pm + tot3pmNba;
        const p3 = pct(tot3pm, tot3pa), p3n = pct(tot3pmNba, tot3paNba);
        const ef = efg(totFgm, tot3pm, totFga), efn = efg(totFgmNba, tot3pmNba, totFgaNba);

        return {
            'チーム名': teamName, '試合数': tGames, '勝利': wins, '敗戦': losses,
            '勝率': Number(((wins / tGames) * 100).toFixed(1)),
            '得点': Number((totPts / tGames).toFixed(2)), '失点': Number((oppPtsTotal / tGames).toFixed(2)),
            '得失点差': Number(((totPts - oppPtsTotal) / tGames).toFixed(2)),
            '2P%': pct(tot2pm, tot2pa), '3P%': p3, '3P%_NBA': p3n, '3P%_diff': Number((p3n - p3).toFixed(2)),
            'FT%': pct(totFtm, totFta), 'eFG%': ef, 'eFG%_NBA': efn, 'eFG%_diff': Number((efn - ef).toFixed(2)),
            'TS%': ts(totPts, totFga, totFta), 'TS%_NBA': ts(totPts, totFgaNba, totFta),
            'オフェンスリバウンド数': Number((totOr / tGames).toFixed(2)),
            'ディフェンスリバウンド数': Number((totDr / tGames).toFixed(2)),
            'トータルリバウンド数': Number((totTr / tGames).toFixed(2)),
            'アシスト数': Number((totAst / tGames).toFixed(2)),
            'スティール数': Number((totStl / tGames).toFixed(2)),
            'ブロック数': Number((totBlk / tGames).toFixed(2)),
            'ターンオーバー数': Number((totTo / tGames).toFixed(2)),
            'ファウル数': Number((totPf / tGames).toFixed(2)),
            '攻撃権創出': Number(((totOr + totStl) / tGames).toFixed(2)),
            '守備的圧力': Number(((totDr + 2 * (totStl + totBlk)) / tGames).toFixed(2)),
            '堅実性': Number(((totPts + totTr + totAst) / Math.max(totTo, 1)).toFixed(2)),
            'ヒーブ除外数_合計': totHeaves, '3P_試投_合計': tot3pa, '3P_NBA_試投_合計': tot3paNba, '3P_成功_合計': tot3pm,
            '試合ログ': teamGameLogs
        };
    });

    return { source_file: fileName, players: playersList, teams: teamsList, heave_events: heaveEvents };
}
