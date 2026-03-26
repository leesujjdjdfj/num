import { db } from "../firebase-config.js";
import {
  ref,
  get,
  update,
  remove,
  onValue,
  off,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────
const ROOMS_PATH = "rooms";
const NICKNAME_SESSION_KEY = "nickname";

// ─────────────────────────────────────────────────────────────────────────────
// Global state for cleanup
// ─────────────────────────────────────────────────────────────────────────────
let rematchUnsubscribe = null;
let currentRoomCode = null;
let currentNickname = null;
let opponentNickname = null;

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
// Rematch Modal UI
// ─────────────────────────────────────────────────────────────────────────────
function showRematchModal(opponentName) {
  const modal = document.getElementById("rematch-modal");
  const opponentNameEl = document.getElementById("rematch-opponent-name");
  if (opponentNameEl) opponentNameEl.textContent = opponentName;
  modal?.classList.remove("hidden");
}

function hideRematchModal() {
  const modal = document.getElementById("rematch-modal");
  modal?.classList.add("hidden");
}

function updateRematchButton(isWaiting) {
  const btnRematch = document.getElementById("btn-rematch");
  const btnCancelRematch = document.getElementById("btn-cancel-rematch");
  
  if (!btnRematch) return;

  if (isWaiting) {
    // Show waiting state: wide blue bar with cancel button
    btnRematch.classList.add("hidden");
    btnCancelRematch?.classList.remove("hidden");
  } else {
    // Show normal rematch button
    btnRematch.classList.remove("hidden");
    btnCancelRematch?.classList.add("hidden");
  }
}

function showCancelRematchButton(show = true) {
  const btnCancel = document.getElementById("btn-cancel-rematch");
  if (show) {
    btnCancel?.classList.remove("hidden");
  } else {
    btnCancel?.classList.add("hidden");
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Rematch Logic
// ─────────────────────────────────────────────────────────────────────────────
async function requestRematch(roomCode, nickname) {
  const rematchRef = ref(db, `${ROOMS_PATH}/${roomCode}/rematch/${nickname}`);
  await update(rematchRef, {
    ready: true,
    requestedAt: serverTimestamp(),
  });
  updateRematchButton(true);
}

function setupRematchListener(roomCode, myNickname, oppNickname) {
  const rematchRef = ref(db, `${ROOMS_PATH}/${roomCode}/rematch`);

  // Clean up previous listener if exists
  if (rematchUnsubscribe) {
    off(ref(db, `${ROOMS_PATH}/${currentRoomCode}/rematch`));
    rematchUnsubscribe = null;
  }

  rematchUnsubscribe = onValue(rematchRef, async (snapshot) => {
    const rematchData = snapshot.val() || {};
    const myReady = rematchData[myNickname]?.ready === true;
    const myDeclined = rematchData[myNickname]?.declined === true;
    const oppReady = rematchData[oppNickname]?.ready === true;
    const oppDeclined = rematchData[oppNickname]?.declined === true;

    // If opponent cancelled/declined - hide modal and reset UI
    if (!oppReady && !oppDeclined) {
      hideRematchModal();
    }

    // Show modal if opponent requested rematch but I haven't responded
    if (oppReady && !myReady && !myDeclined) {
      showRematchModal(oppNickname);
    }

    // Both ready - start new game
    if (myReady && oppReady) {
      hideRematchModal();
      await startNewGame(roomCode);
    }
  });
}

async function startNewGame(roomCode) {
  try {
    const roomRef = ref(db, `${ROOMS_PATH}/${roomCode}`);

    // Get current players
    const snapshot = await get(roomRef);
    const roomData = snapshot.val();
    if (!roomData) {
      window.location.replace(toHomeUrl());
      return;
    }

    // Reset players' secretNumber and status
    const players = roomData.players || {};
    const resetPlayers = {};
    for (const nick of Object.keys(players)) {
      resetPlayers[nick] = {
        ...players[nick],
        secretNumber: null, // Clear secret number
        status: "waiting",
      };
    }

    // Completely reset room state for new game
    await update(roomRef, {
      status: "waiting",
      gameState: "WAITING",
      currentRound: 0, // Reset round counter
      gameplay: {
        winner: null,
        guesses: null, // Completely clear old guesses
      },
      rematch: null, // Clear rematch data
      players: resetPlayers,
    });

    // Redirect to game room
    window.location.replace(toGameRoomUrl(roomCode));
  } catch (e) {
    console.error("Start new game error:", e);
    alert("새 게임 시작에 실패했습니다.");
  }
}

async function cancelRematchAndCleanup(roomCode, nickname) {
  try {
    // Remove my rematch request
    const myRematchRef = ref(db, `${ROOMS_PATH}/${roomCode}/rematch/${nickname}`);
    await remove(myRematchRef);

    // Check if room should be deleted (if I'm the only one or opponent also left)
    const roomRef = ref(db, `${ROOMS_PATH}/${roomCode}`);
    const snapshot = await get(roomRef);
    const roomData = snapshot.val();

    if (roomData) {
      // Mark room as finished if it still exists
      await update(roomRef, {
        status: "finished",
        rematch: null,
      });
    }
  } catch (e) {
    console.error("Cleanup error:", e);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Button Handlers
// ─────────────────────────────────────────────────────────────────────────────
async function handleRematch(roomCode, nickname) {
  if (!roomCode || !nickname) {
    alert("방 정보가 없습니다.");
    window.location.replace(toHomeUrl());
    return;
  }

  try {
    await requestRematch(roomCode, nickname);
  } catch (e) {
    console.error("Rematch error:", e);
    alert("다시 대전하기에 실패했습니다.");
    updateRematchButton(false);
  }
}

async function handleAcceptRematch(roomCode, nickname) {
  hideRematchModal();
  try {
    await requestRematch(roomCode, nickname);
  } catch (e) {
    console.error("Accept rematch error:", e);
    alert("재대결 수락에 실패했습니다.");
  }
}

async function handleDeclineRematch(roomCode, nickname) {
  hideRematchModal();
  // Mark as declined to inform requester
  try {
    const declineRef = ref(db, `${ROOMS_PATH}/${roomCode}/rematch/${nickname}`);
    await update(declineRef, {
      declined: true,
      ready: false,
      declinedAt: serverTimestamp(),
    });
  } catch (e) {
    console.error("Decline rematch error:", e);
  }
}

async function handleCancelRematchRequest(roomCode, nickname) {
  try {
    // Remove my rematch request
    const myRematchRef = ref(db, `${ROOMS_PATH}/${roomCode}/rematch/${nickname}`);
    await remove(myRematchRef);
    
    // Revert UI to normal state
    updateRematchButton(false);
  } catch (e) {
    console.error("Cancel rematch error:", e);
    alert("요청 취소에 실패했습니다.");
  }
}

async function handleGoHome() {
  // Cancel rematch and cleanup
  if (currentRoomCode && currentNickname) {
    await cancelRematchAndCleanup(currentRoomCode, currentNickname);
  }

  // Unsubscribe from listeners
  if (rematchUnsubscribe && currentRoomCode) {
    off(ref(db, `${ROOMS_PATH}/${currentRoomCode}/rematch`));
    rematchUnsubscribe = null;
  }

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

  // Get opponent nickname
  const players = roomData.players || {};
  const playerNames = Object.keys(players);
  const oppNick = playerNames.find((n) => n !== myNickname) || "";

  // Store global state for cleanup
  currentRoomCode = roomCode;
  currentNickname = myNickname;
  opponentNickname = oppNick;

  // Setup rematch listener
  if (oppNick) {
    setupRematchListener(roomCode, myNickname, oppNick);
  }
  
  // Button handlers
  const btnRematch = document.getElementById("btn-rematch");
  const btnCancelRematchIcon = document.getElementById("btn-cancel-rematch-icon");
  const btnHome = document.getElementById("btn-home");
  const btnClose = document.getElementById("btn-close");
  const btnAcceptRematch = document.getElementById("btn-accept-rematch");
  const btnDeclineRematch = document.getElementById("btn-decline-rematch");
  
  btnRematch?.addEventListener("click", () => handleRematch(roomCode, myNickname));
  btnCancelRematchIcon?.addEventListener("click", () => handleCancelRematchRequest(roomCode, myNickname));
  btnHome?.addEventListener("click", handleGoHome);
  btnClose?.addEventListener("click", handleGoHome);
  btnAcceptRematch?.addEventListener("click", () => handleAcceptRematch(roomCode, myNickname));
  btnDeclineRematch?.addEventListener("click", () => handleDeclineRematch(roomCode, myNickname));

  // Handle page unload - cleanup rematch request
  window.addEventListener("beforeunload", () => {
    if (currentRoomCode && currentNickname) {
      // Use sendBeacon for reliable cleanup on page close
      const rematchPath = `${ROOMS_PATH}/${currentRoomCode}/rematch/${currentNickname}`;
      navigator.sendBeacon?.(`https://numbaseball-6b498-default-rtdb.firebaseio.com/${rematchPath}.json`, JSON.stringify(null));
    }
  });
}

// Start
init();
