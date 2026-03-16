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
// We now track p1Data and p2Data explicitly
let p1Data = { name: "P1", scores: {}, yahtzeeBonuses: 0 };
let p2Data = { name: "P2", scores: {}, yahtzeeBonuses: 0 };
const categories = ['1s', '2s', '3s', '4s', '5s', '6s', '3k', '4k', 'fh', 'ss', 'ls', 'yz', 'ch'];

// Load rankings immediately
loadHighScores();

// --- NAVIGATION LOGIC ---
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

// --- GAME LOGIC ---
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
        if (playerNum === 1) p1Data = newPlayerData; else p2Data = newPlayerData;
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
    // Determine which data belongs to the person clicking
    let myData = playerNum === 1 ? p1Data : p2Data;

    if (currentTurn !== playerNum || myData.scores[category] !== 'ー') return;
    
    let isYz = currentDice.every(v => v === currentDice[0]);
    let isBonus = (isYz && (myData.scores['yz'] === 50));
    
    if (isBonus && myData.scores[currentDice[0]+'s'] === 'ー' && category !== currentDice[0]+'s') {
        alert("まず数字のボックスを埋めてください！"); return;
    }

    let score = calculateScore(category, currentDice, isBonus);
    myData.scores[category] = score;
    
    if (isBonus) myData.yahtzeeBonuses = (myData.yahtzeeBonuses || 0) + 1;
    
    currentTurn = (playerNum === 1) ? 2 : 1;
    await update(ref(db, `rooms/${currentRoom}`), { 
        [`p${playerNum}`]: myData, 
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
    let has = (n) => dice.includes(n);

    if (joker) {
        if (cat === 'fh') return 25; 
        if (cat === 'ss') return 30; 
        if (cat === 'ls') return 40;
        if (cat === '3k' || cat === '4k' || cat === 'ch') return sum;
    }

    if (cat === 'ss') {
        if ((has(1)&&has(2)&&has(3)&&has(4)) || (has(2)&&has(3)&&has(4)&&has(5)) || (has(3)&&has(4)&&has(5)&&has(6))) return 30;
    }
    if (cat === 'ls') {
        if ((has(1)&&has(2)&&has(3)&&has(4)&&has(5)) || (has(2)&&has(3)&&has(4)&&has(5)&&has(6))) return 40;
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
        
        // Explicitly grab P1 and P2 data. Default if they haven't joined.
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

    // P1 is always left. P2 is always right.
    document.getElementById("p1-label").innerText = p1Data.name;
    document.getElementById("p2-label").innerText = p2Data.name;
    
    let p1Upper = 0, p2Upper = 0;
    let p1Total = 0, p2Total = 0;

    let isYz = currentDice.every(v => v === currentDice[0]);
    let myData = playerNum === 1 ? p1Data : p2Data;
    let isBonus = (isYz && myData.scores['yz'] === 50);

    categories.forEach(c => {
        // --- Process P1 (Left Column) ---
        let cell1 = document.getElementById(`s1-${c}`);
        let score1 = p1Data.scores[c];
        
        if (score1 !== undefined && score1 !== 'ー') {
            cell1.innerText = (c === 'yz' && p1Data.yahtzeeBonuses > 0) ? `50+${p1Data.yahtzeeBonuses*100}` : score1;
            cell1.style.color = "#fff";
            p1Total += (typeof score1 === 'number' ? score1 : 0);
            if (['1s','2s','3s','4s','5s','6s'].includes(c)) p1Upper += score1;
        } else {
            // Show hints ONLY if it is P1's turn, P1 is looking, and dice have been rolled
            if (playerNum === 1 && currentTurn === 1 && rollsLeft < 3) {
                cell1.innerHTML = `<span style="color:#ffb7c5; opacity:0.6;">${calculateScore(c, currentDice, isBonus)}</span>`;
            } else {
                cell1.innerText = 'ー'; cell1.style.color = "#888";
            }
        }

        // --- Process P2 (Right Column) ---
        let cell2 = document.getElementById(`s2-${c}`);
        let score2 = p2Data.scores[c];
        
        if (score2 !== undefined && score2 !== 'ー') {
            cell2.innerText = (c === 'yz' && p2Data.yahtzeeBonuses > 0) ? `50+${p2Data.yahtzeeBonuses*100}` : score2;
            cell2.style.color = "#fff";
            p2Total += (typeof score2 === 'number' ? score2 : 0);
            if (['1s','2s','3s','4s','5s','6s'].includes(c)) p2Upper += score2;
        } else {
             // Show hints ONLY if it is P2's turn, P2 is looking, and dice have been rolled
            if (playerNum === 2 && currentTurn === 2 && rollsLeft < 3) {
                cell2.innerHTML = `<span style="color:#ffb7c5; opacity:0.6;">${calculateScore(c, currentDice, isBonus)}</span>`;
            } else {
                cell2.innerText = 'ー'; cell2.style.color = "#888";
            }
        }
    });
    
    // Calculate 63-point Upper Section Bonuses
    let b1 = p1Upper >= 63 ? 35 : 0; 
    let b2 = p2Upper >= 63 ? 35 : 0;
    
    // Add bonuses to total
    p1Total += b1 + ((p1Data.yahtzeeBonuses || 0) * 100);
    p2Total += b2 + ((p2Data.yahtzeeBonuses || 0) * 100);
    
    // Update Bonus UI
    document.getElementById(`s1-bonus`).innerText = `${b1} (${Math.max(0, 63 - p1Upper)} のこり)`;
    document.getElementById(`s2-bonus`).innerText = `${b2} (${Math.max(0, 63 - p2Upper)} のこり)`;
    
    // Update Total UI
    document.getElementById(`s1-total`).innerText = p1Total;
    document.getElementById(`s2-total`).innerText = p2Total;
}

function checkGameOver() {
    if (!p1Data.scores || !p2Data.scores) return; // Prevent crash if a player hasn't joined
    
    const allDone = categories.every(c => p1Data.scores[c] !== 'ー' && p2Data.scores[c] !== 'ー');
    
    if (allDone) {
        let p1T = parseInt(document.getElementById(`s1-total`).innerText);
        let p2T = parseInt(document.getElementById(`s2-total`).innerText);
        
        let myT = playerNum === 1 ? p1T : p2T;
        let oppT = playerNum === 1 ? p2T : p1T;

        let msg = myT > oppT ? (playerName === "りんかちゃん" ? "大好きだよ" : "かち") : (myT < oppT ? "まけ" : "引き分け！");
        document.getElementById("game-over-title").innerText = msg;
        document.getElementById("game-over-msg").innerText = `${myT} pt vs ${oppT} pt`;
        document.getElementById("game-over-overlay").style.display = 'flex';
        
        let myData = playerNum === 1 ? p1Data : p2Data;
        if (myT > 0 && !myData.scoreSaved) {
            const d = new Date();
            const dateStr = `${d.getMonth()+1}.${d.getDate().toString().padStart(2,'0')}.${d.getFullYear().toString().slice(-2)}`;
            const scoresRef = ref(db, 'highscores');
            push(scoresRef, { name: playerName, score: myT, date: dateStr }).then(() => {
                myData.scoreSaved = true;
                update(ref(db, `rooms/${currentRoom}/p${playerNum}`), { scoreSaved: true });
            });
        }
    }
}

function loadHighScores() {
    const scoresRef = ref(db, 'highscores');
    onValue(scoresRef, (snap) => {
        let scores = [];
        if (snap.exists()) { snap.forEach(child => { scores.push(child.val()); }); }
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

window.requestRematch = async function() {
    document.getElementById("game-over-overlay").style.display = 'none';
    let empty = {}; categories.forEach(c => empty[c] = 'ー');
    
    // Reset my own data
    let myData = playerNum === 1 ? p1Data : p2Data;
    myData.scores = empty;
    myData.yahtzeeBonuses = 0;
    myData.scoreSaved = false;
    
    await update(ref(db, `rooms/${currentRoom}`), { 
        [`p${playerNum}`]: myData, 
        turn: 1, 
        rollsLeft: 3, 
        dice: [1, 1, 1, 1, 1], 
        held: [false, false, false, false, false] 
    });
};
