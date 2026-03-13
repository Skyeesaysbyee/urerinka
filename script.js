import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get, remove, push, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

document.head.insertAdjacentHTML("beforeend", `<style>
    th:nth-child(2), td:nth-child(2) { border-left: 2px solid #333; }
</style>`);

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

let currentRoom = null;
let playerNum = null; 
let playerName = "";
let currentTurn = 1;
let rollsLeft = 3;
let currentDice = [1, 1, 1, 1, 1];
let heldDice = [false, false, false, false, false];

let playerData = { scores: {}, yahtzeeBonuses: 0 };
let opponentData = { scores: {}, yahtzeeBonuses: 0 };

const categories = ['1s', '2s', '3s', '4s', '5s', '6s', '3k', '4k', 'fh', 'ss', 'ls', 'yz', 'ch'];

window.handleLogin = async function() {
    playerName = document.getElementById("player-name").value.trim();
    let roomInput = document.getElementById("room-id-input").value.trim();

    if (!playerName) { alert("名前を入力してください！"); return; }
    if (!roomInput) { alert("ルームIDを入力してください！"); return; }

    currentRoom = roomInput;
    const roomRef = ref(db, `rooms/${currentRoom}`);
    const snapshot = await get(roomRef);

    let emptyScores = {};
    categories.forEach(c => emptyScores[c] = 'ー');

    if (!snapshot.exists()) {
        playerNum = 1;
        playerData = { name: playerName, scores: emptyScores, yahtzeeBonuses: 0, ready: true };
        await set(roomRef, {
            p1: playerData,
            turn: 1,
            rollsLeft: 3,
            dice: [1, 1, 1, 1, 1],
            held: [false, false, false, false, false]
        });
    } else {
        const data = snapshot.val();
        if (!data.p2) {
            playerNum = 2;
            playerData = { name: playerName, scores: emptyScores, yahtzeeBonuses: 0, ready: true };
            await update(roomRef, { p2: playerData });
        } else if (!data.p1) {
            playerNum = 1;
            playerData = { name: playerName, scores: emptyScores, yahtzeeBonuses: 0, ready: true };
            await update(roomRef, { p1: playerData });
        } else {
            alert("このルームは満員です！");
            return;
        }
    }

    const myPlayerRef = ref(db, `rooms/${currentRoom}/p${playerNum}`);
    onDisconnect(myPlayerRef).remove().then(() => {});

    document.getElementById("start-screen").style.display = "none";
    document.getElementById("game-screen").style.display = "block";
    document.getElementById("room-display").innerText = `ルーム: ${currentRoom}`;

    listenToRoom();
    loadHighScores();
};

window.leaveRoom = async function() {
    if (currentRoom) {
        const roomRef = ref(db, `rooms/${currentRoom}`);
        if (playerNum === 1) await update(roomRef, { p1: null });
        if (playerNum === 2) await update(roomRef, { p2: null });
        const snap = await get(roomRef);
        if (snap.exists() && !snap.val().p1 && !snap.val().p2) await remove(roomRef);
    }
    location.reload(); 
};

window.rollDice = async function() {
    if (currentTurn !== playerNum || rollsLeft <= 0) return;
    let targetNum = null;
    for (let i = 0; i < 5; i++) { if (heldDice[i]) { targetNum = currentDice[i]; break; } }
    for (let i = 0; i < 5; i++) {
        if (!heldDice[i]) {
            let roll = Math.floor(Math.random() * 6) + 1;
            if (targetNum !== null && Math.random() < 0.10) roll = targetNum;
            currentDice[i] = roll;
        }
    }
    rollsLeft--;
    await update(ref(db, `rooms/${currentRoom}`), { dice: currentDice, rollsLeft: rollsLeft });
};

window.toggleHold = async function(index) {
    if (currentTurn !== playerNum || rollsLeft === 3) return;
    heldDice[index] = !heldDice[index];
    await update(ref(db, `rooms/${currentRoom}`), { held: heldDice });
};

window.attemptScore = async function(category) {
    if (currentTurn !== playerNum) return;
    if (playerData.scores[category] !== 'ー') return;

    let isYahtzee = currentDice.every(v => v === currentDice[0]);
    let targetNum = currentDice[0];
    let upperCategory = targetNum + 's';
    let isYahtzeeBonus = (isYahtzee && playerData.scores['yz'] >= 50);

    if (isYahtzeeBonus && playerData.scores[upperCategory] === 'ー' && category !== upperCategory) {
        alert(`ボーナスルール: まず ${targetNum} のボックスを埋めてください！`);
        return;
    }

    let score = calculateScore(category, currentDice, isYahtzeeBonus);
    playerData.scores[category] = score;
    if (isYahtzeeBonus) playerData.yahtzeeBonuses = (playerData.yahtzeeBonuses || 0) + 1;

    currentTurn = (playerNum === 1) ? 2 : 1;
    rollsLeft = 3;
    heldDice = [false, false, false, false, false];

    await update(ref(db, `rooms/${currentRoom}`), {
        [`p${playerNum}`]: playerData,
        turn: currentTurn,
        rollsLeft: 3,
        dice: [1, 1, 1, 1, 1],
        held: [false, false, false, false, false]
    });

    if (score >= 25 && isYahtzee) {
        let msg = playerName === "りんかちゃん" ? "えらいね！" : "すごい！おめでとう！";
        let overlay = document.getElementById('celeb-overlay');
        overlay.innerHTML = `<div class="celeb-content"><h1 style="color: #ffb7c5;">Y A H T Z E E</h1><p style="color: white; font-size: 1.5em;">${msg}</p></div>`;
        overlay.style.display = 'flex';
        setTimeout(() => overlay.style.display = 'none', 3000);
    }
};

function calculateScore(category, dice, isJoker) {
    let sum = dice.reduce((a, b) => a + b, 0);
    let counts = {};
    dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
    let valArr = Object.values(counts);

    if (category.endsWith('s')) {
        let num = parseInt(category[0]);
        return dice.filter(d => d === num).reduce((a, b) => a + b, 0);
    }
    if (isJoker) {
        if (category === 'fh') return 25;
        if (category === 'ss') return 30;
        if (category === 'ls') return 40;
        if (category === '3k' || category === '4k' || category === 'ch') return sum;
    }
    if (category === '3k') return valArr.some(v => v >= 3) ? sum : 0;
    if (category === '4k') return valArr.some(v => v >= 4) ? sum : 0;
    if (category === 'ch') return sum;
    if (category === 'yz') return valArr.some(v => v === 5) ? 50 : 0;
    if (category === 'fh') return (valArr.includes(3) && valArr.includes(2)) || valArr.includes(5) ? 25 : 0;
    
    // STRICT STRAIGHT CHECK
    let has = (n) => dice.includes(n);
    if (category === 'ss') {
        if ((has(1)&&has(2)&&has(3)&&has(4)) || (has(2)&&has(3)&&has(4)&&has(5)) || (has(3)&&has(4)&&has(5)&&has(6))) return 30;
    }
    if (category === 'ls') {
        if ((has(1)&&has(2)&&has(3)&&has(4)&&has(5)) || (has(2)&&has(3)&&has(4)&&has(5)&&has(6))) return 40;
    }
    return 0;
}

function listenToRoom() {
    onValue(ref(db, `rooms/${currentRoom}`), (snap) => {
        const data = snap.val();
        if (!data) return;
        currentTurn = data.turn;
        rollsLeft = data.rollsLeft;
        currentDice = data.dice || [1, 1, 1, 1, 1];
        heldDice = data.held || [false, false, false, false, false];
        playerData = playerNum === 1 ? data.p1 : data.p2;
        opponentData = playerNum === 1 ? data.p2 : data.p1;
        if (!playerData) playerData = { scores: {}, yahtzeeBonuses: 0 };
        if (!opponentData) opponentData = { scores: {}, yahtzeeBonuses: 0 };
        updateUI();
        checkGameOver();
    });
}

function updateUI() {
    document.getElementById("turn-display").innerText = currentTurn === playerNum ? "あなたの番" : "あいての番";
    document.getElementById("roll-count").innerText = `のこり: ${rollsLeft}番`;
    document.getElementById("roll-btn").disabled = (currentTurn !== playerNum || rollsLeft <= 0);
    for (let i = 0; i < 5; i++) {
        const die = document.getElementById(`die-${i}`);
        die.innerText = ['一', '二', '三', '四', '五', '六'][currentDice[i] - 1];
        die.className = heldDice[i] ? "dice held" : "dice";
    }
    document.getElementById("p1-label").innerText = playerNum === 1 ? playerName : (opponentData.name || "P2");
    document.getElementById("p2-label").innerText = playerNum === 2 ? playerName : (opponentData.name || "P1");

    let totals = [0, 0], uppers = [0, 0];
    categories.forEach(c => {
        for (let p = 1; p <= 2; p++) {
            let pData = (p === playerNum) ? playerData : opponentData;
            let cell = document.getElementById(`s${p === playerNum ? playerNum : (playerNum === 1 ? 2 : 1)}-${c}`);
            let score = pData.scores[c];
            if (score !== 'ー') {
                if (c === 'yz' && pData.yahtzeeBonuses > 0) cell.innerText = `50+${pData.yahtzeeBonuses*100}`;
                else cell.innerText = score;
                cell.style.color = "#fff";
                totals[p-1] += (typeof score === 'number' ? score : 0);
                if (['1s','2s','3s','4s','5s','6s'].includes(c)) uppers[p-1] += score;
            } else {
                if (p === playerNum && currentTurn === playerNum && rollsLeft < 3) {
                    cell.innerHTML = `<span style="color: #ffb7c5; opacity: 0.6;">${calculateScore(c, currentDice, (currentDice.every(v => v === currentDice[0]) && playerData.scores['yz'] >= 50))}</span>`;
                } else { cell.innerText = 'ー'; cell.style.color = "#888"; }
            }
        }
    });

    let myBonus = uppers[0] >= 63 ? 35 : 0;
    let oppBonus = uppers[1] >= 63 ? 35 : 0;
    let myTotal = totals[0] + myBonus + (playerData.yahtzeeBonuses * 100);
    let oppTotal = totals[1] + oppBonus + (opponentData.yahtzeeBonuses * 100);

    document.getElementById(`s${playerNum}-bonus`).innerText = `${myBonus} (${Math.max(0, 63 - uppers[0])} のこり)`;
    document.getElementById(`s${playerNum === 1 ? 2 : 1}-bonus`).innerText = `${oppBonus} (${Math.max(0, 63 - uppers[1])} のこり)`;
    document.getElementById(`s${playerNum}-total`).innerText = myTotal;
    document.getElementById(`s${playerNum === 1 ? 2 : 1}-total`).innerText = oppTotal;
}

function checkGameOver() {
    if (categories.every(c => playerData.scores[c] !== 'ー' && opponentData.scores[c] !== 'ー')) {
        let myTotal = parseInt(document.getElementById(`s${playerNum}-total`).innerText);
        let oppTotal = parseInt(document.getElementById(`s${playerNum === 1 ? 2 : 1}-total`).innerText);
        let msg = myTotal > oppTotal ? (playerName === "りんかちゃん" ? "大好きだよ" : "かち") : (myTotal < oppTotal ? "まけ" : "引き分け！");
        document.getElementById("game-over-title").innerText = msg;
        document.getElementById("game-over-msg").innerText = `${myTotal} pt  vs  ${oppTotal} pt`;
        document.getElementById("game-over-overlay").style.display = 'flex';
        if (myTotal > 0 && !playerData.scoreSaved) {
            const d = new Date();
            push(ref(db, 'highscores'), { name: playerName, score: myTotal, date: `${d.getMonth()+1}.${d.getDate().toString().padStart(2,'0')}.${d.getFullYear().toString().slice(-2)}` });
            playerData.scoreSaved = true;
            update(ref(db, `rooms/${currentRoom}/p${playerNum}`), { scoreSaved: true });
        }
    }
}

function loadHighScores() {
    onValue(ref(db, 'highscores'), (snap) => {
        let scores = [];
        snap.forEach(c => scores.push(c.val()));
        scores.sort((a, b) => b.score - a.score);
        const list = document.getElementById("high-scores");
        list.innerHTML = "";
        scores.slice(0, 15).forEach(s => {
            let li = document.createElement("li");
            li.innerText = `${s.date || '0.00.00'} - ${s.score}pt - ${s.name}`;
            list.appendChild(li);
        });
    });
}

window.requestRematch = async function() {
    document.getElementById("game-over-overlay").style.display = 'none';
    let empty = {}; categories.forEach(c => empty[c] = 'ー');
    await update(ref(db, `rooms/${currentRoom}`), {
        [`p${playerNum}`]: { name: playerName, scores: empty, yahtzeeBonuses: 0, scoreSaved: false, ready: true },
        turn: 1, rollsLeft: 3, dice: [1, 1, 1, 1, 1], held: [false, false, false, false, false]
    });
};
