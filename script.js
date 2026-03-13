import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get, remove, push, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

// Layout fix for table borders
document.head.insertAdjacentHTML("beforeend", `<style>th:nth-child(2), td:nth-child(2) { border-left: 2px solid #333; }</style>`);

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

let currentRoom = null; let playerNum = null; let playerName = "";
let currentTurn = 1; let rollsLeft = 3;
let currentDice = [1, 1, 1, 1, 1]; let heldDice = [false, false, false, false, false];
let playerData = { scores: {}, yahtzeeBonuses: 0 }; let opponentData = { scores: {}, yahtzeeBonuses: 0 };
const categories = ['1s', '2s', '3s', '4s', '5s', '6s', '3k', '4k', 'fh', 'ss', 'ls', 'yz', 'ch'];

// Load ranks on home screen immediately
loadHighScores();

window.handleLogin = async function() {
    playerName = document.getElementById("player-name").value.trim();
    let roomInput = document.getElementById("room-id-input").value.trim();
    if (!playerName || !roomInput) { alert("入力してください！"); return; }
    currentRoom = roomInput;
    const roomRef = ref(db, `rooms/${currentRoom}`);
    const snapshot = await get(roomRef);
    let empty = {}; categories.forEach(c => empty[c] = 'ー');
    if (!snapshot.exists()) {
        playerNum = 1; playerData = { name: playerName, scores: empty, yahtzeeBonuses: 0, ready: true };
        await set(roomRef, { p1: playerData, turn: 1, rollsLeft: 3, dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false] });
    } else {
        const data = snapshot.val();
        playerNum = !data.p2 ? 2 : (!data.p1 ? 1 : null);
        if (!playerNum) { alert("満員です！"); return; }
        playerData = { name: playerName, scores: empty, yahtzeeBonuses: 0, ready: true };
        await update(roomRef, { [`p${playerNum}`]: playerData });
    }
    onDisconnect(ref(db, `rooms/${currentRoom}/p${playerNum}`)).remove();
    document.getElementById("start-screen").style.display = "none";
    document.getElementById("game-screen").style.display = "block";
    document.getElementById("room-display").innerText = `ルーム: ${currentRoom}`;
    listenToRoom();
};

window.leaveRoom = async function() {
    if (currentRoom) {
        const roomRef = ref(db, `rooms/${currentRoom}`);
        await update(roomRef, { [`p${playerNum}`]: null });
        const snap = await get(roomRef);
        if (snap.exists() && !snap.val().p1 && !snap.val().p2) await remove(roomRef);
    }
    location.reload(); 
};

window.rollDice = async function() {
    if (currentTurn !== playerNum || rollsLeft <= 0) return;
    let target = null;
    for (let i = 0; i < 5; i++) { if (heldDice[i]) { target = currentDice[i]; break; } }
    for (let i = 0; i < 5; i++) {
        if (!heldDice[i]) {
            let roll = Math.floor(Math.random() * 6) + 1;
            if (target !== null && Math.random() < 0.10) roll = target;
            currentDice[i] = roll;
        }
    }
    rollsLeft--;
    await update(ref(db, `rooms/${currentRoom}`), { dice: currentDice, rollsLeft: rollsLeft });
};

window.toggleHold = async function(i) {
    if (currentTurn !== playerNum || rollsLeft === 3) return;
    heldDice[i] = !heldDice[i];
    await update(ref(db, `rooms/${currentRoom}`), { held: heldDice });
};

window.attemptScore = async function(category) {
    if (currentTurn !== playerNum || playerData.scores[category] !== 'ー') return;
    let isYz = currentDice.every(v => v === currentDice[0]);
    let isBonus = (isYz && (playerData.scores['yz'] === 50));
    if (isBonus && playerData.scores[currentDice[0]+'s'] === 'ー' && category !== currentDice[0]+'s') {
        alert("まず数字のボックスを埋めてください！"); return;
    }
    let score = calculateScore(category, currentDice, isBonus);
    playerData.scores[category] = score;
    if (isBonus) playerData.yahtzeeBonuses = (playerData.yahtzeeBonuses || 0) + 1;
    currentTurn = (playerNum === 1) ? 2 : 1;
    await update(ref(db, `rooms/${currentRoom}`), { [`p${playerNum}`]: playerData, turn: currentTurn, rollsLeft: 3, dice: [1,1,1,1,1], held: [false,false,false,false,false] });
    
    if (score >= 25 && isYz) {
        let msg = playerName === "りんかちゃん" ? "えらいね！" : "すごい！";
        document.getElementById('celeb-overlay').innerHTML = `<div class="celeb-content"><h1 style="color:#ffb7c5;">Y A H T Z E E</h1><p style="color:white;">${msg}</p></div>`;
        document.getElementById('celeb-overlay').style.display = 'flex';
        setTimeout(() => document.getElementById('celeb-overlay').style.display = 'none', 3000);
    }
};

function calculateScore(cat, dice, joker) {
    let counts = {}; dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
    let valArr = Object.values(counts);
    let sum = dice.reduce((a, b) => a + b, 0);
    let has = (n) => dice.includes(n);

    if (cat === 'ss') {
        if (joker) return 30;
        if ((has(1)&&has(2)&&has(3)&&has(4)) || (has(2)&&has(3)&&has(4)&&has(5)) || (has(3)&&has(4)&&has(5)&&has(6))) return 30;
        return 0;
    }
    if (cat === 'ls') {
        if (joker) return 40;
        if ((has(1)&&has(2)&&has(3)&&has(4)&&has(5)) || (has(2)&&has(3)&&has(4)&&has(5)&&has(6))) return 40;
        return 0;
    }
    if (cat === 'fh') {
        if (joker) return 25;
        return (valArr.includes(3) && valArr.includes(2)) ? 25 : 0;
    }
    if (cat.endsWith('s')) return dice.filter(d => d === parseInt(cat[0])).reduce((a, b) => a + b, 0);
    if (cat === '3k') return valArr.some(v => v >= 3) ? sum : 0;
    if (cat === '4k') return valArr.some(v => v >= 4) ? sum : 0;
    if (cat === 'ch') return sum;
    if (cat === 'yz') return valArr.some(v => v === 5) ? 50 : 0;
    return 0;
}

function listenToRoom() {
    onValue(ref(db, `rooms/${currentRoom}`), (snap) => {
        const data = snap.val(); if (!data) return;
        currentTurn = data.turn; rollsLeft = data.rollsLeft;
        currentDice = data.dice || [1,1,1,1,1]; heldDice = data.held || [false,false,false,false,false];
        playerData = (playerNum === 1 ? data.p1 : data.p2) || { scores: {}, yahtzeeBonuses: 0 };
        opponentData = (playerNum === 1 ? data.p2 : data.p1) || { scores: {}, yahtzeeBonuses: 0 };
        updateUI(); checkGameOver();
    });
}

function updateUI() {
    document.getElementById("turn-display").innerText = currentTurn === playerNum ? "あなたの番" : "あいての番";
    document.getElementById("roll-count").innerText = `のこり: ${rollsLeft}番`;
    document.getElementById("roll-btn").disabled = (currentTurn !== playerNum || rollsLeft <= 0);
    for (let i = 0; i < 5; i++) {
        const die = document.getElementById(`die-${i}`);
        die.innerText = ['一','二','三','四','五','六'][currentDice[i]-1];
        die.className = heldDice[i] ? "dice held" : "dice";
    }
    document.getElementById("p1-label").innerText = playerNum === 1 ? playerName : (opponentData.name || "P2");
    document.getElementById("p2-label").innerText = playerNum === 2 ? playerName : (opponentData.name || "P1");
    
    let totals = [0, 0], uppers = [0, 0];
    let isYz = currentDice.every(v => v === currentDice[0]);
    let isBonus = (isYz && (playerData.scores['yz'] === 50));

    categories.forEach(c => {
        for (let p = 1; p <= 2; p++) {
            let pD = (p === playerNum) ? playerData : opponentData;
            let displaySide = (p === playerNum) ? playerNum : (playerNum === 1 ? 2 : 1);
            let cell = document.getElementById(`s${displaySide}-${c}`);
            let score = pD.scores[c];
            if (score !== 'ー') {
                cell.innerText = (c === 'yz' && pD.yahtzeeBonuses > 0) ? `50+${pD.yahtzeeBonuses*100}` : score;
                cell.style.color = "#fff";
                totals[p-1] += (typeof score === 'number' ? score : 0);
                if (['1s','2s','3s','4s','5s','6s'].includes(c)) uppers[p-1] += score;
            } else {
                if (p === playerNum && currentTurn === playerNum && rollsLeft < 3) {
                    cell.innerHTML = `<span style="color:#ffb7c5; opacity:0.6;">${calculateScore(c, currentDice, isBonus)}</span>`;
                } else { cell.innerText = 'ー'; cell.style.color = "#888"; }
            }
        }
    });
    
    let p1Upper = (playerNum === 1) ? uppers[0] : uppers[1];
    let p2Upper = (playerNum === 2) ? uppers[0] : uppers[1];
    let b1 = p1Upper >= 63 ? 35 : 0;
    let b2 = p2Upper >= 63 ? 35 : 0;

    document.getElementById(`s1-bonus`).innerText = b1 === 35 ? "35" : `0 (${63 - p1Upper} のこり)`;
    document.getElementById(`s2-bonus`).innerText = b2 === 35 ? "35" : `0 (${63 - p2Upper} のこり)`;

    let p1Total = (playerNum === 1 ? totals[0] : totals[1]) + b1 + ((playerNum === 1 ? playerData.yahtzeeBonuses : opponentData.yahtzeeBonuses) * 100);
    let p2Total = (playerNum === 2 ? totals[0] : totals[1]) + b2 + ((playerNum === 2 ? playerData.yahtzeeBonuses : opponentData.yahtzeeBonuses) * 100);

    document.getElementById(`s1-total`).innerText = p1Total;
    document.getElementById(`s2-total`).innerText = p2Total;
}

function checkGameOver() {
    if (categories.every(c => playerData.scores[c] !== 'ー' && (opponentData.scores && opponentData.scores[c] !== 'ー'))) {
        let myT = parseInt(document.getElementById(`s${playerNum}-total`).innerText);
        let oppT = parseInt(document.getElementById(`s${playerNum === 1 ? 2 : 1}-total`).innerText);

        let msg = myT > oppT ? (playerName === "りんかちゃん" ? "大好きだよ" : "かち") : (myT < oppT ? "まけ" : "引き分け！");
        document.getElementById("game-over-title").innerText = msg;
        document.getElementById("game-over-msg").innerText = `${myT} pt vs ${oppT} pt`;
        document.getElementById("game-over-overlay").style.display = 'flex';
        
        if (myT > 0 && !playerData.scoreSaved) {
            const d = new Date();
            const dateStr = `${d.getMonth()+1}.${d.getDate().toString().padStart(2,'0')}.${d.getFullYear().toString().slice(-2)}`;
            
            push(ref(db, 'highscores'), { name: playerName, score: myT, date: dateStr }).then(() => {
                playerData.scoreSaved = true;
                update(ref(db, `rooms/${currentRoom}/p${playerNum}`), { scoreSaved: true });
            });
        }
    }
}

function loadHighScores() {
    onValue(ref(db, 'highscores'), (snap) => {
        let scores = []; snap.forEach(c => scores.push(c.val()));
        scores.sort((a, b) => b.score - a.score);
        const list = document.getElementById("high-scores");
        if (list) {
            list.innerHTML = "";
            scores.slice(0, 15).forEach(s => {
                let li = document.createElement("li");
                li.innerText = `${s.date || '0.00.00'} - ${s.score}pt - ${s.name}`;
                list.appendChild(li);
            });
        }
    });
}

window.requestRematch = async function() {
    document.getElementById("game-over-overlay").style.display = 'none';
    let empty = {}; categories.forEach(c => empty[c] = 'ー');
    await update(ref(db, `rooms/${currentRoom}`), { [`p${playerNum}`]: { name: playerName, scores: empty, yahtzeeBonuses: 0, scoreSaved: false, ready: true }, turn: 1, rollsLeft: 3, dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false] });
};

// DEBUG TEST FUNCTION
window.testSave = async function() {
    const d = new Date();
    const dateStr = `${d.getMonth()+1}.${d.getDate().toString().padStart(2,'0')}.${d.getFullYear().toString().slice(-2)}`;
    try {
        await push(ref(db, 'highscores'), {
            name: playerName || "w",
            score: 999,
            date: dateStr
        });
        alert("✅ Firebase Save Worked! Check the leaderboard.");
    } catch (e) {
        alert("❌ Save Failed: " + e.message);
    }
};
