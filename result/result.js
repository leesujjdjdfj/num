import { db } from "../firebase-config.js";
import {
  ref,
  get,
  update,
  onValue,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ROOMS_PATH = "rooms";
const NICKNAME_SESSION_KEY = "nickname";

// ─────────────────────────────────────────────────────────────────────────────
// URL Helpers
// ─────────────────────────────────────────────────────────────────────────────
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    roomCode: params.get("room") || "",
    winner: params.get("winner") || "",
    you: params.get("you") || "",
  };
}

function toHomeUrl() {
  return new URL("../home_ux/home_ux.html", window.location.href).toString();
}

function toGameRoomUrl(roomCode) {
  return new URL(
    `../game_room_ux/game_room_ux.html?room=${encodeURIComponent(roomCode)}`,
    window.location.href
  ).toString();
}

function getSessionNickname() {
  return String(sessionStorage.getItem(NICKNAME_SESSION_KEY) || "").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Score Calculation
// ─────────────────────────────────────────────────────────────────────────────
function calculateScore(attempts, elapsedSeconds, isWinner) {
  if (!isWinner) return 0;
  // Base score: 5000
  // Penalty: 200 per attempt, 10 per second
  // Minimum score: 100 for a win
  const baseScore = 5000;
  const attemptPenalty = attempts * 200;
  const timePenalty = Math.floor(elapsedSeconds) * 10;
  const score = Math.max(100, baseScore - attemptPenalty - timePenalty);
  return score;
}

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatScore(score) {
  return score.toLocaleString("en-US");
}

// ─────────────────────────────────────────────────────────────────────────────
// UI Updaters
// ─────────────────────────────────────────────────────────────────────────────
function updateResultUI(isWinner) {
  const main = document.getElementById("result-main");
  const iconWrap = document.getElementById("result-icon-wrap");
  const icon = document.getElementById("result-icon");
  const title = document.getElementById("result-title");
  const subtitle = document.getElementById("result-subtitle");
  const scoreEl = document.getElementById("final-score");

  if (isWinner) {
    main?.classList.remove("kinetic-bg-defeat");
    main?.classList.add("kinetic-bg");
    iconWrap?.classList.remove("from-error", "to-error-dim");
    iconWrap?.classList.add("from-primary", "to-primary-dim");
    if (icon) icon.textContent = "workspace_premium";
    if (title) {
      title.textContent = "VICTORY!";
      title.classList.remove("text-error");
      title.classList.add("text-primary");
    }
    if (subtitle) subtitle.textContent = "승리했습니다!";
    scoreEl?.classList.remove("text-error");
    scoreEl?.classList.add("text-primary");
    spawnConfetti();
  } else {
    main?.classList.remove("kinetic-bg");
    main?.classList.add("kinetic-bg-defeat");
    iconWrap?.classList.remove("from-primary", "to-primary-dim");
    iconWrap?.classList.add("from-error", "to-error-dim");
    if (icon) icon.textContent = "sentiment_dissatisfied";
    if (title) {
      title.textContent = "DEFEAT!";
      title.classList.remove("text-primary");
      title.classList.add("text-error");
    }
    if (subtitle) subtitle.textContent = "아쉽게 패배했습니다";
    scoreEl?.classList.remove("text-primary");
    scoreEl?.classList.add("text-error");
  }
}

function updateStatsUI(attempts, elapsedSeconds, score) {
  const attemptsEl = document.getElementById("attempts-count");
  const timeEl = document.getElementById("elapsed-time");
  const scoreEl = document.getElementById("final-score");

  if (attemptsEl) attemptsEl.textContent = `${attempts} 회`;
  if (timeEl) timeEl.textContent = formatTime(elapsedSeconds);
  if (scoreEl) scoreEl.textContent = formatScore(score);
}

function renderPlaySummary(guesses, myNickname) {
  const listEl = document.getElementById("play-summary-list");
  const noHistoryMsg = document.getElementById("no-history-msg");
  if (!listEl) return;

  // Filter only my guesses
  const myGuesses = guesses.filter((g) => g.attacker === myNickname);

  if (myGuesses.length === 0) {
    if (noHistoryMsg) noHistoryMsg.classList.remove("hidden");
    return;
  }

  if (noHistoryMsg) noHistoryMsg.classList.add("hidden");
  listEl.innerHTML = "";

  myGuesses.forEach((g) => {
    const row = document.createElement("div");
    row.className = "flex items-center justify-between text-xs";

    // Digits
    const digitsWrap = document.createElement("div");
    digitsWrap.className = "flex gap-2 font-headline font-bold text-sm";
    const isOut = g.strikes === 3;
    digitsWrap.classList.add(isOut ? "text-primary" : "text-on-surface-variant");
    
    String(g.guess).split("").forEach((d) => {
      const span = document.createElement("span");
      span.textContent = d;
      digitsWrap.appendChild(span);
    });

    // Badges
    const badgesWrap = document.createElement("div");
    badgesWrap.className = "flex gap-1";

    if (isOut) {
      const outBadge = document.createElement("span");
      outBadge.className = "px-2 py-0.5 rounded-full bg-primary text-white text-[9px] font-black italic tracking-tighter";
      outBadge.textContent = "OUT!!";
      badgesWrap.appendChild(outBadge);
    } else {
      if (g.strikes > 0) {
        const strikeBadge = document.createElement("span");
        strikeBadge.className = "px-2 py-0.5 rounded-full bg-tertiary/10 text-tertiary text-[10px] font-black";
        strikeBadge.textContent = `${g.strikes}S`;
        badgesWrap.appendChild(strikeBadge);
      }
      if (g.balls > 0) {
        const ballBadge = document.createElement("span");
        ballBadge.className = "px-2 py-0.5 rounded-full bg-secondary/10 text-secondary text-[10px] font-black";
        ballBadge.textContent = `${g.balls}B`;
        badgesWrap.appendChild(ballBadge);
      }
      if (g.strikes === 0 && g.balls === 0) {
        const outBadge = document.createElement("span");
        outBadge.className = "px-2 py-0.5 rounded-full bg-error/10 text-error text-[10px] font-black";
        outBadge.textContent = "OUT";
        badgesWrap.appendChild(outBadge);
      }
    }

    row.appendChild(digitsWrap);
    row.appendChild(badgesWrap);
    listEl.appendChild(row);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Confetti Effect
// ─────────────────────────────────────────────────────────────────────────────
function spawnConfetti() {
  const colors = ["#0057bd", "#006947", "#755600", "#f59e0b", "#10b981"];
  for (let i = 0; i < 50; i++) {
    setTimeout(() => {
      const confetti = document.createElement("div");
      confetti.className = "confetti";
      confetti.style.left = `${Math.random() * 100}%`;
      confetti.style.width = `${6 + Math.random() * 6}px`;
      confetti.style.height = `${6 + Math.random() * 6}px`;
      confetti.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
      confetti.style.borderRadius = Math.random() > 0.5 ? "50%" : "2px";
      confetti.style.animationDuration = `${2 + Math.random() * 2}s`;
      confetti.style.animationDelay = `${Math.random() * 0.5}s`;
      document.body.appendChild(confetti);
      setTimeout(() => confetti.remove(), 5000);
    }, i * 30);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Data Fetching
// ─────────────────────────────────────────────────────────────────────────────
async function fetchGameData(roomCode) {
  const roomRef = ref(db, `${ROOMS_PATH}/${roomCode}`);
  const snapshot = await get(roomRef);
  if (!snapshot.exists()) return null;
  return snapshot.val();
}

// ─────────────────────────────────────────────────────────────────────────────
// Button Handlers
// ─────────────────────────────────────────────────────────────────────────────
async function handleRematch(roomCode) {
  if (!roomCode) {
    alert("방 정보가 없습니다.");
    window.location.replace(toHomeUrl());
    return;
  }

  try {
    // Reset room to waiting state
    const roomRef = ref(db, `${ROOMS_PATH}/${roomCode}`);
    await update(roomRef, {
      status: "waiting",
      gameplay: null, // Clear gameplay data
    });

    // Redirect to game room
    window.location.replace(toGameRoomUrl(roomCode));
  } catch (e) {
    console.error("Rematch error:", e);
    alert("다시 대전하기에 실패했습니다. 홈으로 이동합니다.");
    window.location.replace(toHomeUrl());
  }
}

function handleGoHome() {
  // Clear session and redirect
  sessionStorage.removeItem(NICKNAME_SESSION_KEY);
  window.location.replace(toHomeUrl());
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Initialization
// ─────────────────────────────────────────────────────────────────────────────
async function init() {
  const { roomCode, winner, you } = getUrlParams();
  const sessionNickname = getSessionNickname();
  const myNickname = you || sessionNickname;

  if (!roomCode) {
    console.error("No room code");
    window.location.replace(toHomeUrl());
    return;
  }

  const isWinner = winner === myNickname;

  // Update UI immediately with win/lose state
  updateResultUI(isWinner);

  // Fetch game data from Firebase
  const roomData = await fetchGameData(roomCode);
  if (!roomData) {
    console.error("Room not found");
    updateStatsUI(0, 0, 0);
    return;
  }

  const gameplay = roomData.gameplay || {};
  const guessesObj = gameplay.guesses || {};
  const guesses = Object.values(guessesObj).sort((a, b) => {
    const aTime = a.createdAt || 0;
    const bTime = b.createdAt || 0;
    return aTime - bTime;
  });

  // Calculate stats
  const myGuesses = guesses.filter((g) => g.attacker === myNickname);
  const attempts = myGuesses.length;

  // Calculate elapsed time from first guess to last guess or game end
  let elapsedSeconds = 0;
  if (guesses.length > 0) {
    const firstGuessTime = guesses[0].createdAt;
    const lastGuessTime = guesses[guesses.length - 1].createdAt;
    if (firstGuessTime && lastGuessTime) {
      elapsedSeconds = Math.max(0, (lastGuessTime - firstGuessTime) / 1000);
    }
  }

  // Fallback: estimate time based on room data
  if (elapsedSeconds === 0 && roomData.createdAt && gameplay.winner) {
    // Rough estimate: 30 seconds per round
    elapsedSeconds = Math.max(30, attempts * 25);
  }

  const score = calculateScore(attempts, elapsedSeconds, isWinner);

  // Update UI with stats
  updateStatsUI(attempts, elapsedSeconds, score);
  renderPlaySummary(guesses, myNickname);

  // Button handlers
  const btnRematch = document.getElementById("btn-rematch");
  const btnHome = document.getElementById("btn-home");
  const btnClose = document.getElementById("btn-close");

  btnRematch?.addEventListener("click", () => handleRematch(roomCode));
  btnHome?.addEventListener("click", handleGoHome);
  btnClose?.addEventListener("click", handleGoHome);
}

// Start
init();
