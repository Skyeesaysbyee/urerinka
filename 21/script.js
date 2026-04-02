const SUITS = ["♠", "♥", "♦", "♣"];
const VALUES = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];

const STARTING_CHIPS = 1000;
const CHIP_KEY = "urerinka_21_chips";

const state = {
  deck: [],
  revealDealer: false,
  roundActive: false,
  currentTurn: 0,
  participants: [],
  dealer: {
    hand: []
  },
  player: createSeat("You", "human"),
  cpu1: createSeat("CPU 1", "cpu"),
  cpu2: createSeat("CPU 2", "cpu")
};

const els = {
  playerBank: document.getElementById("player-bank"),
  betInput: document.getElementById("bet-input"),
  startRoundBtn: document.getElementById("start-round-btn"),
  resetBtn: document.getElementById("reset-btn"),
  statusBox: document.getElementById("status-box"),
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

  cpu1Cards: document.getElementById("cpu1-cards"),
  cpu1Score: document.getElementById("cpu1-score"),
  cpu1Bet: document.getElementById("cpu1-bet"),
  cpu1Result: document.getElementById("cpu1-result"),

  cpu2Cards: document.getElementById("cpu2-cards"),
  cpu2Score: document.getElementById("cpu2-score"),
  cpu2Bet: document.getElementById("cpu2-bet"),
  cpu2Result: document.getElementById("cpu2-result"),

  playerSeat: document.getElementById("player-seat"),
  cpu1Seat: document.getElementById("cpu1-seat"),
  cpu2Seat: document.getElementById("cpu2-seat")
};

function createSeat(name, kind) {
  return {
    name,
    kind,
    hand: [],
    bet: 0,
    bank: kind === "human" ? STARTING_CHIPS : 1000,
    done: false,
    busted: false,
    stood: false,
    blackjack: false,
    result: ""
  };
}

function resetSeatRound(seat) {
  seat.hand = [];
  seat.bet = 0;
  seat.done = false;
  seat.busted = false;
  seat.stood = false;
  seat.blackjack = false;
  seat.result = "";
}

function saveChips() {
  localStorage.setItem(CHIP_KEY, String(state.player.bank));
}

function loadChips() {
  const saved = Number(localStorage.getItem(CHIP_KEY));
  if (Number.isFinite(saved) && saved > 0) {
    state.player.bank = saved;
  } else {
    state.player.bank = STARTING_CHIPS;
  }
}

function createDeck() {
  const deck = [];
  for (const suit of SUITS) {
    for (const value of VALUES) {
      deck.push({ suit, value });
    }
  }
  return shuffle(deck);
}

function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function drawCard(hand) {
  if (state.deck.length === 0) {
    state.deck = createDeck();
  }
  hand.push(state.deck.pop());
}

function getCardValue(card) {
  if (["J", "Q", "K"].includes(card.value)) return 10;
  if (card.value === "A") return 11;
  return Number(card.value);
}

function calculateScore(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    total += getCardValue(card);
    if (card.value === "A") aces++;
  }

  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }

  return total;
}

function isBlackjack(hand) {
  return hand.length === 2 && calculateScore(hand) === 21;
}

function isSoftHand(hand) {
  let total = 0;
  let aces = 0;

  for (const card of hand) {
    total += getCardValue(card);
    if (card.value === "A") aces++;
  }

  return aces > 0 && total <= 21;
}

function setStatus(text) {
  els.statusBox.textContent = text;
}

function renderCard(card, hidden = false) {
  if (hidden) {
    return `<div class="card back">HIDDEN</div>`;
  }

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
  hand.forEach((card, index) => {
    target.insertAdjacentHTML(
      "beforeend",
      renderCard(card, hideFirst && index === 0 && !state.revealDealer)
    );
  });
}

function setResult(target, text) {
  target.textContent = text;
  target.className = "result-line";

  if (!text) return;
  if (text.includes("Win") || text.includes("Blackjack")) {
    target.classList.add("result-win");
  } else if (text.includes("Push")) {
    target.classList.add("result-push");
  } else {
    target.classList.add("result-lose");
  }
}

function visibleDealerScore() {
  if (state.revealDealer) return calculateScore(state.dealer.hand);
  if (state.dealer.hand.length < 2) return 0;
  return getCardValue(state.dealer.hand[1]);
}

function clearHighlights() {
  els.playerSeat.classList.remove("active-turn");
  els.cpu1Seat.classList.remove("active-turn");
  els.cpu2Seat.classList.remove("active-turn");
}

function highlightCurrentSeat() {
  clearHighlights();
  if (!state.roundActive) return;

  const current = state.participants[state.currentTurn];
  if (!current) return;

  if (current === state.player) els.playerSeat.classList.add("active-turn");
  if (current === state.cpu1) els.cpu1Seat.classList.add("active-turn");
  if (current === state.cpu2) els.cpu2Seat.classList.add("active-turn");
}

function updateButtons() {
  const current = state.participants[state.currentTurn];
  const playerTurn = state.roundActive && current === state.player && !state.player.done;

  els.hitBtn.disabled = !playerTurn;
  els.standBtn.disabled = !playerTurn;
  els.doubleBtn.disabled = !playerTurn || state.player.hand.length !== 2 || state.player.bank < state.player.bet;
  els.startRoundBtn.disabled = state.roundActive;
}

function render() {
  els.playerBank.textContent = state.player.bank;

  renderHand(els.dealerCards, state.dealer.hand, true);
  renderHand(els.playerCards, state.player.hand);
  renderHand(els.cpu1Cards, state.cpu1.hand);
  renderHand(els.cpu2Cards, state.cpu2.hand);

  els.dealerScore.textContent = visibleDealerScore();
  els.playerScore.textContent = calculateScore(state.player.hand);
  els.cpu1Score.textContent = calculateScore(state.cpu1.hand);
  els.cpu2Score.textContent = calculateScore(state.cpu2.hand);

  els.playerBet.textContent = state.player.bet;
  els.cpu1Bet.textContent = state.cpu1.bet;
  els.cpu2Bet.textContent = state.cpu2.bet;

  setResult(els.playerResult, state.player.result);
  setResult(els.cpu1Result, state.cpu1.result);
  setResult(els.cpu2Result, state.cpu2.result);
  setResult(els.dealerResult, state.revealDealer ? `Final: ${calculateScore(state.dealer.hand)}` : "");

  highlightCurrentSeat();
  updateButtons();
}

function getCpuBet(baseBet, bank) {
  const options = [baseBet, baseBet, baseBet + 10, baseBet - 10, baseBet + 20];
  let bet = options[Math.floor(Math.random() * options.length)];
  bet = Math.max(10, bet);
  bet = Math.min(bank, bet);
  return bet;
}

function startRound() {
  const bet = Number(els.betInput.value);

  if (!Number.isFinite(bet) || bet < 10) {
    setStatus("Your bet must be at least 10.");
    return;
  }

  if (state.player.bank < bet) {
    setStatus("You don't have enough chips for that bet.");
    return;
  }

  state.roundActive = true;
  state.revealDealer = false;
  state.currentTurn = 0;
  state.deck = createDeck();
  state.dealer.hand = [];

  resetSeatRound(state.player);
  resetSeatRound(state.cpu1);
  resetSeatRound(state.cpu2);

  state.participants = [state.player, state.cpu1, state.cpu2];

  state.player.bet = bet;
  state.player.bank -= bet;

  state.cpu1.bet = getCpuBet(bet, state.cpu1.bank);
  state.cpu1.bank -= state.cpu1.bet;

  state.cpu2.bet = getCpuBet(bet, state.cpu2.bank);
  state.cpu2.bank -= state.cpu2.bet;

  for (let i = 0; i < 2; i++) {
    state.participants.forEach(seat => drawCard(seat.hand));
    drawCard(state.dealer.hand);
  }

  state.participants.forEach(seat => {
    if (isBlackjack(seat.hand)) {
      seat.blackjack = true;
      seat.done = true;
      seat.stood = true;
    }
  });

  render();

  if (state.player.blackjack) {
    setStatus("You got Blackjack.");
    moveNextTurn();
  } else {
    setStatus("Your turn.");
  }
}

function playerHit() {
  if (!state.roundActive) return;
  if (state.participants[state.currentTurn] !== state.player) return;

  drawCard(state.player.hand);
  const score = calculateScore(state.player.hand);

  if (score > 21) {
    state.player.busted = true;
    state.player.done = true;
    state.player.result = "Bust";
    render();
    setStatus("You bust.");
    moveNextTurn();
    return;
  }

  if (score === 21) {
    state.player.done = true;
    state.player.stood = true;
    render();
    setStatus("You hit 21.");
    moveNextTurn();
    return;
  }

  render();
  setStatus("You hit.");
}

function playerStand() {
  if (!state.roundActive) return;
  if (state.participants[state.currentTurn] !== state.player) return;

  state.player.done = true;
  state.player.stood = true;
  render();
  setStatus("You stand.");
  moveNextTurn();
}

function playerDouble() {
  if (!state.roundActive) return;
  if (state.participants[state.currentTurn] !== state.player) return;
  if (state.player.hand.length !== 2) return;
  if (state.player.bank < state.player.bet) {
    setStatus("You don't have enough chips to double.");
    return;
  }

  state.player.bank -= state.player.bet;
  state.player.bet *= 2;
  drawCard(state.player.hand);

  const score = calculateScore(state.player.hand);
  if (score > 21) {
    state.player.busted = true;
    state.player.result = "Bust";
  }

  state.player.done = true;
  state.player.stood = !state.player.busted;

  render();
  setStatus("You doubled.");
  moveNextTurn();
}

function moveNextTurn() {
  state.currentTurn++;

  if (state.currentTurn >= state.participants.length) {
    dealerTurn();
    return;
  }

  const seat = state.participants[state.currentTurn];

  if (seat.blackjack) {
    setStatus(`${seat.name} has Blackjack.`);
    render();
    setTimeout(moveNextTurn, 600);
    return;
  }

  render();

  if (seat.kind === "cpu") {
    setStatus(`${seat.name}'s turn.`);
    setTimeout(() => runCpuTurn(seat), 700);
  } else {
    setStatus("Your turn.");
  }
}

function cpuShouldHit(hand, dealerUpCard) {
  const score = calculateScore(hand);
  const dealerValue = getCardValue(dealerUpCard);

  if (score <= 11) return true;
  if (score >= 17) return false;
  if (isSoftHand(hand) && score <= 17) return true;
  if (score >= 12 && score <= 16) return dealerValue >= 7;
  return false;
}

function runCpuTurn(seat) {
  if (!state.roundActive) return;

  const interval = setInterval(() => {
    const score = calculateScore(seat.hand);

    if (score > 21) {
      seat.busted = true;
      seat.done = true;
      seat.result = "Bust";
      clearInterval(interval);
      render();
      setStatus(`${seat.name} busts.`);
      setTimeout(moveNextTurn, 600);
      return;
    }

    if (cpuShouldHit(seat.hand, state.dealer.hand[1])) {
      drawCard(seat.hand);
      render();
      setStatus(`${seat.name} hits.`);
    } else {
      seat.done = true;
      seat.stood = true;
      clearInterval(interval);
      render();
      setStatus(`${seat.name} stands.`);
      setTimeout(moveNextTurn, 600);
    }
  }, 700);
}

function dealerTurn() {
  state.revealDealer = true;
  render();

  const everyoneBusted = state.participants.every(seat => seat.busted);

  if (everyoneBusted) {
    finalizeRound();
    return;
  }

  const interval = setInterval(() => {
    const dealerScore = calculateScore(state.dealer.hand);

    if (dealerScore < 17) {
      drawCard(state.dealer.hand);
      render();
      setStatus("Dealer hits.");
    } else {
      clearInterval(interval);
      render();
      setStatus("Dealer stands.");
      setTimeout(finalizeRound, 500);
    }
  }, 700);
}

function finalizeRound() {
  const dealerScore = calculateScore(state.dealer.hand);
  const dealerBJ = isBlackjack(state.dealer.hand);
  const dealerBust = dealerScore > 21;

  for (const seat of state.participants) {
    const score = calculateScore(seat.hand);

    if (seat.busted) {
      seat.result = "Lose";
      continue;
    }

    if (seat.blackjack && !dealerBJ) {
      seat.bank += Math.floor(seat.bet * 2.5);
      seat.result = "Blackjack Win";
      continue;
    }

    if (dealerBust) {
      seat.bank += seat.bet * 2;
      seat.result = "Win";
      continue;
    }

    if (dealerBJ && !seat.blackjack) {
      seat.result = "Lose";
      continue;
    }

    if (score > dealerScore) {
      seat.bank += seat.bet * 2;
      seat.result = "Win";
    } else if (score < dealerScore) {
      seat.result = "Lose";
    } else {
      seat.bank += seat.bet;
      seat.result = "Push";
    }
  }

  state.roundActive = false;
  state.currentTurn = 0;
  saveChips();
  render();

  if (dealerBJ) {
    setStatus(`Dealer has Blackjack with ${dealerScore}.`);
  } else if (dealerBust) {
    setStatus(`Dealer busts with ${dealerScore}.`);
  } else {
    setStatus(`Dealer stands at ${dealerScore}. Round over.`);
  }
}

function resetAllChips() {
  localStorage.removeItem(CHIP_KEY);
  state.player.bank = STARTING_CHIPS;
  state.cpu1.bank = 1000;
  state.cpu2.bank = 1000;

  state.roundActive = false;
  state.revealDealer = false;
  state.currentTurn = 0;
  state.deck = [];
  state.participants = [];
  state.dealer.hand = [];

  resetSeatRound(state.player);
  resetSeatRound(state.cpu1);
  resetSeatRound(state.cpu2);

  setStatus("Chips reset. Set your bet and start the round.");
  render();
}

els.startRoundBtn.addEventListener("click", startRound);
els.resetBtn.addEventListener("click", resetAllChips);
els.hitBtn.addEventListener("click", playerHit);
els.standBtn.addEventListener("click", playerStand);
els.doubleBtn.addEventListener("click", playerDouble);

loadChips();
resetSeatRound(state.player);
resetSeatRound(state.cpu1);
resetSeatRound(state.cpu2);
render();
setStatus("Set your bet and start the round.");
