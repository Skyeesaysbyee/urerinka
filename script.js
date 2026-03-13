import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, get, remove, push, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

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

    if (!playerName) {
        alert("名前を入力してください！");
        return;
    }
    if (!roomInput) {
        alert("ルームIDを入力してください！");
        return;
    }

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
        if (snap.exists()) {
            const data = snap.val();
            if (!data.p1 && !data.p2) await remove(roomRef);
        }
    }
    location.reload(); 
};

window.rollDice = async function() {
    if (currentTurn !== playerNum || rollsLeft <= 0) return;
    let targetNum = null;
    for (let i = 0; i < 5; i++) {
        if (heldDice[i]) {
            targetNum = currentDice[i];
            break; 
        }
    }
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
    let isYahtzeeBonus = false;
    let isJoker = false;

    if (isYahtzee && playerData.scores['yz'] >= 50) {
        isYahtzeeBonus = true;
        isJoker = true;
        if (playerData.scores[upperCategory] === 'ー' && category !== upperCategory) {
            alert(`ボーナスルール: まず ${targetNum} のボックスを埋めてください！`);
            return;
        }
    }

    let score = calculateScore(category, currentDice, isJoker);
    playerData.scores[category] = score;
    if (isYahtzeeBonus) playerData.yahtzeeBonuses = (playerData.yahtzeeBonuses || 0) + 1;

    currentTurn = (playerNum === 1) ? 2 : 1;
    rollsLeft = 3;
    heldDice = [false, false, false, false, false];

    await update(ref(db, `rooms/${currentRoom}`), {
        [`p${playerNum}`]: playerData,
        turn: currentTurn,
        rollsLeft: rollsLeft,
        dice: currentDice,
        held: heldDice
    });

    if (score >= 25 && isYahtzee) {
        document.getElementById('celeb-overlay').style.display = 'flex';
        setTimeout(() => document.getElementById('celeb-overlay').style.display = 'none', 3000);
    }
};

function calculateScore(category, dice, isJoker) {
    let sum = dice.reduce((a, b) => a + b, 0);
    let counts = {};
    dice.forEach(d => counts[d] = (counts[d] || 0) + 1);
    let values = Object.values(counts);

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
    if (category === '3k') return values.some(v => v >= 3) ? sum : 0;
    if (category === '4k') return values.some(v => v >= 4) ? sum : 0;
    if (category === 'ch') return sum;
    if (category === 'yz') return values.some(v => v === 5) ? 50 : 0;
    if (category === 'fh') return (values.includes(3) && values.includes(2)) || values.includes(5) ? 25 : 0;
    let straightStr = [...new Set(dice)].sort().join('');
    if (category === 'ss') return (straightStr.includes('1234') || straightStr.includes('2345') || straightStr.includes('3456')) ? 30 : 0;
    if (category === 'ls') return (straightStr.includes('12345') || straightStr.includes('23456')) ? 40 : 0;
    return 0;
}

function listenToRoom() {
    const roomRef = ref(db, `rooms/${currentRoom}`);
    onValue(roomRef, (snapshot) => {
        const data = snapshot.val();
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
    let turnName = currentTurn === playerNum ? "あなたの番" : "あいての番";
    document.getElementById("turn-display").innerText = turnName;
    document.getElementById("roll-count").innerText = `のこり: ${rollsLeft}番`;
    document.getElementById("roll-btn").disabled = (currentTurn !== playerNum || rollsLeft <= 0);

    for (let i = 0; i < 5; i++) {
        const die = document.getElementById(`die-${i}`);
        die.innerText = getDieFace(currentDice[i]);
        die.className = heldDice[i] ? "dice held" : "dice";
    }

    document.getElementById("p1-label").innerText = playerNum === 1 ? playerName : (opponentData.name || "P2");
    document.getElementById("p2-label").innerText = playerNum === 2 ? playerName : (opponentData.name || "P1");

    let myTotal = 0, myUpper = 0;
    let oppTotal = 0, oppUpper = 0;

    categories.forEach(c => {
        let p1Val = playerNum === 1 ? playerData.scores[c] : opponentData.scores[c];
        if (p1Val !== undefined && p1Val !== 'ー') {
            document.getElementById(`s1-${c}`).innerText = c === 'yz' && (playerNum === 1 ? playerData.yahtzeeBonuses : opponentData.yahtzeeBonuses) > 0 
                ? `50 + ${(playerNum === 1 ? playerData.yahtzeeBonuses : opponentData.yahtzeeBonuses) * 100}` 
                : p1Val;
            if (playerNum === 1) myTotal += (typeof p1Val === 'number' ? p1Val : 0);
            else oppTotal += (typeof p1Val === 'number' ? p1Val : 0);
            if (['1s','2s','3s','4s','5s','6s'].includes(c)) {
                if (playerNum === 1) myUpper += p1Val; else oppUpper += p1Val;
            }
        } else { document.getElementById(`s1-${c}`).innerText = 'ー'; }

        let p2Val = playerNum === 2 ? playerData.scores[c] : opponentData.scores[c];
        if (p2Val !== undefined && p2Val !== 'ー') {
            document.getElementById(`s2-${c}`).innerText = c === 'yz' && (playerNum === 2 ? playerData.yahtzeeBonuses : opponentData.yahtzeeBonuses) > 0 
                ? `50 + ${(playerNum === 2 ? playerData.yahtzeeBonuses : opponentData.yahtzeeBonuses) * 100}` 
                : p2Val;
            if (playerNum === 2) myTotal += (typeof p2Val === 'number' ? p2Val : 0);
            else oppTotal += (typeof p2Val === 'number' ? p2Val : 0);
            if (['1s','2s','3s','4s','5s','6s'].includes(c)) {
                if (playerNum === 2) myUpper += p2Val; else oppUpper += p2Val;
            }
        } else { document.getElementById(`s2-${c}`).innerText = 'ー'; }
    });

    let myUpperBonus = myUpper >= 63 ? 35 : 0;
    let oppUpperBonus = oppUpper >= 63 ? 35 : 0;
    let myYBonusPts = (playerData.yahtzeeBonuses || 0) * 100;
    let oppYBonusPts = (opponentData.yahtzeeBonuses || 0) * 100;

    myTotal += myUpperBonus + myYBonusPts;
    oppTotal += oppUpperBonus + oppYBonusPts;

    document.getElementById(`s${playerNum}-bonus`).innerText = `${myUpperBonus} (${Math.max(0, 63 - myUpper)} のこり)`;
    document.getElementById(`s${playerNum === 1 ? 2 : 1}-bonus`).innerText = `${oppUpperBonus} (${Math.max(0, 63 - oppUpper)} のこり)`;
    document.getElementById(`s${playerNum}-total`).innerText = myTotal;
    document.getElementById(`s${playerNum === 1 ? 2 : 1}-total`).innerText = oppTotal;
}

function getDieFace(num) {
    return ['一', '二', '三', '四', '五', '六'][num - 1];
}

function checkGameOver() {
    let myScoresDone = categories.every(c => playerData.scores[c] !== undefined && playerData.scores[c] !== 'ー');
    let oppScoresDone = categories.every(c => opponentData.scores[c] !== undefined && opponentData.scores[c] !== 'ー');
    if (myScoresDone && oppScoresDone) {
        let myTotal = parseInt(document.getElementById(`s${playerNum}-total`).innerText);
        let oppTotal = parseInt(document.getElementById(`s${playerNum === 1 ? 2 : 1}-total`).innerText);
        let msg = myTotal > oppTotal ? "あなたの勝ち！" : myTotal < oppTotal ? "あいての勝ち！" : "引き分け！";
        document.getElementById("game-over-title").innerText = msg;
        document.getElementById("game-over-msg").innerText = `${myTotal} pt  vs  ${oppTotal} pt`;
        document.getElementById("game-over-overlay").style.display = 'flex';
        const d = new Date();
        const formattedDate = `${d.getMonth() + 1}.${d.getDate().toString().padStart(2, '0')}.${d.getFullYear().toString().slice(-2)}`;
        if (myTotal > 0 && !playerData.scoreSaved) {
            push(ref(db, 'highscores'), { name: playerName, score: myTotal, date: formattedDate });
            playerData.scoreSaved = true;
            update(ref(db, `rooms/${currentRoom}/p${playerNum}`), { scoreSaved: true });
        }
    }
}

function loadHighScores() {
    onValue(ref(db, 'highscores'), (snapshot) => {
        let scores = [];
        snapshot.forEach(child => scores.push(child.val()));
        scores.sort((a, b) => b.score - a.score); 
        const list = document.getElementById("high-scores");
        list.innerHTML = "";
        scores.slice(0, 5).forEach(score => {
            let li = document.createElement("li");
            li.innerText = `${score.date || '0.00.00'} - ${score.score}pt - ${score.name}`;
            list.appendChild(li);
        });
    });
}

window.requestRematch = async function() {
    document.getElementById("game-over-overlay").style.display = 'none';
    let emptyScores = {};
    categories.forEach(c => emptyScores[c] = 'ー');
    await update(ref(db, `rooms/${currentRoom}`), {
        [`p${playerNum}`]: { name: playerName, scores: emptyScores, yahtzeeBonuses: 0, scoreSaved: false, ready: true },
        turn: 1,
        rollsLeft: 3,
        dice: [1, 1, 1, 1, 1],
        held: [false, false, false, false, false]
    });
};
