import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
  remove,
  onDisconnect
} from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";

/* ---------------- FIREBASE ---------------- */
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

/* ---------------- CONSTANTS ---------------- */
const SUITS = ["♠", "♥", "♦", "♣"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const STARTING_BANK = 1000;

/* ---------------- STATE ---------------- */
let currentRoom = null;
let playerNum = null; // 1 or 2
let playerName = "";
let roomData = null;
let roomUnsubscribed = false;
let roomListenerBound = false;

/* ---------------- DOM ---------------- */
const el = {
  lobbyScreen: document.getElementById("lobby-screen"),
  gameScreen: document.getElementById("game-screen"),
  waitingBox: document.getElementById("waiting-box"),

  usernameInput: document.getElementById("username-input"),
  roomInput: document.getElementById("room-id-input"),
  joinBtn: document.getElementById("join-btn"),

  roomDisplay: document.getElementById("room-display"),
  turnDisplay: document.getElementById("turn-display"),
  statusBox: document.getElementById("status-box"),

  playerBank: document.getElementById("player-bank"),
  betInput: document.getElementById("bet-input"),
  startRoundBtn: document.getElementById("start-round-btn"),
  hitBtn: document.getElementById("hit-btn"),
  standBtn: document.getElementById("stand-btn"),
  doubleBtn: document.getElementById("double-btn"),

  dealerCards: document.getElementById("dealer-cards"),
  dealerScore: document.getElementById("dealer-score"),
  dealerResult: document.getElementById("dealer-result"),

  playerCards: document.getElementById("player-cards"),
  playerScore: document.getElementById("player-score"),
  playerBet: document.getElementById("player-bet"),
  playerResult: document.getElementById("player-result"),

  oppName: document.getElementById("opp-name"),
  oppCards: document.getElementById("opp-cards"),
  oppScore: document.getElementById("opp-score"),
  oppBet: document.getElementById("opp-bet"),
  oppBank: document.getElementById("opp-bank"),
  oppResult: document.getElementById("opp-result"),

  playerSeat: document.getElementById("player-seat"),
  oppSeat: document.getElementById("opp-seat"),

  overlay: document.getElementById("game-over-overlay"),
  overlayTitle: document.getElementById("game-over-title"),
  overlayMsg: document.getElementById("game-over-msg"),
  leaveBtn: document.getElementById("leave-btn")
};

/* ---------------- HELPERS ---------------- */
function makeDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return shuffle(deck);
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drawCard(deck, hand) {
  hand.push(deck.pop());
}

function cardValue(card) {
  if (!card) return 0;
  if (["J", "Q", "K"].includes(card.value)) return 10;
  if (card.value === "A") return 11;
  return Number(card.value);
}

function scoreHand(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand || []) {
    total += cardValue(card);
    if (card.value === "A") aces++;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function isBlackjack(hand) {
  return (hand || []).length === 2 && scoreHand(hand) === 21;
}

function isSoftHand(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand || []) {
    total += cardValue(card);
    if (card.value === "A") aces++;
  }

  return aces > 0 && total <= 21;
}

function cpuShouldHit(hand, dealerUpCard) {
  const score = scoreHand(hand);
  const dealerValue = cardValue(dealerUpCard);

  if (score <= 11) return true;
  if (score >= 17) return false;
  if (isSoftHand(hand) && score <= 17) return true;
  if (score >= 12 && score <= 16) return dealerValue >= 7;
  return false;
}

function makeSeat(name, bank = STARTING_BANK) {
  return {
    name,
    bank,
    bet: 0,
    hand: [],
    done: false,
    busted: false,
    stood: false,
    blackjack: false,
    result: ""
  };
}

function resetSeatRound(seat) {
  seat.bet = 0;
  seat.hand = [];
  seat.done = false;
  seat.busted = false;
  seat.stood = false;
  seat.blackjack = false;
  seat.result = "";
}

function myKey() {
  return playerNum === 1 ? "p1" : "p2";
}

function oppKey() {
  return playerNum === 1 ? "p2" : "p1";
}

function isHost() {
  return playerNum === 1;
}

function getMySeat(game) {
  return game[myKey()];
}

function getOppSeat(game) {
  if (game.mode === "cpu") return game.cpu;
  return game[oppKey()];
}

function currentTurnName(game) {
  if (!game) return "";
  if (game.turn === myKey()) return "あなたの番";
  if (game.turn === oppKey()) return `${getOppSeat(game)?.name || "あいて"}の番`;
  if (game.turn === "cpu") return "CPUの番";
  if (game.turn === "dealer") return "ディーラーの番";
  return "";
}

function setStatus(text) {
  if (el.statusBox) el.statusBox.textContent = text;
}

function safeText(v, fallback = "") {
  return v == null ? fallback : String(v);
}

/* ---------------- ROOM SETUP ---------------- */
async function handleLogin() {
  playerName = el.usernameInput.value.trim();
  const code = el.roomInput.value.trim();

  if (!playerName || !code) {
    alert("名前とコード入れてね。");
    return;
  }

  currentRoom = code.toLowerCase();
  const roomRef = ref(db, `rooms21/${currentRoom}`);
  const snap = await get(roomRef);

  if (!snap.exists()) {
    playerNum = 1;

    const room = {
      p1: { name: playerName, bank: STARTING_BANK, connected: true },
      p2: null,
      state: "lobby",
      host: 1,
      game: {
        mode: "waiting",
        turn: "p1",
        revealDealer: false,
        roundActive: false,
        message: "相手待ち... ひとりで始めるならスタート押してね。",
        deck: [],
        dealerHand: [],
        p1: makeSeat(playerName, STARTING_BANK),
        p2: makeSeat("Player 2", STARTING_BANK),
        cpu: makeSeat("CPU", STARTING_BANK)
      }
    };

    await set(roomRef, room);
  } else {
    const data = snap.val();

    if (!data.p1) {
      playerNum = 1;
      await update(roomRef, {
        p1: { name: playerName, bank: STARTING_BANK, connected: true },
        host: 1
      });
    } else if (!data.p2 && data.state !== "gameover" && data.game?.mode !== "cpu") {
      playerNum = 2;
      await update(roomRef, {
        p2: { name: playerName, bank: STARTING_BANK, connected: true }
      });
    } else {
      alert("このルームは入れないよ。");
      return;
    }
  }

  onDisconnect(ref(db, `rooms21/${currentRoom}/${myKey()}`)).remove();

  el.lobbyScreen.style.display = "none";
  el.gameScreen.style.display = "block";
  el.roomDisplay.textContent = `ルーム: ${currentRoom}`;

  bindRoomListener();
}

function bindRoomListener() {
  if (roomListenerBound) return;
  roomListenerBound = true;

  onValue(ref(db, `rooms21/${currentRoom}`), (snap) => {
    const data = snap.val();
    if (!data) {
      location.reload();
      return;
    }

    roomData = data;
    renderRoom();

    if (data.state === "gameover") {
      showGameOver();
      return;
    }

    const game = data.game;
    if (!game) return;

    if (game.mode === "cpu" && isHost() && game.roundActive) {
      maybeRunCpuOrDealer(game);
    }
  });
}

/* ---------------- RENDER ---------------- */
function renderCard(card, hidden = false) {
  if (hidden) return `<div class="card back">？？？</div>`;

  const red = card.suit === "♥" || card.suit === "♦" ? "red" : "";
  return `
    <div class="card ${red}">
      <div class="card-top">${card.value}${card.suit}</div>
      <div class="card-center">${card.suit}</div>
      <div class="card-bottom">${card.value}${card.suit}</div>
    </div>
  `;
}

function renderHand(target, hand, hideFirst = false) {
  if (!target) return;
  target.innerHTML = "";
  (hand || []).forEach((card, index) => {
    target.insertAdjacentHTML(
      "beforeend",
      renderCard(card, hideFirst && index === 0)
    );
  });
}

function applyResultClass(target, text) {
  if (!target) return;
  target.textContent = text || "";
  target.className = "result-line";

  if (!text) return;
  if (text.includes("勝ち") || text.includes("ブラックジャック")) {
    target.classList.add("result-win");
  } else if (text.includes("引き分け")) {
    target.classList.add("result-push");
  } else {
    target.classList.add("result-lose");
  }
}

function renderRoom() {
  const game = roomData?.game;
  if (!game) return;

  const mine = getMySeat(game);
  const opp = getOppSeat(game);

  if (el.waitingBox) {
    const waiting = !roomData.p2 && game.mode === "waiting";
    el.waitingBox.style.display = waiting ? "block" : "none";
    if (waiting) {
      el.waitingBox.textContent = "相手待ち... ひとりで始めるならスタート押してね。";
    }
  }

  setStatus(game.message || "");

  el.turnDisplay.textContent = currentTurnName(game);

  el.playerBank.textContent = safeText(mine?.bank, "0");
  el.playerBet.textContent = safeText(mine?.bet, "0");
  el.playerScore.textContent = mine?.hand?.length ? scoreHand(mine.hand) : 0;

  if (el.oppName) el.oppName.textContent = opp?.name || (game.mode === "cpu" ? "CPU" : "あいて");
  if (el.oppBank) el.oppBank.textContent = safeText(opp?.bank, "0");
  if (el.oppBet) el.oppBet.textContent = safeText(opp?.bet, "0");
  if (el.oppScore) el.oppScore.textContent = opp?.hand?.length ? scoreHand(opp.hand) : 0;

  renderHand(el.playerCards, mine?.hand || []);
  renderHand(el.oppCards, opp?.hand || []);
  renderHand(el.dealerCards, game.dealerHand || [], !game.revealDealer);

  const dealerScore = game.revealDealer
    ? scoreHand(game.dealerHand || [])
    : (game.dealerHand?.[1] ? cardValue(game.dealerHand[1]) : 0);

  el.dealerScore.textContent = dealerScore;

  applyResultClass(el.playerResult, mine?.result || "");
  applyResultClass(el.oppResult, opp?.result || "");
  applyResultClass(
    el.dealerResult,
    game.revealDealer ? `最終: ${scoreHand(game.dealerHand || [])}` : ""
  );

  el.startRoundBtn.disabled = false;
  el.hitBtn.disabled = !(game.roundActive && game.turn === myKey() && !mine.done);
  el.standBtn.disabled = !(game.roundActive && game.turn === myKey() && !mine.done);
  el.doubleBtn.disabled = !(
    game.roundActive &&
    game.turn === myKey() &&
    !mine.done &&
    mine.hand.length === 2 &&
    mine.bank >= mine.bet
  );

  el.playerSeat?.classList.remove("active-turn");
  el.oppSeat?.classList.remove("active-turn");

  if (game.turn === myKey()) el.playerSeat?.classList.add("active-turn");
  if (game.turn === oppKey() || game.turn === "cpu") el.oppSeat?.classList.add("active-turn");

  if (game.roundActive) {
    el.startRoundBtn.textContent = "進行中";
    el.startRoundBtn.disabled = true;
  } else {
    el.startRoundBtn.textContent = roomData.p2 ? "ベットして開始" : "スタート";
    el.startRoundBtn.disabled = false;
  }
}

/* ---------------- START ROUND ---------------- */
async function startRound() {
  if (!roomData || !roomData.game || roomData.state === "gameover") return;
  if (roomData.game.roundActive) return;

  const roomRef = ref(db, `rooms21/${currentRoom}`);
  const snap = await get(roomRef);
  const data = snap.val();
  if (!data) return;

  const game = data.game;
  const roomHasP2 = !!data.p2;
  const mode = roomHasP2 ? "pvp" : "cpu";

  const me = game[myKey()];
  const bet = Number(el.betInput.value);

  if (!Number.isFinite(bet) || bet < 1) {
    setStatus("1以上ベットしてね。");
    return;
  }

  if (bet > me.bank) {
    setStatus(`いまは${me.bank}までしかベットできないよ。`);
    return;
  }

  if (mode === "pvp" && !data.p2) {
    setStatus("まだ相手いないよ。");
    return;
  }

  const deck = makeDeck();

  const p1 = game.p1 || makeSeat(data.p1?.name || "P1", data.p1?.bank ?? STARTING_BANK);
  const p2 = game.p2 || makeSeat(data.p2?.name || "P2", data.p2?.bank ?? STARTING_BANK);
  const cpu = game.cpu || makeSeat("CPU", STARTING_BANK);

  resetSeatRound(p1);
  resetSeatRound(p2);
  resetSeatRound(cpu);

  p1.name = data.p1?.name || p1.name;
  p1.bank = data.p1?.bank ?? p1.bank;

  p2.name = data.p2?.name || p2.name;
  p2.bank = data.p2?.bank ?? p2.bank;

  if (mode === "pvp") {
    p1.bet = playerNum === 1 ? bet : Math.min(p1.bank, game.p1?.bet || 10);
    p2.bet = playerNum === 2 ? bet : Math.min(p2.bank, game.p2?.bet || 10);

    if (playerNum === 1 && (game.p2?.bet || 0) > 0) p2.bet = Math.min(p2.bank, game.p2.bet);
    if (playerNum === 2 && (game.p1?.bet || 0) > 0) p1.bet = Math.min(p1.bank, game.p1.bet);

    if (playerNum === 1) {
      p1.bet = bet;
      await update(roomRef, { [`game/p1/bet`]: bet, [`game/message`]: "相手のベット待ち..." });
      if (!game.p2?.bet) return;
      p2.bet = Math.min(p2.bank, game.p2.bet);
    } else {
      p2.bet = bet;
      await update(roomRef, { [`game/p2/bet`]: bet, [`game/message`]: "ホストが開始するの待ち..." });
      if (!game.p1?.bet) return;
      p1.bet = Math.min(p1.bank, game.p1.bet);
    }

    if (!isHost()) return;
  } else {
    p1.bet = bet;
    cpu.bet = Math.min(cpu.bank, Math.max(10, randomCpuBet(bet)));
  }

  if (mode === "pvp") {
    if (p1.bet > p1.bank || p2.bet > p2.bank) {
      setStatus("どっちかのベットが所持金オーバー。");
      return;
    }
  } else {
    if (p1.bet > p1.bank) {
      setStatus(`いまは${p1.bank}までしかベットできないよ。`);
      return;
    }
  }

  p1.bank -= p1.bet;
  if (mode === "pvp") p2.bank -= p2.bet;
  if (mode === "cpu") cpu.bank -= cpu.bet;

  const dealerHand = [];

  drawCard(deck, p1.hand);
  if (mode === "pvp") drawCard(deck, p2.hand);
  if (mode === "cpu") drawCard(deck, cpu.hand);
  drawCard(deck, dealerHand);

  drawCard(deck, p1.hand);
  if (mode === "pvp") drawCard(deck, p2.hand);
  if (mode === "cpu") drawCard(deck, cpu.hand);
  drawCard(deck, dealerHand);

  p1.blackjack = isBlackjack(p1.hand);
  p2.blackjack = isBlackjack(p2.hand);
  cpu.blackjack = isBlackjack(cpu.hand);

  p1.done = p1.blackjack;
  p2.done = p2.blackjack;
  cpu.done = cpu.blackjack;

  const firstTurn = p1.blackjack ? (mode === "pvp" ? "p2" : "cpu") : "p1";

  const newGame = {
    mode,
    turn: firstTurn,
    revealDealer: false,
    roundActive: true,
    message: firstTurn === "p1" ? "あなたの番。" : `${mode === "pvp" ? p2.name : "CPU"}の番。`,
    deck,
    dealerHand,
    p1,
    p2,
    cpu
  };

  await update(roomRef, {
    state: "playing",
    p1: { ...data.p1, bank: p1.bank },
    p2: data.p2 ? { ...data.p2, bank: p2.bank } : null,
    game: newGame
  });

  if (mode === "cpu" && isHost()) maybeRunCpuOrDealer(newGame);
}

function randomCpuBet(base) {
  const opts = [base, base, base + 10, base - 10, base + 20];
  return Math.max(10, opts[Math.floor(Math.random() * opts.length)]);
}

/* ---------------- PLAYER ACTIONS ---------------- */
async function playerHit() {
  if (!roomData?.game?.roundActive) return;
  const game = structuredClone(roomData.game);
  if (game.turn !== myKey()) return;

  const me = game[myKey()];
  drawCard(game.deck, me.hand);

  const score = scoreHand(me.hand);
  if (score > 21) {
    me.busted = true;
    me.done = true;
    me.result = "バースト";
    game.message = "バースト...";
    game.turn = nextTurn(game);
  } else if (score === 21) {
    me.done = true;
    me.stood = true;
    game.message = "21きた！";
    game.turn = nextTurn(game);
  } else {
    game.message = "ヒット。";
  }

  await update(ref(db, `rooms21/${currentRoom}`), { game });

  if (isHost()) maybeRunCpuOrDealer(game);
}

async function playerStand() {
  if (!roomData?.game?.roundActive) return;
  const game = structuredClone(roomData.game);
  if (game.turn !== myKey()) return;

  const me = game[myKey()];
  me.done = true;
  me.stood = true;
  game.message = "スタンド。";
  game.turn = nextTurn(game);

  await update(ref(db, `rooms21/${currentRoom}`), { game });

  if (isHost()) maybeRunCpuOrDealer(game);
}

async function playerDouble() {
  if (!roomData?.game?.roundActive) return;
  const game = structuredClone(roomData.game);
  if (game.turn !== myKey()) return;

  const me = game[myKey()];
  if (me.hand.length !== 2) return;

  if (me.bank < me.bet) {
    setStatus("ダブルするお金が足りないよ。");
    return;
  }

  me.bank -= me.bet;
  me.bet *= 2;

  if (myKey() === "p1") {
    roomData.p1.bank = me.bank;
  } else {
    roomData.p2.bank = me.bank;
  }

  drawCard(game.deck, me.hand);

  const score = scoreHand(me.hand);
  if (score > 21) {
    me.busted = true;
    me.result = "バースト";
  } else {
    me.stood = true;
  }
  me.done = true;

  game.message = "ダブル！";
  game.turn = nextTurn(game);

  const patch = { game };
  patch[myKey()] = { ...(roomData[myKey()] || {}), bank: me.bank };

  await update(ref(db, `rooms21/${currentRoom}`), patch);

  if (isHost()) maybeRunCpuOrDealer(game);
}

function nextTurn(game) {
  if (game.mode === "pvp") {
    if (!game.p1.done) return "p1";
    if (!game.p2.done) return "p2";
    return "dealer";
  }

  if (!game.p1.done) return "p1";
  if (!game.cpu.done) return "cpu";
  return "dealer";
}

/* ---------------- CPU / DEALER ---------------- */
let actionLock = false;

async function maybeRunCpuOrDealer(game) {
  if (actionLock || !isHost()) return;
  if (!game.roundActive) return;

  if (game.mode === "cpu" && game.turn === "cpu" && !game.cpu.done) {
    actionLock = true;
    setTimeout(async () => {
      const latest = structuredClone(roomData.game);
      if (!latest || latest.turn !== "cpu") {
        actionLock = false;
        return;
      }

      const cpu = latest.cpu;
      const dealerUp = latest.dealerHand?.[1];
      const shouldHit = cpuShouldHit(cpu.hand, dealerUp);

      if (shouldHit) {
        drawCard(latest.deck, cpu.hand);
        if (scoreHand(cpu.hand) > 21) {
          cpu.busted = true;
          cpu.done = true;
          cpu.result = "バースト";
          latest.message = "CPU、バースト。";
          latest.turn = nextTurn(latest);
        } else {
          latest.message = "CPUはヒット。";
        }
      } else {
        cpu.done = true;
        cpu.stood = true;
        latest.message = "CPUはスタンド。";
        latest.turn = nextTurn(latest);
      }

      await update(ref(db, `rooms21/${currentRoom}`), { game: latest });
      actionLock = false;
      maybeRunCpuOrDealer(latest);
    }, 900);
    return;
  }

  if (game.turn === "dealer") {
    actionLock = true;
    setTimeout(async () => {
      const latest = structuredClone(roomData.game);
      if (!latest || latest.turn !== "dealer") {
        actionLock = false;
        return;
      }

      latest.revealDealer = true;

      const playerSet = latest.mode === "pvp" ? [latest.p1, latest.p2] : [latest.p1, latest.cpu];
      const everybodyBusted = playerSet.every(s => s.busted);

      if (everybodyBusted) {
        await finalizeRound(latest);
        actionLock = false;
        return;
      }

      const dealerScore = scoreHand(latest.dealerHand);

      if (dealerScore < 17) {
        drawCard(latest.deck, latest.dealerHand);
        latest.message = "ディーラーはヒット。";
        await update(ref(db, `rooms21/${currentRoom}`), { game: latest });
        actionLock = false;
        maybeRunCpuOrDealer(latest);
      } else {
        latest.message = "ディーラーはスタンド。";
        await finalizeRound(latest);
        actionLock = false;
      }
    }, 900);
  }
}

/* ---------------- ROUND END ---------------- */
async function finalizeRound(game) {
  const dealerScore = scoreHand(game.dealerHand);
  const dealerBJ = isBlackjack(game.dealerHand);
  const dealerBust = dealerScore > 21;

  const seats = game.mode === "pvp" ? ["p1", "p2"] : ["p1", "cpu"];

  for (const key of seats) {
    const seat = game[key];
    const score = scoreHand(seat.hand);

    if (seat.busted) {
      seat.result = "負け";
      continue;
    }

    if (seat.blackjack && !dealerBJ) {
      seat.bank += Math.floor(seat.bet * 2.5);
      seat.result = "ブラックジャック勝ち";
      continue;
    }

    if (dealerBust) {
      seat.bank += seat.bet * 2;
      seat.result = "勝ち";
      continue;
    }

    if (dealerBJ && !seat.blackjack) {
      seat.result = "負け";
      continue;
    }

    if (score > dealerScore) {
      seat.bank += seat.bet * 2;
      seat.result = "勝ち";
    } else if (score < dealerScore) {
      seat.result = "負け";
    } else {
      seat.bank += seat.bet;
      seat.result = "引き分け";
    }
  }

  game.roundActive = false;
  game.revealDealer = true;
  game.message = dealerBust
    ? `ディーラーが${dealerScore}でバースト。`
    : `ディーラーは${dealerScore}で終了。`;

  const patch = { game };

  patch.p1 = { ...(roomData.p1 || {}), bank: game.p1.bank };
  if (roomData.p2) patch.p2 = { ...(roomData.p2 || {}), bank: game.p2.bank };

  let overallWinner = null;

  if (game.mode === "pvp") {
    if (game.p1.bank <= 0) overallWinner = "p2";
    if (game.p2.bank <= 0) overallWinner = "p1";
  } else {
    if (game.p1.bank <= 0) {
      if (!game.cpu.busted && scoreHand(game.cpu.hand) >= 0) {
        overallWinner = "cpu";
      } else {
        overallWinner = "dealer";
      }
    }
  }

  if (overallWinner) {
    patch.state = "gameover";
    patch.winner = overallWinner;
  }

  await update(ref(db, `rooms21/${currentRoom}`), patch);
}

/* ---------------- GAME OVER ---------------- */
function showGameOver() {
  if (!roomData) return;

  const winner = roomData.winner;
  const iWon = winner === myKey();

  let title = iWon ? "かち！" : "まけ...";
  let msg = "";

  if (iWon && playerName === "りんかちゃん") {
    title = "大好きだよママ";
  }

  if (winner === "cpu") {
    title = "CPUのかち";
  } else if (winner === "dealer") {
    title = "ディーラーのかち";
  }

  const myBank = roomData.game?.[myKey()]?.bank ?? 0;
  const opp = getOppSeat(roomData.game);

  if (winner === "p1" || winner === "p2") {
    msg = `${roomData[winner]?.name || "勝者"} が勝ったよ。あなたの所持金: ${myBank}`;
  } else if (winner === "cpu") {
    msg = `CPUにやられた... あなたの所持金: ${myBank}`;
  } else {
    msg = `ディーラーの勝ち。あなたの所持金: ${myBank}`;
  }

  el.overlayTitle.textContent = title;
  el.overlayMsg.textContent = msg;
  el.overlay.style.display = "flex";
}

/* ---------------- LEAVE ---------------- */
function leaveRoom() {
  location.reload();
}

/* ---------------- EVENTS ---------------- */
el.joinBtn?.addEventListener("click", handleLogin);
el.startRoundBtn?.addEventListener("click", startRound);
el.hitBtn?.addEventListener("click", playerHit);
el.standBtn?.addEventListener("click", playerStand);
el.doubleBtn?.addEventListener("click", playerDouble);
el.leaveBtn?.addEventListener("click", leaveRoom);

/* enter key */
el.roomInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
el.usernameInput?.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
