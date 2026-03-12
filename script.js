import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getDatabase, ref, set, onValue, update, push, query, orderByChild, limitToLast, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

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

let myName = "";
let roomID = "";
let myPlayerNum = 0; 
let gameState = null;
const kanjiMap = ["", "一", "二", "三", "四", "五", "六"];
const categories = ['1s','2s','3s','4s','5s','6s','3k','4k','fh','ss','ls','yz','ch'];

window.handleLogin = function() {
    const nameInput = document.getElementById('player-name').value.trim();
    const inputRoom = document.getElementById('room-id-input').value.trim();
    if (!nameInput) return alert("名前は？");
    myName = nameInput;

    if (inputRoom === "") {
        roomID = Math.floor(1000 + Math.random() * 9000).toString();
        myPlayerNum = 1;
        const initialData = {
            p1Name: myName, p2Name: "待機中...", turn: 1,
            dice: [1,1,1,1,1], held: [false,false,false,false,false],
            rollsLeft: 3, scoresP1: {}, scoresP2: {}, status: "waiting"
        };
        set(ref(db, 'rooms/' + roomID), initialData).then(() => {
            setupGameListener();
            alert("ルームID: " + roomID);
        });
    } else {
        roomID = inputRoom;
        get(ref(db, 'rooms/' + roomID)).then((snapshot) => {
            if (snapshot.exists()) {
                myPlayerNum = 2;
                update(ref(db, 'rooms/' + roomID), { p2Name: myName, status: "playing" }).then(() => {
                    setupGameListener();
                });
            } else { alert("ルームが見つかりません"); }
        });
    }
};

window.leaveRoom = function() { location.reload(); };

function setupGameListener() {
    onValue(ref(db, 'rooms/' + roomID), (snapshot) => {
        const val = snapshot.val();
        if(!val) return;
        gameState = val;
        renderGame();
    });
    document.getElementById('start-screen').style.display = 'none';
    document.getElementById('game-screen').style.display = 'block';
}

function renderGame() {
    if (!gameState) return;
    document.getElementById('room-display').innerText = "部屋: " + roomID;
    document.getElementById('p1-label').innerText = gameState.p1Name || "P1";
    document.getElementById('p2-label').innerText = gameState.p2Name || "P2";
    
    // Check for fresh game to hide overlay
    const s1 = gameState.scoresP1 || {};
    const s2 = gameState.scoresP2 || {};
    if (Object.keys(s1).length === 0 && Object.keys(s2).length === 0) {
        document.getElementById('game-over-overlay').style.display = 'none';
    }

    for(let i=0; i<5; i++) {
        const dEl = document.getElementById('die-'+i);
        if (dEl) {
            dEl.innerText = kanjiMap[gameState.dice[i]] || "一";
            dEl.className = gameState.held[i] ? "dice held" : "dice";
        }
    }
    
    const isMyTurn = (gameState.turn === myPlayerNum);
    const turnName = (gameState.turn === 1) ? gameState.p1Name : gameState.p2Name;
    document.getElementById('turn-display').innerText = turnName + "のターン";

    const rollBtn = document.getElementById('roll-btn');
    rollBtn.disabled = !isMyTurn || gameState.rollsLeft === 0;
    rollBtn.style.opacity = (!isMyTurn || gameState.rollsLeft === 0) ? "0.5" : "1";
    document.getElementById('roll-count').innerText = "のこり: " + (gameState.rollsLeft ?? 3) + "番";

    updateScoreUI('P1', s1);
    updateScoreUI('P2', s2);

    if (isMyTurn && gameState.rollsLeft < 3) { updatePreviews(); } else { clearPreviews(); }

    // GLOBAL END CHECK: If both have 13 entries, trigger end screen
    if (Object.keys(s1).length === 13 && Object.keys(s2).length === 13) {
        setTimeout(endGameAndSave, 800);
    }
}

function updateScoreUI(pKey, scores) {
    let upper = 0;
    categories.forEach(k => {
        const val = scores[k];
        const cell = document.getElementById('s' + (pKey === 'P1' ? '1' : '2') + '-' + k);
        if (!cell) return;
        cell.innerText = (val !== undefined) ? val : "ー";
        cell.style.color = (val !== undefined) ? "#ffffff" : "inherit";
        if(['1s','2s','3s','4s','5s','6s'].includes(k)) upper += (val || 0);
    });
    let bonusEl = document.getElementById('s' + (pKey === 'P1' ? '1' : '2') + '-bonus');
    bonusEl.innerText = upper >= 63 ? "35" : `0 (${63 - upper} のこり)`;
    const total = Object.values(scores).reduce((a,b)=>a+b, 0) + (upper >= 63 ? 35 : 0);
    document.getElementById('s' + (pKey === 'P1' ? '1' : '2') + '-total').innerText = total;
}

function updatePreviews() {
    const myScores = myPlayerNum === 1 ? (gameState.scoresP1 || {}) : (gameState.scoresP2 || {});
    categories.forEach(key => {
        if (myScores[key] === undefined) {
            let val = ['1s','2s','3s','4s','5s','6s'].includes(key) ? parseInt(key[0]) : key;
            let p = calcPoints(key, val);
            let cell = document.getElementById('s' + myPlayerNum + '-' + key);
            if (cell) { cell.innerText = p; cell.style.color = "#ffb7c5"; cell.style.opacity = "0.7"; }
        }
    });
}

function clearPreviews() {
    categories.forEach(key => {
        let cell = document.getElementById('s' + myPlayerNum + '-' + key);
        if (!cell) return;
        const myScores = myPlayerNum === 1 ? (gameState.scoresP1 || {}) : (gameState.scoresP2 || {});
        if (myScores[key] === undefined) { cell.innerText = "ー"; cell.style.color = "inherit"; cell.style.opacity = "1"; }
    });
}

window.rollDice = function() {
    if(!gameState || gameState.turn !== myPlayerNum || gameState.rollsLeft <= 0) return;
    let newDice = [...gameState.dice];
    for(let i=0; i<5; i++) { if(!gameState.held[i]) newDice[i] = Math.floor(Math.random() * 6) + 1; }
    update(ref(db, 'rooms/' + roomID), { dice: newDice, rollsLeft: gameState.rollsLeft - 1 });
};

window.toggleHold = function(i) {
    if(!gameState || gameState.turn !== myPlayerNum || gameState.rollsLeft === 3) return;
    let newHeld = [...gameState.held];
    newHeld[i] = !newHeld[i];
    update(ref(db, 'rooms/' + roomID), { held: newHeld });
};

window.attemptScore = function(key, val) {
    if(!gameState || gameState.turn !== myPlayerNum || gameState.rollsLeft === 3) return;
    const currentScores = (myPlayerNum === 1) ? (gameState.scoresP1 || {}) : (gameState.scoresP2 || {});
    if(currentScores[key] !== undefined) return;
    const points = calcPoints(key, val);
    
    if (key === 'yz' && points > 0) {
        // Special message for Rinkachan
        if (myName === "りんかちゃん") {
            document.querySelector('#celeb-overlay p').innerText = "えらいね！";
        } else {
            document.querySelector('#celeb-overlay p').innerText = "すごい！おめでとう！";
        }
        document.getElementById('celeb-overlay').style.display = 'flex';
    }

    const scoreUpdate = {};
    scoreUpdate[myPlayerNum === 1 ? 'scoresP1/' + key : 'scoresP2/' + key] = points;
    scoreUpdate['turn'] = myPlayerNum === 1 ? 2 : 1;
    scoreUpdate['rollsLeft'] = 3;
    scoreUpdate['held'] = [false,false,false,false,false];
    scoreUpdate['dice'] = [1,1,1,1,1];
    update(ref(db, 'rooms/' + roomID), scoreUpdate);
};

function calcPoints(key, val) {
    let cnt = {}; gameState.dice.forEach(d => cnt[d] = (cnt[d]||0)+1);
    let s = gameState.dice.reduce((a,b)=>a+b,0);
    if(typeof val === 'number') return (cnt[val]||0)*val;
    let v = Object.values(cnt);
    if(key==='3k') return v.some(c=>c>=3)?s:0;
    if(key==='4k') return v.some(c=>c>=4)?s:0;
    if(key==='fh') return (v.includes(3)&&v.includes(2))||v.includes(5)?25:0;
    if(key==='yz') return v.some(c=>c>=5)?50:0;
    if(key==='ch') return s;
    let u = [...new Set(gameState.dice)].sort().join('');
    if(key==='ss' && /1234|2345|3456/.test(u)) return 30;
    if(key==='ls' && /12345|23456/.test(u)) return 40;
    return 0;
}

function endGameAndSave() {
    const s1 = parseInt(document.getElementById('s1-total').innerText);
    const s2 = parseInt(document.getElementById('s2-total').innerText);
    const myScore = myPlayerNum === 1 ? s1 : s2;
    const opScore = myPlayerNum === 1 ? s2 : s1;
    
    // Only save to global leaderboard once per player
    if (!window.scoreSaved) {
        push(ref(db, 'global_rankings'), { n: myName, s: myScore });
        window.scoreSaved = true;
    }

    const titleEl = document.getElementById('game-over-title');
    const msgEl = document.getElementById('game-over-msg');
    
    if (myScore > opScore) { titleEl.innerText = "かち！"; titleEl.style.color = "#ffb7c5"; } 
    else if (myScore < opScore) { titleEl.innerText = "まけ..."; titleEl.style.color = "#888"; } 
    else { titleEl.innerText = "ひきわけ！"; titleEl.style.color = "#fff"; }

    let finalMsg = `${myScore} 対 ${opScore}`;
    if (myName === "りんかちゃん") finalMsg += "\nりんかちゃん、だいすきだよ";
    msgEl.innerText = finalMsg;
    document.getElementById('game-over-overlay').style.display = 'flex';
}

window.requestRematch = function() {
    window.scoreSaved = false;
    update(ref(db, 'rooms/' + roomID), {
        turn: 1, dice: [1,1,1,1,1], held: [false,false,false,false,false], rollsLeft: 3, scoresP1: {}, scoresP2: {}
    });
};

function loadLeaderboard() {
    const scoresRef = query(ref(db, 'global_rankings'), orderByChild('s'), limitToLast(15));
    onValue(scoresRef, (snapshot) => {
        const data = snapshot.val();
        const list = [];
        for (let id in data) list.push(data[id]);
        list.sort((a, b) => b.s - a.s);
        document.getElementById('high-scores').innerHTML = list.map(x => `<li>${x.s}点 - ${x.n}</li>`).join('');
    });
}
window.onload = loadLeaderboard;