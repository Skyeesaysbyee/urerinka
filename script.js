import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get, remove, push, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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
    listenToRoom(); loadHighScores();
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
    let isBonus = (isYz && playerData.scores['yz'] >= 50);
    if (isBonus && playerData.scores[currentDice[0]+'s'] === 'ー' && category !== currentDice[0]+'s') {
        alert("まず数字のボックスを埋めてください！"); return;
    }
    let score = calculateScore(category, currentDice, isBonus);
    playerData.scores[category] = score;
    if (isBonus) playerData.yahtzeeBonuses = (playerData.yahtzeeBonuses || 0) + 1;
    currentTurn = (playerNum === 1) ? 2 : 1;
    
    // Reset turn state and dice back to 1,1,1,1,1
    await update(ref(db, `rooms/${currentRoom}`), { 
        [`p${playerNum}`]: playerData, 
        turn: currentTurn, 
        rollsLeft: 3, 
        dice: [1,1,1,1,1], 
        held: [false,false,false,false,false] 
    });
    
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
    if (cat.endsWith('s')) return dice.filter(d => d === parseInt(cat[0])).reduce((a, b) => a + b, 0);
    if (joker) {
        if (cat === 'fh') return 25; if (cat === 'ss') return 30; if (cat === 'ls') return 40;
        if (cat === '3k' || cat === '4k' || cat === 'ch') return sum;
    }
    if (cat === '3k') return valArr.some(v => v >= 3) ? sum : 0;
    if (cat === '4k') return valArr.some(v => v >= 4) ? sum : 0;
    if (cat === 'ch') return sum;
    if (cat === 'yz') return valArr.some(v => v === 5) ? 50 : 0;
    if (cat === 'fh') return (valArr.includes(3) && valArr.includes(2)) || valArr.includes(5) ? 25 : 0;
    
    // NEW CHECKLIST STRAIGHT LOGIC
    let has = (n) => dice.includes(n);
    if (cat === 'ss') {
        let s1 = has(1) && has(2) && has(3) && has(4);
        let s2 = has(2) && has(3) && has(4) && has(5);
        let s3 = has(3) && has(4) && has(5) && has(6);
        return (s1 || s2 || s3) ? 30 : 0;
    }
    if (cat === 'ls') {
        let l1 = has(1) && has(2) && has(3) && has(4) && has(5);
        let l2 = has(2) && has(3) && has(4) && has(5) && has(6);
        return (l1 || l2) ? 40 : 0;
    }
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
    categories.forEach(c => {
        for (let p = 1; p <= 2; p++) {
            let pD = (p === playerNum) ? playerData : opponentData;
            let cell = document.getElementById(`s${p === playerNum ? playerNum : (playerNum === 1 ? 2 : 1)}-${c}`);
            let score = pD.scores[c];
            if (score !== 'ー') {
                cell.innerText = (c === 'yz' && pD.yahtzeeBonuses > 0) ? `50+${pD.yahtzeeBonuses*100}` : score;
                cell.style.color = "#fff";
                totals[p-1] += (typeof score === 'number' ? score : 0);
                if (['1s','2s','3s','4s','5s','6s'].includes(c)) uppers[p-1] += score;
            } else {
                if (p === playerNum && currentTurn === playerNum && rollsLeft < 3) {
                    let pot = calculateScore(c, currentDice, (currentDice.every(v => v === currentDice[0]) && playerData.scores['yz'] >= 50));
                    if (['ss','ls'].includes(c)) { 
                        cell.innerHTML = pot > 0 ? `<span style="color:#ffb7c5; opacity:0.6;">${pot}</span>` : 'ー';
                    } else {
                        cell.innerHTML = `<span style="color:#ffb7c5; opacity:0.6;">${pot}</span>`;
                    }
                } else { cell.innerText = 'ー'; cell.style.color = "#888"; }
            }
        }
    });
    let myB = uppers[0] >= 63 ? 35 : 0; let oppB = uppers[1] >= 63 ? 35 : 0;
    let myT = totals[0] + myB + (playerData.yahtzeeBonuses * 100);
    let oppT = totals[1] + oppB + (opponentData.yahtzeeBonuses * 100);
    document.getElementById(`s${playerNum}-bonus`).innerText = `${myB} (${Math.max(0, 63 - uppers[0])} のこり)`;
    document.getElementById(`s${playerNum === 1 ? 2 : 1}-bonus`).innerText = `${oppB} (${Math.max(0, 63 - uppers[1])} のこり)`;
    document.getElementById(`s${playerNum}-total`).innerText = myT;
    document.getElementById(`s${playerNum === 1 ? 2 : 1}-total`).innerText = oppT;
}

function checkGameOver() {
    if (categories.every(c => playerData.scores[c] !== 'ー' && opponentData.scores[c] !== 'ー')) {
        let myT = parseInt(document.getElementById(`s${playerNum}-total`).innerText);
        let oppT = parseInt(document.getElementById(`s${playerNum === 1 ? 2 : 1}-total`).innerText);
        let msg = myT > oppT ? (playerName === "りんかちゃん" ? "大好きだよ" : "かち") : (myT < oppT ? "まけ" : "引き分け！");
        document.getElementById("game-over-title").innerText = msg;
        document.getElementById("game-over-msg").innerText = `${myT} pt vs ${oppT} pt`;
        document.getElementById("game-over-overlay").style.display = 'flex';
        if (myT > 0 && !playerData.scoreSaved) {
            const d = new Date();
            push(ref(db, 'highscores'), { name: playerName, score: myT, date: `${d.getMonth()+1}.${d.getDate().toString().padStart(2,'0')}.${d.getFullYear().toString().slice(-2)}` });
            playerData.scoreSaved = true;
            update(ref(db, `rooms/${currentRoom}/p${playerNum}`), { scoreSaved: true });
        }
    }
}

function loadHighScores() {
    onValue(ref(db, 'highscores'), (snap) => {
        let scores = []; snap.forEach(c => scores.push(c.val()));
        scores.sort((a, b) => b.score - a.score);
        const list = document.getElementById("high-scores"); list.innerHTML = "";
        scores.slice(0, 15).forEach(s => {
            let li = document.createElement("li"); li.innerText = `${s.date || '0.00.00'} - ${s.score}pt - ${s.name}`;
            list.appendChild(li);
        });
    });
}

window.requestRematch = async function() {
    document.getElementById("game-over-overlay").style.display = 'none';
    let empty = {}; categories.forEach(c => empty[c] = 'ー');
    await update(ref(db, `rooms/${currentRoom}`), { [`p${playerNum}`]: { name: playerName, scores: empty, yahtzeeBonuses: 0, scoreSaved: false, ready: true }, turn: 1, rollsLeft: 3, dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false] });
};
