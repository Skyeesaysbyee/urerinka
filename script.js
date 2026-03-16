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
let currentRoom = null; let playerNum = null; let playerName = "";
let currentTurn = 1; let rollsLeft = 3;
let currentDice = [1, 1, 1, 1, 1]; let heldDice = [false, false, false, false, false];
let p1Data = { name: "P1", scores: {}, yahtzeeBonuses: 0 };
let p2Data = { name: "P2", scores: {}, yahtzeeBonuses: 0 };
const categories = ['1s', '2s', '3s', '4s', '5s', '6s', '3k', '4k', 'fh', 'ss', 'ls', 'yz', 'ch'];

// --- INITIAL LOAD ---
document.addEventListener("DOMContentLoaded", () => {
    loadHighScores();
});

// --- NAVIGATION ---
window.openGame = function(gameId) {
    if (gameId === 'yahtzee') {
        document.getElementById("home-hub").style.display = "none";
        document.getElementById("start-screen").style.display = "block";
    }
};

window.goBack = function() {
    document.getElementById("home-hub").style.display = "block";
    document.getElementById("start-screen").style.display = "none";
};

// --- CORE GAME FUNCTIONS ---
window.handleLogin = async function() {
    playerName = document.getElementById("player-name").value.trim();
    let roomInput = document.getElementById("room-id-input").value.trim();
    if (!playerName || !roomInput) { alert("入力してください！"); return; }
    currentRoom = roomInput;
    const roomRef = ref(db, `rooms/${currentRoom}`);
    const snapshot = await get(roomRef);
    let empty = {}; categories.forEach(c => empty[c] = 'ー');
    
    if (!snapshot.exists()) {
        playerNum = 1; 
        p1Data = { name: playerName, scores: empty, yahtzeeBonuses: 0, ready: true };
        await set(roomRef, { p1: p1Data, turn: 1, rollsLeft: 3, dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false] });
    } else {
        const data = snapshot.val();
        playerNum = !data.p2 ? 2 : (!data.p1 ? 1 : null);
        if (!playerNum) { alert("満員です！"); return; }
        let newPlayerData = { name: playerName, scores: empty, yahtzeeBonuses: 0, ready: true };
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
        if (!heldDice[i]) currentDice[i] = Math.floor(Math.random() * 6) + 1;
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
    let myData = playerNum === 1 ? p1Data : p2Data;
    if (currentTurn !== playerNum || myData.scores[category] !== 'ー') return;
    
    let isYz = currentDice.every(v => v === currentDice[0]);
    let hasYzScore = (myData.scores['yz'] === 50);
    let isJoker = (isYz && hasYzScore);

    if (isJoker && myData.scores[currentDice[0]+'s'] === 'ー' && category !== currentDice[0]+'s') {
        alert("まず数字のボックスを埋めてください！"); return;
    }

    let score = calculateScore(category, currentDice, isJoker);
    myData.scores[category] = score;
    if (isJoker) myData.yahtzeeBonuses = (myData.yahtzeeBonuses || 0) + 1;
    
    currentTurn = (playerNum === 1) ? 2 : 1;
    await update(ref(db, `rooms/${currentRoom}`), { 
        [`p${playerNum}`]: myData, 
        turn: currentTurn, 
        rollsLeft: 3, 
        dice: [1,1,1,1,1], 
        held: [false,false,false,false,false] 
    });
};

function calculateScore(cat, dice, joker) {
    let counts = {}; dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
    let valArr = Object.values(counts);
    let sum = dice.reduce((a, b) => a + b, 0);
    let has = (n) => dice.includes(n);

    if (joker) {
        if (cat === 'fh') return 25; 
        if (cat === 'ss') return 30; 
        if (cat === 'ls') return 40;
        if (cat === '3k' || cat === '4k' || cat === 'ch') return sum;
    }

    if (cat === 'ss') {
        if ((has(1)&&has(2)&&has(3)&&has(4)) || (has(2)&&has(3)&&has(4)&&has(5)) || (has(3)&&has(4)&&has(5)&&has(6))) return 30;
        return 0;
    }
    if (cat === 'ls') {
        if ((has(1)&&has(2)&&has(3)&&has(4)&&has(5)) || (has(2)&&has(3)&&has(4)&&has(5)&&has(6))) return 40;
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
    onValue(ref(db, `rooms/${currentRoom}`), (snap) => {
        const data = snap.val(); if (!data) return;
        currentTurn = data.turn; rollsLeft = data.rollsLeft;
        currentDice = data.dice || [1,1,1,1,1]; heldDice = data.held || [false,false,false,false,false];
        p1Data = data.p1 || { name: "P1", scores: {}, yahtzeeBonuses: 0 };
        p2Data = data.p2 || { name: "P2", scores: {}, yahtzeeBonuses: 0 };
        updateUI(); checkGameOver();
    });
}

function updateUI() {
    if (document.getElementById("game-screen").style.display === "none") return;
    document.getElementById("turn-display").innerText = currentTurn === playerNum ? "あなたの番" : "あいての番";
    document.getElementById("roll-count").innerText = `のこり: ${rollsLeft}番`;
    document.getElementById("roll-btn").disabled = (currentTurn !== playerNum || rollsLeft <= 0);
    for (let i = 0; i < 5; i++) {
        const die = document.getElementById(`die-${i}`);
        die.innerText = ['一','二','三','四','五','六'][currentDice[i]-1];
        die.className = heldDice[i] ? "dice held" : "dice";
    }

    document.getElementById("p1-label").innerText = p1Data.name;
    document.getElementById("p2-label").innerText = p2Data.name;
    
    let p1Upper = 0, p2Upper = 0;
    let p1Lower = 0, p2Lower = 0;
    let isYz = currentDice.every(v => v === currentDice[0]);

    categories.forEach(c => {
        // P1 Column
        let cell1 = document.getElementById(`s1-${c}`);
        let score1 = p1Data.scores[c];
        let joker1 = (isYz && p1Data.scores['yz'] === 50);
        if (score1 !== undefined && score1 !== 'ー') {
            cell1.innerText = (c === 'yz' && p1Data.yahtzeeBonuses > 0) ? `50+${p1Data.yahtzeeBonuses*100}` : score1;
            cell1.style.color = "#fff";
            let val = typeof score1 === 'number' ? score1 : 0;
            if (['1s','2s','3s','4s','5s','6s'].includes(c)) p1Upper += val; else p1Lower += val;
        } else {
            if (playerNum === 1 && currentTurn === 1 && rollsLeft < 3) {
                cell1.innerHTML = `<span style="color:#ffb7c5; opacity:0.6;">${calculateScore(c, currentDice, joker1)}</span>`;
            } else { cell1.innerText = 'ー'; cell1.style.color = "#888"; }
        }

        // P2 Column
        let cell2 = document.getElementById(`s2-${c}`);
        let score2 = p2Data.scores[c];
        let joker2 = (isYz && p2Data.scores['yz'] === 50);
        if (score2 !== undefined && score2 !== 'ー') {
            cell2.innerText = (c === 'yz' && p2Data.yahtzeeBonuses > 0) ? `50+${p2Data.yahtzeeBonuses*100}` : score2;
            cell2.style.color = "#fff";
            let val = typeof score2 === 'number' ? score2 : 0;
            if (['1s','2s','3s','4s','5s','6s'].includes(c)) p2Upper += val; else p2Lower += val;
        } else {
            if (playerNum === 2 && currentTurn === 2 && rollsLeft < 3) {
                cell2.innerHTML = `<span style="color:#ffb7c5; opacity:0.6;">${calculateScore(c, currentDice, joker2)}</span>`;
            } else { cell2.innerText = 'ー'; cell2.style.color = "#888"; }
        }
    });
    
    let b1 = p1Upper >= 63 ? 35 : 0; let b2 = p2Upper >= 63 ? 35 : 0;
    let finalP1 = p1Upper + b1 + p1Lower + ((p1Data.yahtzeeBonuses || 0) * 100);
    let finalP2 = p2Upper + b2 + p2Lower + ((p2Data.yahtzeeBonuses || 0) * 100);
    document.getElementById(`s1-bonus`).innerText = `${b1} (${Math.max(0, 63 - p1Upper)} のこり)`;
    document.getElementById(`s2-bonus`).innerText = `${b2} (${Math.max(0, 63 - p2Upper)} のこり)`;
    document.getElementById(`s1-total`).innerText = finalP1;
    document.getElementById(`s2-total`).innerText = finalP2;
}

function checkGameOver() {
    if (!p1Data.scores || !p2Data.scores) return;
    const allDone = categories.every(c => p1Data.scores[c] !== 'ー' && p2Data.scores[c] !== 'ー');
    if (allDone) {
        let p1T = parseInt(document.getElementById(`s1-total`).innerText);
        let p2T = parseInt(document.getElementById(`s2-total`).innerText);
        let myT = playerNum === 1 ? p1T : p2T;
        let oppT = playerNum === 1 ? p2T : p1T;
        document.getElementById("game-over-title").innerText = myT > oppT ? (playerName === "りんかちゃん" ? "大好きだよ" : "かち") : "まけ";
        document.getElementById("game-over-msg").innerText = `${myT} pt vs ${oppT} pt`;
        document.getElementById("game-over-overlay").style.display = 'flex';
        
        let myData = playerNum === 1 ? p1Data : p2Data;
        if (myT > 0 && !myData.scoreSaved) {
            myData.scoreSaved = true;
            const d = new Date();
            const dateStr = `${d.getMonth()+1}.${d.getDate().toString().padStart(2,'0')}.${d.getFullYear().toString().slice(-2)}`;
            push(ref(db, 'highscores'), { name: playerName, score: myT, date: dateStr }).then(() => {
                update(ref(db, `rooms/${currentRoom}/p${playerNum}`), { scoreSaved: true });
            });
        }
    }
}

function loadHighScores() {
    onValue(ref(db, 'highscores'), (snap) => {
        let scores = [];
        if (snap.exists()) snap.forEach(child => { 
            let d = child.val();
            if (d && d.score) scores.push(d);
        });
        scores.sort((a, b) => b.score - a.score);
        const list = document.getElementById("high-scores");
        if (list) {
            list.innerHTML = "";
            scores.slice(0, 15).forEach(s => {
                let li = document.createElement("li");
                li.style.color = "#ffb7c5";
                li.style.marginBottom = "5px";
                li.innerText = `${s.date || '0.00.00'} - ${s.score}pt - ${s.name}`;
                list.appendChild(li);
            });
        }
    });
}

window.leaveRoom = () => location.reload();
window.requestRematch = async () => {
    document.getElementById("game-over-overlay").style.display = 'none';
    let empty = {}; categories.forEach(c => empty[c] = 'ー');
    await update(ref(db, `rooms/${currentRoom}/p${playerNum}`), { scores: empty, yahtzeeBonuses: 0, scoreSaved: false });
    await update(ref(db, `rooms/${currentRoom}`), { turn: 1, rollsLeft: 3, dice: [1,1,1,1,1], held:[false,false,false,false,false] });
};
