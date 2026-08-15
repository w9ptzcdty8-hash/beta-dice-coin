// ========================================
// MRS WORKS - DICE & COIN
// Main JavaScript
// ========================================

document.addEventListener("DOMContentLoaded", () => {
    init();
});

// ========================================
// Constants
// ========================================

const STORAGE_KEYS = {
    diceSettings: "dc_diceSettings",
    diceHistory: "dc_diceHistory",
    coinSettings: "dc_coinSettings",
    coinHistory: "dc_coinHistory",
};

const DEFAULT_DICE_SETTINGS = { count: 1, faces: 6 };
const DEFAULT_COIN_SETTINGS = { count: 1 };

const HISTORY_LIMIT = 10;
const ANIM_MS = 950;

// D6の面配置（現実のサイコロと同じく対面の合計は7）
// front=1 / right=2 / top=3 / bottom=4 / left=5 / back=6
const CUBE_FACE_ROT = {
    1: { x: 0, y: 0 },
    2: { x: 0, y: -90 },
    3: { x: -90, y: 0 },
    4: { x: 90, y: 0 },
    5: { x: 0, y: 90 },
    6: { x: 0, y: 180 },
};

// D8（正八面体）の面配置
// 実際の正八面体の頂点座標 (±a,0,0)(0,±a,0)(0,0,±a) から算出した角度。
// 面の傾き角 = arccos(1/√3) ≈ 54.7356°
const OCTA_TILT = (Math.acos(1 / Math.sqrt(3)) * 180) / Math.PI; // ≈ 54.7356
const OCTA_FACE_PLACEMENT = [
    // { azimuth, tilt, side } side: 'top' | 'bottom' -- 面自体の固定配置（clip-path方向の判定用）
    { azimuth: 45, tilt: OCTA_TILT, side: "top" },
    { azimuth: 135, tilt: OCTA_TILT, side: "top" },
    { azimuth: 225, tilt: OCTA_TILT, side: "top" },
    { azimuth: 315, tilt: OCTA_TILT, side: "top" },
    { azimuth: 45, tilt: 180 - OCTA_TILT, side: "bottom" },
    { azimuth: 135, tilt: 180 - OCTA_TILT, side: "bottom" },
    { azimuth: 225, tilt: 180 - OCTA_TILT, side: "bottom" },
    { azimuth: 315, tilt: 180 - OCTA_TILT, side: "bottom" },
];

// 値(1-8) -> その面を正面に向けるための、立体全体の回転角
// (面の固定配置transformの逆回転)
const OCTA_FACE_ROT = {};
OCTA_FACE_PLACEMENT.forEach((f, idx) => {
    OCTA_FACE_ROT[idx + 1] = { x: -f.tilt, y: -f.azimuth };
});

const OCTA_RADIUS = 21; // 中心から面までの距離(px)

// ========================================
// State
// ========================================

const state = {
    diceSettings: loadJSON(STORAGE_KEYS.diceSettings, DEFAULT_DICE_SETTINGS),
    coinSettings: loadJSON(STORAGE_KEYS.coinSettings, DEFAULT_COIN_SETTINGS),
    diceHistory: loadJSON(STORAGE_KEYS.diceHistory, []),
    coinHistory: loadJSON(STORAGE_KEYS.coinHistory, []),
    isRolling: false,
    isTossing: false,
    settingsTarget: null, // 'dice' | 'coin'
    draft: null,
    clearTarget: null, // 'dice' | 'coin'
};

// ========================================
// Storage helpers
// ========================================

function loadJSON(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        if (!raw) return structuredCloneSafe(fallback);
        const parsed = JSON.parse(raw);
        if (parsed === null || parsed === undefined) return structuredCloneSafe(fallback);
        return parsed;
    } catch (e) {
        return structuredCloneSafe(fallback);
    }
}

function saveJSON(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
        // localStorageが使用できない環境でもクラッシュさせない
        console.warn("localStorageへの保存に失敗しました:", e);
    }
}

function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value));
}

// ========================================
// DOM references
// ========================================

const el = {};

function cacheEls() {
    el.tabBtns = document.querySelectorAll(".tab-btn");
    el.panels = document.querySelectorAll(".panel");
    el.settingsBtn = document.getElementById("settingsBtn");

    el.diceStage = document.getElementById("diceStage");
    el.diceResultArea = document.getElementById("diceResultArea");
    el.rollBtn = document.getElementById("rollBtn");
    el.diceHistoryList = document.getElementById("diceHistoryList");

    el.coinStage = document.getElementById("coinStage");
    el.coinResultArea = document.getElementById("coinResultArea");
    el.tossBtn = document.getElementById("tossBtn");
    el.coinHistoryList = document.getElementById("coinHistoryList");

    el.settingsModal = document.getElementById("settingsModal");
    el.settingsBodyDice = document.querySelector('.modal-body[data-settings="dice"]');
    el.settingsBodyCoin = document.querySelector('.modal-body[data-settings="coin"]');
    el.diceCountValue = document.getElementById("diceCountValue");
    el.coinCountValue = document.getElementById("coinCountValue");
    el.diceFaceSelect = document.getElementById("diceFaceSelect");
    el.settingsCancelBtn = document.getElementById("settingsCancelBtn");
    el.settingsConfirmBtn = document.getElementById("settingsConfirmBtn");

    el.confirmDialog = document.getElementById("confirmDialog");
    el.confirmCancelBtn = document.getElementById("confirmCancelBtn");
    el.confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
}

// ========================================
// Initialization
// ========================================

function init() {
    cacheEls();

    renderDiceStage();
    renderCoinStage();
    renderHistory("dice");
    renderHistory("coin");

    bindTabEvents();
    bindActionEvents();
    bindSettingsEvents();
    bindClearEvents();

    console.log("DICE & COIN initialized");
}

// ========================================
// Tabs
// ========================================

function bindTabEvents() {
    el.tabBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const target = btn.dataset.tab;
            switchTab(target);
        });
    });
}

function switchTab(target) {
    el.tabBtns.forEach((btn) => {
        const isActive = btn.dataset.tab === target;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
    });
    el.panels.forEach((panel) => {
        panel.classList.toggle("is-active", panel.dataset.panel === target);
    });
}

function getActiveTab() {
    const activeBtn = document.querySelector(".tab-btn.is-active");
    return activeBtn ? activeBtn.dataset.tab : "dice";
}

// ========================================
// Dice stage rendering
// ========================================

function renderDiceStage() {
    el.diceStage.innerHTML = "";
    const { count, faces } = state.diceSettings;

    for (let i = 0; i < count; i++) {
        el.diceStage.appendChild(createDieElement(faces));
    }

    el.diceResultArea.innerHTML = '<p class="result-hint">ROLLを押してください</p>';
}

function createDieElement(faces) {
    const slot = document.createElement("div");
    slot.className = "die-slot";

    if (faces === 6) {
        const wrap = document.createElement("div");
        wrap.className = "die-cube-wrap";

        const cube = document.createElement("div");
        cube.className = "die-cube";
        cube.dataset.rotX = "0";
        cube.dataset.rotY = "0";

        const positions = [
            ["front", 1],
            ["right", 2],
            ["top", 3],
            ["bottom", 4],
            ["left", 5],
            ["back", 6],
        ];

        positions.forEach(([pos, value]) => {
            const face = document.createElement("div");
            face.className = `die-face die-face--${pos}`;
            face.dataset.value = String(value);
            for (let d = 1; d <= 9; d++) {
                const dot = document.createElement("span");
                dot.className = `dot dot-${d}`;
                face.appendChild(dot);
            }
            cube.appendChild(face);
        });

        wrap.appendChild(cube);
        slot.appendChild(wrap);
    } else {
        // D8（正八面体）
        const wrap = document.createElement("div");
        wrap.className = "die-octa-wrap";

        const octa = document.createElement("div");
        octa.className = "die-octa";
        octa.dataset.rotX = String(-OCTA_TILT);
        octa.dataset.rotY = "-45";

        OCTA_FACE_PLACEMENT.forEach((f, idx) => {
            const value = idx + 1;
            const face = document.createElement("div");
            face.className = `die-octa-face die-octa-face--${f.side}`;
            face.dataset.value = String(value);
            face.textContent = String(value);
            face.style.transform =
                `rotateY(${f.azimuth}deg) rotateX(${f.tilt}deg) translateZ(${OCTA_RADIUS}px)`;
            octa.appendChild(face);
        });

        wrap.appendChild(octa);

        const label = document.createElement("div");
        label.className = "die-label";
        label.textContent = `D${faces}`;
        slot.appendChild(wrap);
        slot.appendChild(label);
    }

    return slot;
}

// ========================================
// Coin stage rendering
// ========================================

function renderCoinStage() {
    el.coinStage.innerHTML = "";
    const { count } = state.coinSettings;

    for (let i = 0; i < count; i++) {
        el.coinStage.appendChild(createCoinElement());
    }

    el.coinResultArea.innerHTML = '<p class="result-hint">TOSSを押してください</p>';
}

function createCoinElement() {
    const wrap = document.createElement("div");
    wrap.className = "coin-wrap";

    const coin = document.createElement("div");
    coin.className = "coin";
    coin.dataset.rot = "0";
    coin.dataset.result = "heads";

    const heads = document.createElement("div");
    heads.className = "coin-face coin-face--heads";
    heads.textContent = "表";

    const tails = document.createElement("div");
    tails.className = "coin-face coin-face--tails";
    tails.textContent = "裏";

    coin.appendChild(heads);
    coin.appendChild(tails);
    wrap.appendChild(coin);

    return wrap;
}

// ========================================
// Roll (DICE)
// ========================================

function bindActionEvents() {
    el.rollBtn.addEventListener("click", rollDice);
    el.tossBtn.addEventListener("click", tossCoin);
}

function rollDice() {
    if (state.isRolling) return;
    state.isRolling = true;
    setRollingUI(true);

    const { count, faces } = state.diceSettings;

    // 乱数生成（アニメーションとは独立して先に結果を確定する）
    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(1 + Math.floor(Math.random() * faces));
    }

    const dieSlots = el.diceStage.querySelectorAll(".die-slot");
    dieSlots.forEach((slot, i) => {
        animateDie(slot, faces, results[i]);
    });

    setTimeout(() => {
        showDiceResult(results, faces);
        pushDiceHistory(results, faces);
        state.isRolling = false;
        setRollingUI(false);
    }, ANIM_MS);
}

function animateDie(slot, faces, value) {
    if (faces === 6) {
        const cube = slot.querySelector(".die-cube");
        const target = CUBE_FACE_ROT[value];
        const curX = parseFloat(cube.dataset.rotX) || 0;
        const curY = parseFloat(cube.dataset.rotY) || 0;

        const spinTurnsX = 360 * (2 + Math.floor(Math.random() * 2));
        const spinTurnsY = 360 * (2 + Math.floor(Math.random() * 2));

        // 現在の回転量を基準に、目的の面が正面になる角度まで回す
        const nextX = roundToTarget(curX, target.x) + spinTurnsX;
        const nextY = roundToTarget(curY, target.y) + spinTurnsY;

        cube.classList.add("is-rolling");
        cube.style.transform = `rotateX(${nextX}deg) rotateY(${nextY}deg)`;
        cube.dataset.rotX = String(nextX);
        cube.dataset.rotY = String(nextY);
    } else {
        const octa = slot.querySelector(".die-octa");
        const target = OCTA_FACE_ROT[value];
        const curX = parseFloat(octa.dataset.rotX) || 0;
        const curY = parseFloat(octa.dataset.rotY) || 0;

        const spinTurnsX = 360 * (2 + Math.floor(Math.random() * 2));
        const spinTurnsY = 360 * (2 + Math.floor(Math.random() * 2));

        const nextX = roundToTarget(curX, target.x) + spinTurnsX;
        const nextY = roundToTarget(curY, target.y) + spinTurnsY;

        octa.classList.add("is-rolling");
        octa.style.transform = `rotateX(${nextX}deg) rotateY(${nextY}deg)`;
        octa.dataset.rotX = String(nextX);
        octa.dataset.rotY = String(nextY);
    }
}

// 現在値から見て、目的の余り(target)に到達する直近の値を返す
function roundToTarget(current, target) {
    const base = Math.floor(current / 360) * 360;
    let candidate = base + ((target % 360) + 360) % 360;
    if (candidate < current) candidate += 360;
    return candidate;
}

function roundToMultiple360(current) {
    return Math.ceil(current / 360) * 360;
}

function showDiceResult(results, faces) {
    const total = results.reduce((sum, v) => sum + v, 0);
    const valuesHtml = results.map((v) => `<span>${v}</span>`).join("");
    el.diceResultArea.innerHTML = `
        <div class="result-values">${valuesHtml}</div>
        <div class="result-total">合計 <strong>${total}</strong></div>
    `;
}

function pushDiceHistory(results, faces) {
    const total = results.reduce((sum, v) => sum + v, 0);
    const entry = {
        faces,
        count: results.length,
        results,
        total,
        time: formatTime(new Date()),
    };
    state.diceHistory.unshift(entry);
    if (state.diceHistory.length > HISTORY_LIMIT) {
        state.diceHistory.length = HISTORY_LIMIT;
    }
    saveJSON(STORAGE_KEYS.diceHistory, state.diceHistory);
    renderHistory("dice");
}

// ========================================
// Toss (COIN)
// ========================================

function tossCoin() {
    if (state.isTossing) return;
    state.isTossing = true;
    setTossingUI(true);

    const { count } = state.coinSettings;

    const results = [];
    for (let i = 0; i < count; i++) {
        results.push(Math.random() < 0.5 ? "heads" : "tails");
    }

    const coinEls = el.coinStage.querySelectorAll(".coin");
    coinEls.forEach((coin, i) => {
        animateCoin(coin, results[i]);
    });

    setTimeout(() => {
        showCoinResult(results);
        pushCoinHistory(results);
        state.isTossing = false;
        setTossingUI(false);
    }, ANIM_MS);
}

function animateCoin(coin, result) {
    const targetMod = result === "heads" ? 0 : 180;
    const cur = parseFloat(coin.dataset.rot) || 0;
    const spins = 360 * (2 + Math.floor(Math.random() * 2));
    const next = roundToTarget(cur, targetMod) + spins;

    coin.classList.add("is-tossing");
    coin.style.transform = `rotateY(${next}deg)`;
    coin.dataset.rot = String(next);
    coin.dataset.result = result;
}

function showCoinResult(results) {
    const labelOf = (r) => (r === "heads" ? "表" : "裏");
    if (results.length === 1) {
        el.coinResultArea.innerHTML = `
            <div class="result-values"><span>${labelOf(results[0])}</span></div>
        `;
        return;
    }
    const heads = results.filter((r) => r === "heads").length;
    const tails = results.length - heads;
    const valuesHtml = results.map((r) => `<span>${labelOf(r)}</span>`).join("");
    el.coinResultArea.innerHTML = `
        <div class="result-values">${valuesHtml}</div>
        <div class="result-total">表：${heads} / 裏：${tails}</div>
    `;
}

function pushCoinHistory(results) {
    const heads = results.filter((r) => r === "heads").length;
    const tails = results.length - heads;
    const entry = {
        count: results.length,
        results,
        heads,
        tails,
        time: formatTime(new Date()),
    };
    state.coinHistory.unshift(entry);
    if (state.coinHistory.length > HISTORY_LIMIT) {
        state.coinHistory.length = HISTORY_LIMIT;
    }
    saveJSON(STORAGE_KEYS.coinHistory, state.coinHistory);
    renderHistory("coin");
}

// ========================================
// Rolling / Tossing UI lock (連打防止)
// ========================================

function setRollingUI(isRolling) {
    el.rollBtn.disabled = isRolling;
    el.settingsBtn.disabled = isRolling || state.isTossing;
}

function setTossingUI(isTossing) {
    el.tossBtn.disabled = isTossing;
    el.settingsBtn.disabled = isTossing || state.isRolling;
}

// ========================================
// History rendering
// ========================================

function renderHistory(tab) {
    const list = tab === "dice" ? el.diceHistoryList : el.coinHistoryList;
    const data = tab === "dice" ? state.diceHistory : state.coinHistory;

    list.innerHTML = "";

    if (data.length === 0) {
        const li = document.createElement("li");
        li.className = "history-empty";
        li.textContent = "まだ履歴がありません";
        list.appendChild(li);
        return;
    }

    data.forEach((entry) => {
        list.appendChild(tab === "dice" ? renderDiceHistoryItem(entry) : renderCoinHistoryItem(entry));
    });
}

function renderDiceHistoryItem(entry) {
    const li = document.createElement("li");
    li.className = "history-item";
    li.innerHTML = `
        <div class="history-item-main">
            <span class="history-item-type">D${entry.faces} × ${entry.count}</span>
            <span class="history-item-values">${entry.results.join("・")}</span>
            <span class="history-item-summary">合計 ${entry.total}</span>
        </div>
        <span class="history-item-time">${entry.time}</span>
    `;
    return li;
}

function renderCoinHistoryItem(entry) {
    const li = document.createElement("li");
    li.className = "history-item";
    const labels = entry.results.map((r) => (r === "heads" ? "表" : "裏")).join("・");
    li.innerHTML = `
        <div class="history-item-main">
            <span class="history-item-type">COIN × ${entry.count}</span>
            <span class="history-item-values">${labels}</span>
            <span class="history-item-summary">表：${entry.heads} / 裏：${entry.tails}</span>
        </div>
        <span class="history-item-time">${entry.time}</span>
    `;
    return li;
}

function formatTime(date) {
    const h = String(date.getHours()).padStart(2, "0");
    const m = String(date.getMinutes()).padStart(2, "0");
    return `${h}:${m}`;
}

// ========================================
// History clear (confirm dialog)
// ========================================

function bindClearEvents() {
    document.querySelectorAll(".clear-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            state.clearTarget = btn.dataset.clear;
            el.confirmDialog.hidden = false;
        });
    });

    el.confirmCancelBtn.addEventListener("click", () => {
        state.clearTarget = null;
        el.confirmDialog.hidden = true;
    });

    el.confirmDeleteBtn.addEventListener("click", () => {
        if (state.clearTarget === "dice") {
            state.diceHistory = [];
            saveJSON(STORAGE_KEYS.diceHistory, state.diceHistory);
            renderHistory("dice");
        } else if (state.clearTarget === "coin") {
            state.coinHistory = [];
            saveJSON(STORAGE_KEYS.coinHistory, state.coinHistory);
            renderHistory("coin");
        }
        state.clearTarget = null;
        el.confirmDialog.hidden = true;
    });
}

// ========================================
// Settings modal (完了ボタンで確定 / キャンセルで破棄)
// ========================================

function bindSettingsEvents() {
    el.settingsBtn.addEventListener("click", openSettingsModal);

    el.settingsModal.querySelectorAll(".stepper-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            const targetKey = btn.dataset.target; // 'diceCount' | 'coinCount'
            const dir = btn.dataset.step === "inc" ? 1 : -1;
            adjustDraftCount(targetKey, dir);
        });
    });

    el.diceFaceSelect.querySelectorAll(".face-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            state.draft.faces = Number(btn.dataset.face);
            renderSettingsDraft();
        });
    });

    el.settingsCancelBtn.addEventListener("click", closeSettingsModal);
    el.settingsConfirmBtn.addEventListener("click", confirmSettings);

    // オーバーレイの背景タップはキャンセル扱い（変更を破棄）
    el.settingsModal.addEventListener("click", (e) => {
        if (e.target === el.settingsModal) closeSettingsModal();
    });
}

function openSettingsModal() {
    const tab = getActiveTab();
    state.settingsTarget = tab;

    if (tab === "dice") {
        state.draft = { ...state.diceSettings };
        el.settingsBodyDice.hidden = false;
        el.settingsBodyCoin.hidden = true;
    } else {
        state.draft = { ...state.coinSettings };
        el.settingsBodyDice.hidden = true;
        el.settingsBodyCoin.hidden = false;
    }

    renderSettingsDraft();
    el.settingsModal.hidden = false;
}

function closeSettingsModal() {
    state.draft = null;
    el.settingsModal.hidden = true;
}

function adjustDraftCount(targetKey, dir) {
    if (targetKey === "diceCount") {
        state.draft.count = clamp(state.draft.count + dir, 1, 3);
    } else if (targetKey === "coinCount") {
        state.draft.count = clamp(state.draft.count + dir, 1, 3);
    }
    renderSettingsDraft();
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function renderSettingsDraft() {
    if (state.settingsTarget === "dice") {
        el.diceCountValue.textContent = String(state.draft.count);
        el.diceFaceSelect.querySelectorAll(".face-btn").forEach((btn) => {
            btn.classList.toggle("is-selected", Number(btn.dataset.face) === state.draft.faces);
        });
    } else {
        el.coinCountValue.textContent = String(state.draft.count);
    }
}

function confirmSettings() {
    if (state.settingsTarget === "dice") {
        state.diceSettings = { ...state.draft };
        saveJSON(STORAGE_KEYS.diceSettings, state.diceSettings);
        renderDiceStage();
    } else if (state.settingsTarget === "coin") {
        state.coinSettings = { ...state.draft };
        saveJSON(STORAGE_KEYS.coinSettings, state.coinSettings);
        renderCoinStage();
    }
    closeSettingsModal();
}
