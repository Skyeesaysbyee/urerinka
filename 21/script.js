import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import {
  getDatabase,
  ref,
  set,
  update,
  get,
  onValue,
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
let playerNum = null;
let playerName = "";
let roomData = null;
let cpuLock = false;
let dealerLock = false;

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
  lockBetBtn: document.getElementById("lock-bet-btn"),
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
function myKey() {
  return playerNum === 1 ? "p1" : "p2";
}

function oppKey() {
  return playerNum === 1 ? "p2" : "p1";
}

function isHost() {
  return playerNum === 1;
}

function safeNum(v, fallback = 0) {
  return Number.isFinite(Number(v)) ? Number(v) : fallback;
}

function makeSeat(name, bank = STARTING_BANK) {
  return {
    name,
    bank,
    bet: 0,
    lockedBet: false,
    allIn: false,
    hand: [],
    done: false,
    busted: false,
    stood: false,
    blackjack: false,
    result: ""
  };
}

function resetSeatRound(seat) {
  seat.hand = [];
  seat.done = false;
  seat.busted = false;
  seat.stood = false;
  seat.blackjack = false;
  seat.result = "";
  seat.allIn = false;
}

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
  if (!deck.length) return;
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

function setStatus(text) {
  el.statusBox.textContent = text || "";
}

function getHighestLockedBet(game) {
  const bets = [];
  if (game.p1?.lockedBet) bets.push(game.p1.bet);
  if (game.mode === "pvp" && game.p2?.lockedBet) bets.push(game.p2.bet);
  if (game.mode === "cpu" && game.cpu?.lockedBet) bets.push(game.cpu.bet);
  return bets.length ? Math.max(...bets) : 0;
}

function getMySeat(game) {
  return game[myKey()];
}

function getOppSeat(game) {
  return game.mode === "cpu" ? game.cpu : game[oppKey()];
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
  target.innerHTML = "";
  (hand || []).forEach((card, index) => {
    target.insertAdjacentHTML("beforeend", renderCard(card, hideFirst && index === 0));
  });
}

function applyResultClass(target, text) {
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

/* ---------------- ROOM ---------------- */
async function handleLogin() {
  playerName = el.usernameInput.value.trim();
  const roomCode = el.roomInput.value.trim().toLowerCase();

  if (!playerName || !roomCode) {
    alert("名前とルームID入れてね。");
    return;
  }

  currentRoom = roomCode;
  const roomRef = ref(db, `rooms21/${currentRoom}`);
  const snap = await get(roomRef);

  if (!snap.exists()) {
    playerNum = 1;
    await set(roomRef, {
      state: "lobby",
      winner: null,
      p1: { name: playerName, bank: STARTING_BANK, connected: true },
      p2: null,
      game: {
        mode: "waiting",
        roundActive: false,
        revealDealer: false,
        turn: "p1",
        message: "相手待ち。ひとりでやるならベットしてね。",
        deck: [],
        dealerHand: [],
        p1: makeSeat(playerName, STARTING_BANK),
        p2: makeSeat("Player 2", STARTING_BANK),
        cpu: makeSeat("CPU", STARTING_BANK)
      }
    });
  } else {
    const data = snap.val();
    if (!data.p2 && data.game?.mode !== "cpu" && data.state !== "gameover") {
      playerNum = 2;
      await update(roomRef, {
        p2: { name: playerName, bank: STARTING_BANK, connected: true },
        "game/p2/name": playerName
      });
    } else {
      alert("そのルーム入れないよ。");
      return;
    }
  }

  onDisconnect(ref(db, `rooms21/${currentRoom}/${myKey()}`)).remove();

  el.lobbyScreen.style.display = "none";
  el.gameScreen.style.display = "block";
  bindRoomListener();
}

function bindRoomListener() {
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

    if (isHost()) {
      maybeRunCpu();
      maybeRunDealer();
    }
  });
}

/* ---------------- RENDER ---------------- */
function renderRoom() {
  const game = roomData.game;
  const me = getMySeat(game);
  const opp = getOppSeat(game);

  el.roomDisplay.textContent = `ルーム: ${currentRoom}`;

  if (!roomData.p2 && game.mode === "waiting") {
    el.waitingBox.style.display = "block";
    el.waitingBox.textContent = "相手待ち。ひとりでやるならベットしてスタート。";
  } else {
    el.waitingBox.style.display = "none";
  }

  el.turnDisplay.textContent =
    game.turn === myKey() ? "あなたの番" :
    game.turn === "dealer" ? "ディーラーの番" :
    game.turn === "cpu" ? "CPUの番" :
    `${opp?.name || "あいて"}の番`;

  setStatus(game.message || "");

  el.playerBank.textContent = me?.bank ?? 0;
  el.playerBet.textContent = me?.bet ?? 0;
  el.playerScore.textContent = me?.hand?.length ? scoreHand(me.hand) : 0;

  el.oppName.textContent = opp?.name || (game.mode === "cpu" ? "CPU" : "あいて");
  el.oppBank.textContent = opp?.bank ?? 0;
  el.oppBet.textContent = opp?.bet ?? 0;
  el.oppScore.textContent = opp?.hand?.length ? scoreHand(opp.hand) : 0;

  renderHand(el.playerCards, me?.hand || []);
  renderHand(el.oppCards, opp?.hand || []);
  renderHand(el.dealerCards, game.dealerHand || [], !game.revealDealer);

  el.dealerScore.textContent = game.revealDealer
    ? scoreHand(game.dealerHand || [])
    : (game.dealerHand?.[1] ? cardValue(game.dealerHand[1]) : 0);

  applyResultClass(el.playerResult, me?.result || "");
  applyResultClass(el.oppResult, opp?.result || "");
  applyResultClass(el.dealerResult, game.revealDealer ? `最終: ${scoreHand(game.dealerHand || [])}` : "");

  el.playerSeat.classList.remove("active-turn");
  el.oppSeat.classList.remove("active-turn");

  if (game.turn === myKey()) el.playerSeat.classList.add("active-turn");
  if (game.turn === oppKey() || game.turn === "cpu") el.oppSeat.classList.add("active-turn");

  const highestBet = getHighestLockedBet(game);
  const myBet = me?.bet || 0;
  const myCanAct = game.roundActive && game.turn === myKey() && !me.done;

  el.hitBtn.disabled = !myCanAct;
  el.standBtn.disabled = !myCanAct;
  el.doubleBtn.disabled = !myCanAct || me.hand.length !== 2 || me.bank < me.bet;

  el.lockBetBtn.disabled = game.roundActive;
  el.startRoundBtn.disabled = game.roundActive;

  if (!game.roundActive) {
    if (!roomData.p2) {
      el.startRoundBtn.textContent = "スタート";
    } else if (highestBet > 0 && myBet < highestBet && !(me.allIn && myBet < highestBet)) {
      el.startRoundBtn.textContent = `最高ベット ${highestBet}`;
    } else {
      el.startRoundBtn.textContent = "スタート";
    }
  } else {
    el.startRoundBtn.textContent = "進行中";
  }
}

/* ---------------- BET LOCK ---------------- */
async function lockBet() {
  if (!roomData || roomData.game.roundActive) return;

  const roomRef = ref(db, `rooms21/${currentRoom}`);
  const snap = await get(roomRef);
  const data = snap.val();
  if (!data) return;

  const game = structuredClone(data.game);
  const me = game[myKey()];
  let bet = safeNum(el.betInput.value, 0);

  if (bet < 1) {
    setStatus("1以上ベットしてね。");
    return;
  }

  if (bet > me.bank) {
    setStatus(`いまは${me.bank}までしかベットできないよ。`);
    return;
  }

  me.allIn = false;
  const currentHighest = getHighestLockedBet(game);

  if (data.p2) {
    if (currentHighest > 0 && bet < currentHighest) {
      if (me.bank < currentHighest && bet === me.bank) {
        me.bet = me.bank;
        me.lockedBet = true;
        me.allIn = true;
      } else {
        setStatus(`最高ベットは${currentHighest}。同じ額まで上げてね。`);
        return;
      }
    } else {
      me.bet = bet;
      me.lockedBet = true;
    }

    game.mode = "pvp";
    const highestBet = getHighestLockedBet(game);

    if (game.p1.lockedBet && game.p2.lockedBet) {
      const p1CanCover = game.p1.bet === highestBet || (game.p1.allIn && game.p1.bet < highestBet);
      const p2CanCover = game.p2.bet === highestBet || (game.p2.allIn && game.p2.bet < highestBet);

      if (p1CanCover && p2CanCover) {
        game.message = (game.p1.allIn || game.p2.allIn)
          ? "オールインあり。スタートできるよ。"
          : "ベットそろった。スタートできるよ。";
      } else {
        game.message = `最高ベットは${highestBet}。合わせてね。`;
      }
    } else {
      game.message = me.allIn ? "オールインでベット確定。相手待ち。" : "ベット確定。相手待ち。";
    }
  } else {
    me.bet = bet;
    me.lockedBet = true;
    me.allIn = bet === me.bank;

    game.mode = "cpu";
    game.cpu.name = "CPU";
    game.cpu.bet = Math.min(game.cpu.bank, me.bet);
    game.cpu.lockedBet = true;
    game.cpu.allIn = game.cpu.bet === game.cpu.bank;
    game.message = `ベット確定。CPUは${game.cpu.bet}。スタートしてね。`;
  }

  await update(roomRef, { game });
}

/* ---------------- START ROUND ---------------- */
async function startRound() {
  if (!roomData || roomData.game.roundActive) return;

  const roomRef = ref(db, `rooms21/${currentRoom}`);
  const snap = await get(roomRef);
  const data = snap.val();
  if (!data) return;

  const game = structuredClone(data.game);
  const hasP2 = !!data.p2;

  if (!game.p1.lockedBet) {
    setStatus("先にベット確定してね。");
    return;
  }

  if (!hasP2) {
    game.mode = "cpu";
    game.cpu.name = "CPU";
    game.cpu.lockedBet = true;

    if (!game.cpu.bet || game.cpu.bet < 1) {
      game.cpu.bet = Math.min(game.cpu.bank, Math.max(10, game.p1.bet));
    } else {
      game.cpu.bet = Math.min(game.cpu.bank, game.p1.bet);
    }

    game.cpu.allIn = game.cpu.bet === game.cpu.bank;
  } else {
    game.mode = "pvp";

    if (!game.p2.lockedBet) {
      setStatus("相手のベット待ち。");
      return;
    }

    const highestBet = Math.max(game.p1.bet, game.p2.bet);
    const p1Matched = game.p1.bet === highestBet || (game.p1.allIn && game.p1.bet < highestBet);
    const p2Matched = game.p2.bet === highestBet || (game.p2.allIn && game.p2.bet < highestBet);

    if (!p1Matched || !p2Matched) {
      setStatus(`最高ベットは${highestBet}。合わせてね。`);
      return;
    }

    if (!isHost()) {
      setStatus("ホストがスタートするよ。");
      return;
    }
  }

  const deck = makeDeck();

  resetSeatRound(game.p1);
  resetSeatRound(game.p2);
  resetSeatRound(game.cpu);

  game.dealerHand = [];
  game.revealDealer = false;
  game.roundActive = true;

  game.p1.bank -= game.p1.bet;
  if (game.mode === "pvp") {
    game.p2.bank -= game.p2.bet;
  } else {
    game.cpu.bank -= game.cpu.bet;
  }

  drawCard(deck, game.p1.hand);
  if (game.mode === "pvp") drawCard(deck, game.p2.hand);
  else drawCard(deck, game.cpu.hand);
  drawCard(deck, game.dealerHand);

  drawCard(deck, game.p1.hand);
  if (game.mode === "pvp") drawCard(deck, game.p2.hand);
  else drawCard(deck, game.cpu.hand);
  drawCard(deck, game.dealerHand);

  game.p1.blackjack = isBlackjack(game.p1.hand);
  game.p2.blackjack = isBlackjack(game.p2.hand);
  game.cpu.blackjack = isBlackjack(game.cpu.hand);

  game.p1.done = game.p1.blackjack;
  game.p2.done = game.p2.blackjack;
  game.cpu.done = game.cpu.blackjack;

  game.turn = nextTurn(game);
  game.deck = deck;
  game.message = game.turn === "p1" ? "あなたの番。" : "進行中。";

  await update(roomRef, {
    game,
    p1: { ...data.p1, bank: game.p1.bank },
    p2: data.p2 ? { ...data.p2, bank: game.p2.bank } : null,
    state: "playing"
  });
}

/* ---------------- PLAYER ACTIONS ---------------- */
async function playerHit() {
  if (!roomData?.game?.roundActive) return;
  const roomRef = ref(db, `rooms21/${currentRoom}`);
  const game = structuredClone(roomData.game);

  if (game.turn !== myKey()) return;

  const me = game[myKey()];
  drawCard(game.deck, me.hand);

  const score = scoreHand(me.hand);
  if (score > 21) {
    me.busted = true;
    me.done = true;
    me.result = "バースト";
    game.turn = nextTurn(game);
    game.message = "バースト…。";
  } else if (score === 21) {
    me.done = true;
    me.stood = true;
    game.turn = nextTurn(game);
    game.message = "21きた！";
  } else {
    game.message = "ヒット。";
  }

  await update(roomRef, { game });
}

async function playerStand() {
  if (!roomData?.game?.roundActive) return;
  const roomRef = ref(db, `rooms21/${currentRoom}`);
  const game = structuredClone(roomData.game);

  if (game.turn !== myKey()) return;

  const me = game[myKey()];
  me.done = true;
  me.stood = true;
  game.turn = nextTurn(game);
  game.message = "スタンド。";

  await update(roomRef, { game });
}

async function playerDouble() {
  if (!roomData?.game?.roundActive) return;
  const roomRef = ref(db, `rooms21/${currentRoom}`);
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

  drawCard(game.deck, me.hand);

  const score = scoreHand(me.hand);
  if (score > 21) {
    me.busted = true;
    me.result = "バースト";
  } else {
    me.stood = true;
  }
  me.done = true;
  game.turn = nextTurn(game);
  game.message = "ダブル！";

  const patch = { game };
  patch[myKey()] = { ...(roomData[myKey()] || {}), bank: me.bank };

  await update(roomRef, patch);
}

/* ---------------- CPU ---------------- */
async function maybeRunCpu() {
  if (!isHost() || cpuLock || !roomData?.game?.roundActive) return;
  const game = roomData.game;

  if (game.mode !== "cpu" || game.turn !== "cpu" || game.cpu.done) return;

  cpuLock = true;

  setTimeout(async () => {
    const roomRef = ref(db, `rooms21/${currentRoom}`);
    const snap = await get(roomRef);
    const fresh = snap.val();
    if (!fresh?.game || fresh.game.turn !== "cpu") {
      cpuLock = false;
      return;
    }

    const g = structuredClone(fresh.game);
    const cpu = g.cpu;
    const dealerUp = g.dealerHand[1];

    if (cpuShouldHit(cpu.hand, dealerUp)) {
      drawCard(g.deck, cpu.hand);
      if (scoreHand(cpu.hand) > 21) {
        cpu.busted = true;
        cpu.done = true;
        cpu.result = "バースト";
        g.turn = nextTurn(g);
        g.message = "CPU、バースト。";
      } else {
        g.message = "CPUはヒット。";
      }
    } else {
      cpu.done = true;
      cpu.stood = true;
      g.turn = nextTurn(g);
      g.message = "CPUはスタンド。";
    }

    await update(roomRef, { game: g });
    cpuLock = false;
    maybeRunDealer();
    maybeRunCpu();
  }, 900);
}

/* ---------------- DEALER ---------------- */
async function maybeRunDealer() {
  if (!isHost() || dealerLock || !roomData?.game?.roundActive) return;
  const game = roomData.game;
  if (game.turn !== "dealer") return;

  dealerLock = true;

  const roomRef = ref(db, `rooms21/${currentRoom}`);
  const snap = await get(roomRef);
  const fresh = snap.val();
  if (!fresh?.game || fresh.game.turn !== "dealer") {
    dealerLock = false;
    return;
  }

  let g = structuredClone(fresh.game);
  g.revealDealer = true;
  await update(roomRef, { game: g });

  const everyoneBusted = g.mode === "pvp"
    ? g.p1.busted && g.p2.busted
    : g.p1.busted && g.cpu.busted;

  if (everyoneBusted) {
    await finalizeRound(g);
    dealerLock = false;
    return;
  }

  const runDealerStep = async () => {
    const snap2 = await get(roomRef);
    const current = snap2.val();
    if (!current?.game) {
      dealerLock = false;
      return;
    }

    g = structuredClone(current.game);
    const dealerScore = scoreHand(g.dealerHand);

    if (dealerScore < 17) {
      drawCard(g.deck, g.dealerHand);
      g.message = "ディーラーはヒット。";
      await update(roomRef, { game: g });
      setTimeout(runDealerStep, 900);
    } else {
      g.message = "ディーラーはスタンド。";
      await finalizeRound(g);
      dealerLock = false;
    }
  };

  setTimeout(runDealerStep, 900);
}

/* ---------------- ROUND END ---------------- */
async function finalizeRound(game) {
  const roomRef = ref(db, `rooms21/${currentRoom}`);
  const dealerScore = scoreHand(game.dealerHand);
  const dealerBJ = isBlackjack(game.dealerHand);
  const dealerBust = dealerScore > 21;

  const keys = game.mode === "pvp" ? ["p1", "p2"] : ["p1", "cpu"];

  for (const key of keys) {
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

  game.turn = "p1";
  game.p1.lockedBet = false;
  game.p2.lockedBet = false;
  game.cpu.lockedBet = false;

  let winner = null;

  if (game.mode === "pvp") {
    const p1LostRound = game.p1.result === "負け" || game.p1.result === "バースト";
    const p2LostRound = game.p2.result === "負け" || game.p2.result === "バースト";

    if (game.p1.bank <= 0 && p1LostRound) winner = "p2";
    if (game.p2.bank <= 0 && p2LostRound) winner = "p1";
  } else {
    const p1LostRound = game.p1.result === "負け" || game.p1.result === "バースト";
    if (game.p1.bank <= 0 && p1LostRound) {
      const cpuScore = scoreHand(game.cpu.hand);
      if (!game.cpu.busted && cpuScore >= 0) winner = "cpu";
      else winner = "dealer";
    }
  }

  const patch = {
    game,
    p1: { ...(roomData.p1 || {}), bank: game.p1.bank },
    p2: roomData.p2 ? { ...(roomData.p2 || {}), bank: game.p2.bank } : null
  };

  if (winner) {
    patch.state = "gameover";
    patch.winner = winner;
  }

  await update(roomRef, patch);
}

/* ---------------- GAME OVER ---------------- */
function showGameOver() {
  const winner = roomData.winner;
  const iWon = winner === myKey();

  let title = iWon ? "かち！" : "まけ...";
  if (iWon && playerName === "りんかちゃん") {
    title = "大好きだよママ";
  }
  if (winner === "cpu") title = "CPUのかち";
  if (winner === "dealer") title = "ディーラーのかち";

  const myBank = roomData.game?.[myKey()]?.bank ?? 0;
  const msg = `あなたの所持金: ${myBank}`;

  el.overlayTitle.textContent = title;
  el.overlayMsg.textContent = msg;
  el.overlay.style.display = "flex";
}

/* ---------------- LEAVE ---------------- */
function leaveRoom() {
  location.reload();
}

/* ---------------- EVENTS ---------------- */
el.joinBtn.addEventListener("click", handleLogin);
el.lockBetBtn.addEventListener("click", lockBet);
el.startRoundBtn.addEventListener("click", startRound);
el.hitBtn.addEventListener("click", playerHit);
el.standBtn.addEventListener("click", playerStand);
el.doubleBtn.addEventListener("click", playerDouble);
el.leaveBtn.addEventListener("click", leaveRoom);

el.usernameInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
el.roomInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleLogin();
});
