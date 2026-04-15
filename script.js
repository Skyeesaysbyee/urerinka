import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get, remove, push, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// --- FIREBASE SETUP ---
const firebaseConfig = {
    apiKey: "AIzaSyDXi3GXU8rM7WyTZhoa4KdLkmD_kkn-X6U",
    authDomain: "urerinka.firebaseapp.com",
    databaseURL: "https://urerinka-default-rtdb.firebaseio.com/",
    projectId: "urerinka",
    storageBucket: "urerinka.firebasestorage.app",
    messagingSenderId: "165176233749",
    appId: "1:165176233749:web:e0ed16f948b0299a15631c"
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);

// --- VARIABLES ---
let currentRoom = null;
let playerNum = null;
let playerName = "";
let currentTurn = 1;
let rollsLeft = 3;
let currentDice = [1, 1, 1, 1, 1];
let heldDice = [false, false, false, false, false];
let p1Data = { name: "P1", scores: {}, yahtzeeBonuses: 0 };
let p2Data = { name: "P2", scores: {}, yahtzeeBonuses: 0 };
const categories = ['1s', '2s', '3s', '4s', '5s', '6s', '3k', '4k', 'fh', 'ss', 'ls', 'yz', 'ch'];

let gameOverShown = false;
let scoreSaveInProgress = false;

// Small house-rule boost for Yahtzee chance
const LUCKY_JOKER_CHANCE = 0.18; // 18%

// --- INITIAL LOAD ---
document.addEventListener("DOMContentLoaded", () => {
    loadHighScores();
    ensureYahtzeeOverlay();
});

// --- NAVIGATION ---
window.openGame = function(gameId) {
    if (gameId === 'yahtzee') {
        document.getElementById("home-hub").style.display = "none";
        document.getElementById("start-screen").style.display = "block";
        document.getElementById("leaderboard-area").style.display = "block";
    }
};

window.goBack = function() {
    document.getElementById("home-hub").style.display = "block";
    document.getElementById("start-screen").style.display = "none";
    document.getElementById("leaderboard-area").style.display = "none";
};

// --- UI HELPERS ---
function ensureYahtzeeOverlay() {
    if (document.getElementById("yahtzee-overlay")) return;

    const overlay = document.createElement("div");
    overlay.id = "yahtzee-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.display = "none";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.background = "rgba(0,0,0,0.45)";
    overlay.style.zIndex = "9999";
    overlay.style.pointerEvents = "none";

    const box = document.createElement("div");
    box.id = "yahtzee-overlay-text";
    box.style.padding = "18px 30px";
    box.style.borderRadius = "20px";
    box.style.background = "rgba(255, 183, 197, 0.96)";
    box.style.color = "#fff";
    box.style.fontWeight = "700";
    box.style.fontSize = "clamp(26px, 5vw, 54px)";
    box.style.letterSpacing = "0.08em";
    box.style.textShadow = "0 2px 10px rgba(0,0,0,0.25)";
    box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
    box.style.transform = "scale(0.9)";
    box.style.transition = "transform 0.18s ease";

    overlay.appendChild(box);
    document.body.appendChild(overlay);
}

function showYahtzeeOverlay() {
    ensureYahtzeeOverlay();

    const overlay = document.getElementById("yahtzee-overlay");
    const text = document.getElementById("yahtzee-overlay-text");
    if (!overlay || !text) return;

    text.textContent = playerName === "りんかちゃん" ? "えらいねママ" : "YAHTZEE";
    overlay.style.display = "flex";

    requestAnimationFrame(() => {
        text.style.transform = "scale(1)";
    });

    setTimeout(() => {
        text.style.transform = "scale(0.92)";
    }, 900);

    setTimeout(() => {
        overlay.style.display = "none";
        text.style.transform = "scale(0.9)";
    }, 1300);
}

function isYahtzee(dice) {
    return dice.every(v => v === dice[0]);
}

function applyLuckyJokerRule(dice, held) {
    // Small house rule:
    // If after a roll you have exactly 4 of one number and 1 odd die,
    // the odd die has a small chance to match.
    const counts = {};
    dice.forEach((d, i) => {
        counts[d] = counts[d] || [];
        counts[d].push(i);
    });

    const entries = Object.entries(counts).map(([face, idxs]) => ({
        face: Number(face),
        idxs
    }));

    const fourKind = entries.find(e => e.idxs.length === 4);
    const single = entries.find(e => e.idxs.length === 1);

    if (!fourKind || !single) return dice;

    const oddIndex = single.idxs[0];

    // only help if that odd die was actually rolled this turn, not held
    if (held[oddIndex]) return dice;

    if (Math.random() < LUCKY_JOKER_CHANCE) {
        dice[oddIndex] = fourKind.face;
    }

    return dice;
}

function getFormattedDate() {
    const d = new Date();
    return `${d.getMonth() + 1}.${d.getDate().toString().padStart(2, '0')}.${d.getFullYear().toString().slice(-2)}`;
}

async function saveScoreAndCheckTop15(score) {
    if (scoreSaveInProgress) return { rank: null, madeTop15: false };
    scoreSaveInProgress = true;

    try {
        const myData = playerNum === 1 ? p1Data : p2Data;
        if (myData.scoreSaved) {
            const snapExisting = await get(ref(db, 'highscores'));
            const scoresExisting = [];
            if (snapExisting.exists()) {
                snapExisting.forEach(child => {
                    const d = child.val();
                    if (d && typeof d.score === "number") scoresExisting.push(d);
                });
            }
            scoresExisting.sort((a, b) => b.score - a.score);
            const rankExisting = scoresExisting.findIndex(s => s.name === playerName && s.score === score) + 1;
            return { rank: rankExisting || null, madeTop15: rankExisting > 0 && rankExisting <= 15 };
        }

        await push(ref(db, 'highscores'), {
            name: playerName,
            score,
            date: getFormattedDate()
        });

        await update(ref(db, `rooms/${currentRoom}/p${playerNum}`), { scoreSaved: true });

        const snap = await get(ref(db, 'highscores'));
        const scores = [];
        if (snap.exists()) {
            snap.forEach(child => {
                const d = child.val();
                if (d && typeof d.score === "number") scores.push(d);
            });
        }

        scores.sort((a, b) => b.score - a.score);

        let rank = null;
        for (let i = 0; i < scores.length; i++) {
            if (scores[i].name === playerName && scores[i].score === score) {
                rank = i + 1;
                break;
            }
        }

        return {
            rank,
            madeTop15: rank !== null && rank <= 15
        };
    } finally {
        scoreSaveInProgress = false;
    }
}

function renderEndLeaderboardHighlight(rank, madeTop15) {
    let badge = document.getElementById("end-rank-msg");
    if (!badge) {
        badge = document.createElement("div");
        badge.id = "end-rank-msg";
        badge.style.marginTop = "10px";
        badge.style.color = "#ffb7c5";
        badge.style.fontWeight = "700";
        badge.style.fontSize = "18px";

        const msg = document.getElementById("game-over-msg");
        if (msg && msg.parentNode) {
            msg.parentNode.insertBefore(badge, msg.nextSibling);
        }
    }

    if (madeTop15) {
        badge.textContent = `TOP 15入り！ ${rank}位 ✨`;
    } else if (rank) {
        badge.textContent = `${rank}位`;
    } else {
        badge.textContent = `スコア保存したよ`;
    }
}

// --- CORE GAME FUNCTIONS ---
window.handleLogin = async function() {
    playerName = document.getElementById("player-name").value.trim();
    let roomInput = document.getElementById("room-id-input").value.trim();

    if (!playerName || !roomInput) {
        alert("入力してください！");
        return;
    }

    currentRoom = roomInput;
    gameOverShown = false;
    scoreSaveInProgress = false;

    const roomRef = ref(db, `rooms/${currentRoom}`);
    const snapshot = await get(roomRef);

    let empty = {};
    categories.forEach(c => empty[c] = 'ー');

    if (!snapshot.exists()) {
        playerNum = 1;
        p1Data = { name: playerName, scores: empty, yahtzeeBonuses: 0, ready: true, scoreSaved: false };
        await set(roomRef, {
            p1: p1Data,
            turn: 1,
            rollsLeft: 3,
            dice: [1, 1, 1, 1, 1],
            held: [false, false, false, false, false]
        });
    } else {
        const data = snapshot.val();
        playerNum = !data.p2 ? 2 : (!data.p1 ? 1 : null);

        if (!playerNum) {
            alert("満員です！");
            return;
        }

        let newPlayerData = {
            name: playerName,
            scores: empty,
            yahtzeeBonuses: 0,
            ready: true,
            scoreSaved: false
        };

        await update(roomRef, { [`p${playerNum}`]: newPlayerData });
    }

    onDisconnect(ref(db, `rooms/${currentRoom}/p${playerNum}`)).remove();

    document.getElementById("home-hub").style.display = "none";
    document.getElementById("start-screen").style.display = "none";
    document.getElementById("leaderboard-area").style.display = "none";
    document.getElementById("game-screen").style.display = "block";
    document.getElementById("room-display").innerText = `ルーム: ${currentRoom}`;

    listenToRoom();
};

window.rollDice = async function() {
    if (currentTurn !== playerNum || rollsLeft <= 0) return;

    for (let i = 0; i < 5; i++) {
        if (!heldDice[i]) {
            currentDice[i] = Math.floor(Math.random() * 6) + 1;
        }
    }

    // small lucky-joker assist
    currentDice = applyLuckyJokerRule([...currentDice], heldDice);

    rollsLeft--;

    await update(ref(db, `rooms/${currentRoom}`), {
        dice: currentDice,
        rollsLeft: rollsLeft
    });

    if (isYahtzee(currentDice)) {
        showYahtzeeOverlay();
    }
};

window.toggleHold = async function(i) {
    if (currentTurn !== playerNum || rollsLeft === 3) return;

    heldDice[i] = !heldDice[i];
    await update(ref(db, `rooms/${currentRoom}`), { held: heldDice });
};

window.attemptScore = async function(category) {
    let myData = playerNum === 1 ? p1Data : p2Data;

    if (currentTurn !== playerNum) return;
    if (myData.scores[category] !== 'ー') return;

    // Must roll once before scoring
    if (rollsLeft === 3) {
        alert("先に1回ふってね！");
        return;
    }

    let isYz = isYahtzee(currentDice);
    let hasYzScore = (myData.scores['yz'] === 50);
    let isJoker = (isYz && hasYzScore);

    let score = calculateScore(category, currentDice, isJoker);
    myData.scores[category] = score;

    if (isJoker) {
        myData.yahtzeeBonuses = (myData.yahtzeeBonuses || 0) + 1;
    }

    if (isYz) {
        showYahtzeeOverlay();
    }

    currentTurn = (playerNum === 1) ? 2 : 1;

    await update(ref(db, `rooms/${currentRoom}`), {
        [`p${playerNum}`]: myData,
        turn: currentTurn,
        rollsLeft: 3,
        dice: [1, 1, 1, 1, 1],
        held: [false, false, false, false, false]
    });
};

function calculateScore(cat, dice, joker) {
    let counts = {};
    dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
    let valArr = Object.values(counts);
    let sum = dice.reduce((a, b) => a + b, 0);
    let has = (n) => dice.includes(n);

    // Existing Joker scoring rule kept
    if (joker) {
        if (cat === 'fh') return 25;
        if (cat === 'ss') return 30;
        if (cat === 'ls') return 40;
        if (cat === '3k' || cat === '4k' || cat === 'ch') return sum;
    }

    if (cat === 'ss') {
        if ((has(1) && has(2) && has(3) && has(4)) || (has(2) && has(3) && has(4) && has(5)) || (has(3) && has(4) && has(5) && has(6))) return 30;
        return 0;
    }

    if (cat === 'ls') {
        if ((has(1) && has(2) && has(3) && has(4) && has(5)) || (has(2) && has(3) && has(4) && has(5) && has(6))) return 40;
        return 0;
    }

    if (cat === 'fh') return (valArr.includes(3) && valArr.includes(2)) ? 25 : 0;
    if (cat.endsWith('s')) return dice.filter(d => d === parseInt(cat[0])).reduce((a, b) => a + b, 0);
    if (cat === '3k') return valArr.some(v => v >= 3) ? sum : 0;
    if (cat === '4k') return valArr.some(v => v >= 4) ? sum : 0;
    if (cat === 'ch') return sum;
    if (cat === 'yz') return valArr.some(v => v === 5) ? 50 : 0;

    return 0;
}

function listenToRoom() {
    onValue(ref(db, `rooms/${currentRoom}`), async (snap) => {
        const data = snap.val();
        if (!data) return;

        currentTurn = data.turn;
        rollsLeft = data.rollsLeft;
        currentDice = data.dice || [1, 1, 1, 1, 1];
        heldDice = data.held || [false, false, false, false, false];
        p1Data = data.p1 || { name: "P1", scores: {}, yahtzeeBonuses: 0 };
        p2Data = data.p2 || { name: "P2", scores: {}, yahtzeeBonuses: 0 };

        updateUI();
        await checkGameOver();
    });
}

function updateUI() {
    if (document.getElementById("game-screen").style.display === "none") return;

    document.getElementById("turn-display").innerText = currentTurn === playerNum ? "あなたの番" : "あいての番";
    document.getElementById("roll-count").innerText = `のこり: ${rollsLeft}回`;
    document.getElementById("roll-btn").disabled = (currentTurn !== playerNum || rollsLeft <= 0);

    for (let i = 0; i < 5; i++) {
        const die = document.getElementById(`die-${i}`);
        die.innerText = ['一', '二', '三', '四', '五', '六'][currentDice[i] - 1];
        die.className = heldDice[i] ? "dice held" : "dice";
    }

    document.getElementById("p1-label").innerText = p1Data.name;
    document.getElementById("p2-label").innerText = p2Data.name;

    let p1Upper = 0, p2Upper = 0;
    let p1Lower = 0, p2Lower = 0;
    let currentIsYz = isYahtzee(currentDice);

    categories.forEach(c => {
        // P1
        let cell1 = document.getElementById(`s1-${c}`);
        let score1 = p1Data.scores[c];
        let joker1 = (currentIsYz && p1Data.scores['yz'] === 50);

        if (score1 !== undefined && score1 !== 'ー') {
            cell1.innerText = (c === 'yz' && p1Data.yahtzeeBonuses > 0) ? `50+${p1Data.yahtzeeBonuses * 100}` : score1;
            cell1.style.color = "#fff";

            let val = typeof score1 === 'number' ? score1 : 0;
            if (['1s', '2s', '3s', '4s', '5s', '6s'].includes(c)) p1Upper += val;
            else p1Lower += val;
        } else {
            if (playerNum === 1 && currentTurn === 1 && rollsLeft < 3) {
                cell1.innerHTML = `<span style="color:#ffb7c5; opacity:0.6;">${calculateScore(c, currentDice, joker1)}</span>`;
            } else {
                cell1.innerText = 'ー';
                cell1.style.color = "#888";
            }
        }

        // P2
        let cell2 = document.getElementById(`s2-${c}`);
        let score2 = p2Data.scores[c];
        let joker2 = (currentIsYz && p2Data.scores['yz'] === 50);

        if (score2 !== undefined && score2 !== 'ー') {
            cell2.innerText = (c === 'yz' && p2Data.yahtzeeBonuses > 0) ? `50+${p2Data.yahtzeeBonuses * 100}` : score2;
            cell2.style.color = "#fff";

            let val = typeof score2 === 'number' ? score2 : 0;
            if (['1s', '2s', '3s', '4s', '5s', '6s'].includes(c)) p2Upper += val;
            else p2Lower += val;
        } else {
            if (playerNum === 2 && currentTurn === 2 && rollsLeft < 3) {
                cell2.innerHTML = `<span style="color:#ffb7c5; opacity:0.6;">${calculateScore(c, currentDice, joker2)}</span>`;
            } else {
                cell2.innerText = 'ー';
                cell2.style.color = "#888";
            }
        }
    });

    let b1 = p1Upper >= 63 ? 35 : 0;
    let b2 = p2Upper >= 63 ? 35 : 0;
    let finalP1 = p1Upper + b1 + p1Lower + ((p1Data.yahtzeeBonuses || 0) * 100);
    let finalP2 = p2Upper + b2 + p2Lower + ((p2Data.yahtzeeBonuses || 0) * 100);

    document.getElementById(`s1-bonus`).innerText = `${b1} (${Math.max(0, 63 - p1Upper)} のこり)`;
    document.getElementById(`s2-bonus`).innerText = `${b2} (${Math.max(0, 63 - p2Upper)} のこり)`;
    document.getElementById(`s1-total`).innerText = finalP1;
    document.getElementById(`s2-total`).innerText = finalP2;
}

async function checkGameOver() {
    if (!p1Data.scores || !p2Data.scores) return;

    const allDone = categories.every(c => p1Data.scores[c] !== 'ー' && p2Data.scores[c] !== 'ー');
    if (!allDone || gameOverShown) return;

    gameOverShown = true;

    let p1T = parseInt(document.getElementById(`s1-total`).innerText, 10);
    let p2T = parseInt(document.getElementById(`s2-total`).innerText, 10);
    let myT = playerNum === 1 ? p1T : p2T;
    let oppT = playerNum === 1 ? p2T : p1T;

    document.getElementById("game-over-title").innerText =
        myT > oppT ? (playerName === "りんかちゃん" ? "大好きだよ" : "かち") :
        myT < oppT ? "まけ" : "ひきわけ";

    document.getElementById("game-over-msg").innerText = `${myT} pt vs ${oppT} pt`;
    document.getElementById("game-over-overlay").style.display = 'flex';

    if (myT > 0) {
        const result = await saveScoreAndCheckTop15(myT);
        renderEndLeaderboardHighlight(result.rank, result.madeTop15);
    }
}

function loadHighScores() {
    onValue(ref(db, 'highscores'), (snap) => {
        let scores = [];
        if (snap.exists()) {
            snap.forEach(child => {
                let d = child.val();
                if (d && d.score) scores.push(d);
            });
        }

        scores.sort((a, b) => b.score - a.score);

        const list = document.getElementById("high-scores");
        if (list) {
            list.innerHTML = "";
            scores.slice(0, 15).forEach((s, i) => {
                let li = document.createElement("li");
                li.style.color = "#ffb7c5";
                li.style.marginBottom = "5px";
                li.innerText = `${i + 1}. ${s.date || '0.00.00'} - ${s.score}pt - ${s.name}`;
                list.appendChild(li);
            });
        }
    });
}

window.leaveRoom = () => location.reload();

window.requestRematch = async () => {
    document.getElementById("game-over-overlay").style.display = 'none';

    const rankMsg = document.getElementById("end-rank-msg");
    if (rankMsg) rankMsg.textContent = "";

    let empty = {};
    categories.forEach(c => empty[c] = 'ー');

    gameOverShown = false;
    scoreSaveInProgress = false;

    await update(ref(db, `rooms/${currentRoom}/p${playerNum}`), {
        scores: empty,
        yahtzeeBonuses: 0,
        scoreSaved: false
    });

    await update(ref(db, `rooms/${currentRoom}`), {
        turn: 1,
        rollsLeft: 3,
        dice: [1, 1, 1, 1, 1],
        held: [false, false, false, false, false]
    });
};
