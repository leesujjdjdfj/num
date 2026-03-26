import { db } from "./firebase-config.js";
import {
  ref,
  runTransaction,
  serverTimestamp,
  get,
  onValue,
  update,
  push,
  set,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const ROOMS_PATH = "rooms";
const ROOM_CODE_LENGTH = 4;
const MAX_PLAYERS = 2;
const NICKNAME_SESSION_KEY = "nickname";
const UID_SESSION_KEY = "uid";
const DEFAULT_AVATAR_URL =
  "https://lh3.googleusercontent.com/aida-public/AB6AXuCA0Jtp2EirzCYRkg5zECuXJ779LTAkcLCQ2M1P4khrT5mRh5k2nTlRJn5ycRKeMqHsfMwR21ZLvTU-rR6lE9qdtsjxj8vVsEAwJQNMYAfkium6KxX0IJWPvT4alAQCm5lPHH70qgcUEumMDfIvf90MrzxE7nCDVjKPnsCsieXD5LYWCAWa7Q-NfGgMxHrOTDJoSuFgefcVniTWsnONhW3ZbpAY6Kr3TZQQU4rxOPos06Mamwf-OAysmoFxD1V9pjgg65TTKNqvYjPJ";

const CHAT_MESSAGE_MAX_LEN = 200;
const GAMEPLAY_TURN_MS = 30000;
const GAMEPLAY_TIMER_RING_C = 150.796; // 2 * pi * 24

function getRoomFromQuery() {
  const params = new URLSearchParams(window.location.search);
  const room = params.get("room");
  return room ? room.trim() : "";
}

function isValidRoom(room) {
  return /^[0-9]{4}$/.test(room);
}

function getSessionNickname() {
  return String(sessionStorage.getItem(NICKNAME_SESSION_KEY) || "").trim();
}

function getSessionUid() {
  return String(sessionStorage.getItem(UID_SESSION_KEY) || "").trim();
}

function setSessionUser(nickname, uid) {
  sessionStorage.setItem(NICKNAME_SESSION_KEY, nickname);
  sessionStorage.setItem(UID_SESSION_KEY, uid);
}

function sanitizeNickname(raw) {
  const value = String(raw || "").trim().replace(/\s+/g, " ").slice(0, 12);
  if (!value) return "";
  // RTDB key safe subset. 닉네임 표시용이기도 하지만, players 경로 키로도 사용합니다.
  return value.replace(/[.$#\[\]\/]/g, "");
}

function makeUid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function toHomeUrl() {
  return new URL("../home_ux/home_ux.html", window.location.href).toString();
}

function toGameRoomUrl(roomCode) {
  return new URL(
    `../game_room/game_room.html?room=${encodeURIComponent(roomCode)}`,
    window.location.href
  ).toString();
}

function toGameplayUrl(roomCode) {
  return new URL(
    `../gameplay_ux/gameplay_ux.html?room=${encodeURIComponent(roomCode)}`,
    window.location.href
  ).toString();
}

function toResultUrl(roomCode, winnerNickname, myNickname) {
  const u = new URL("../result/result.html", window.location.href);
  u.searchParams.set("room", roomCode);
  u.searchParams.set("winner", winnerNickname || "");
  u.searchParams.set("you", myNickname || "");
  return u.toString();
}

function redirectIfNoSessionUser() {
  const nickname = getSessionNickname();
  if (!nickname) {
    window.location.replace(toHomeUrl());
    return false;
  }
  return true;
}

function escapeHtml(text) {
  return String(text || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeChatText(raw) {
  return String(raw || "")
    .replace(/\r\n|\r|\n/g, " ")
    .trim()
    .slice(0, CHAT_MESSAGE_MAX_LEN);
}

function randomRoomCode() {
  const n = Math.floor(Math.random() * 10 ** ROOM_CODE_LENGTH);
  return String(n).padStart(ROOM_CODE_LENGTH, "0");
}

async function ensureSessionUser() {
  const nickname = getSessionNickname();
  const uid = getSessionUid();

  if (nickname && uid) return { nickname, uid };

  if (nickname && !uid) {
    const fixedUid = makeUid();
    sessionStorage.setItem(UID_SESSION_KEY, fixedUid);
    return { nickname, uid: fixedUid };
  }

  return await promptNicknameModal();
}

function promptNicknameModal() {
  return new Promise((resolve, reject) => {
    const existing = document.getElementById("nickname-modal-root");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "nickname-modal-root";
    overlay.className =
      "fixed inset-0 z-[100] bg-black/20 backdrop-blur-md flex items-center justify-center p-6";
    overlay.innerHTML = `
      <div class="w-full max-w-md bg-surface-container-lowest/90 backdrop-blur-md rounded-2xl shadow-[0_20px_40px_rgba(0,87,189,0.08)] p-6">
        <div class="flex items-start justify-between gap-4">
          <div>
            <p class="font-headline font-extrabold text-on-background text-lg">닉네임을 입력해 주세요</p>
            <p class="text-[11px] font-semibold text-on-surface-variant mt-2">같은 방에서는 다른 닉네임이 플레이어 구분에 사용됩니다.</p>
          </div>
          <button type="button" id="nickname-modal-close" class="w-10 h-10 rounded-full bg-surface-container-highest active:scale-95 transition-transform">
            <span class="material-symbols-outlined" data-icon="close">close</span>
          </button>
        </div>

        <div class="mt-5">
          <input id="nickname-modal-input" maxlength="12" class="w-full bg-surface-container-highest rounded-xl px-4 py-3 text-on-background font-bold text-center text-base outline-none focus:ring-2 focus:ring-primary/20" type="text" placeholder="예: 강속구왕"/>
          <p id="nickname-modal-error" class="mt-2 text-[11px] font-bold text-error hidden">닉네임을 입력해 주세요.</p>
        </div>

        <div class="mt-5">
          <button id="nickname-modal-confirm" type="button" class="w-full py-4 bg-gradient-to-r from-primary to-primary-container text-on-primary font-headline font-black rounded-full shadow-[0_10px_20px_rgba(0,87,189,0.3)] active:scale-95 transition-all">
            계속
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#nickname-modal-input");
    const errorEl = overlay.querySelector("#nickname-modal-error");
    const confirmBtn = overlay.querySelector("#nickname-modal-confirm");
    const closeBtn = overlay.querySelector("#nickname-modal-close");

    const cleanup = () => overlay.remove();

    const submit = () => {
      const nickname = sanitizeNickname(input.value);
      if (!nickname) {
        errorEl.classList.remove("hidden");
        input.focus();
        return;
      }
      const uid = getSessionUid() || makeUid();
      setSessionUser(nickname, uid);
      cleanup();
      resolve({ nickname, uid });
    };

    confirmBtn.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      submit();
    });
    closeBtn.addEventListener("click", () => {
      cleanup();
      reject(new Error("닉네임 모달을 닫았습니다."));
    });
  });
}

async function createRoomWithHost(roomCode, hostNickname, hostUid) {
  const roomRef = ref(db, `${ROOMS_PATH}/${roomCode}`);
  const tx = await runTransaction(roomRef, (current) => {
    if (current === null) {
      return {
        host: hostNickname,
        hostUid: hostUid,
        status: "waiting",
        gameState: "WAITING",
        createdAt: serverTimestamp(),
        players: {
          [hostNickname]: {
            uid: hostUid,
            name: hostNickname,
            status: "waiting",
            isHost: true,
            avatar: "",
            joinedAt: serverTimestamp(),
          },
        },
      };
    }
    return;
  });
  return tx.committed;
}

async function createRoomLoop(hostNickname, hostUid) {
  const maxAttempts = 30;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const code = randomRoomCode();
    const committed = await createRoomWithHost(code, hostNickname, hostUid);
    if (committed) return code;
  }
  throw new Error("방 코드 생성에 실패했습니다.");
}

async function joinRoom(roomCode, nickname, uid) {
  const roomRef = ref(db, `${ROOMS_PATH}/${roomCode}`);
  const roomSnap = await get(roomRef);
  if (!roomSnap.exists()) return false;

  const playersRootRef = ref(db, `${ROOMS_PATH}/${roomCode}/players`);

  let joined = false;
  const tx = await runTransaction(playersRootRef, (current) => {
    const players = current || {};
    if (players[nickname]) return players;
    if (Object.keys(players).length >= MAX_PLAYERS) return;

    const isHost = Object.keys(players).length === 0;
    const next = {
      ...players,
      [nickname]: {
        uid,
        name: nickname,
        status: "waiting",
        isHost,
        avatar: "",
        joinedAt: serverTimestamp(),
      },
    };
    joined = true;
    return next;
  });

  if (!tx.committed || !joined) return false;

  // room.host 보정(혹시 빠진 경우)
  await runTransaction(roomRef, (current) => {
    const next = current || {};
    if (!next.host) next.host = nickname;
    if (!next.hostUid) next.hostUid = uid;
    if (!next.status) next.status = "waiting";
    if (!next.gameState) next.gameState = "WAITING";
    return next;
  });

  return true;
}

function getCreateButton() {
  const buttons = Array.from(document.querySelectorAll("button"));
  return buttons.find((b) => (b.textContent || "").includes("방 만들기")) || null;
}

function getJoinButton() {
  const buttons = Array.from(document.querySelectorAll("button"));
  return buttons.find((b) => (b.textContent || "").includes("입장하기")) || null;
}

function getRoomCodeInput() {
  return document.querySelector('input[placeholder="코드 입력"]');
}

export function initLobby() {
  document.addEventListener("DOMContentLoaded", () => {
    const createBtn = getCreateButton();
    const joinBtn = getJoinButton();
    const roomInput = getRoomCodeInput();
    if (!createBtn || !joinBtn || !roomInput) return;

    createBtn.addEventListener("click", async () => {
      try {
        createBtn.disabled = true;
        const { nickname, uid } = await ensureSessionUser();
        const roomCode = await createRoomLoop(nickname, uid);
        window.location.assign(toGameRoomUrl(roomCode));
      } catch (err) {
        window.alert("방 만들기에 실패했습니다. 다시 시도해 주세요.");
        console.error(err);
      } finally {
        createBtn.disabled = false;
      }
    });

    async function handleJoin() {
      const raw = roomInput.value;
      const roomCode = raw ? raw.replace(/[^0-9]/g, "").slice(0, ROOM_CODE_LENGTH) : "";
      if (!isValidRoom(roomCode)) {
        window.alert("방 코드는 4자리 숫자여야 합니다.");
        return;
      }
      const { nickname, uid } = await ensureSessionUser();
      const ok = await joinRoom(roomCode, nickname, uid);
      if (!ok) {
        window.alert("존재하지 않는 방입니다.");
        return;
      }
      window.location.assign(toGameRoomUrl(roomCode));
    }

    joinBtn.addEventListener("click", async () => {
      try {
        await handleJoin();
      } catch (err) {
        window.alert("방 참가에 실패했습니다.");
        console.error(err);
      }
    });

    roomInput.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      void handleJoin();
    });
  });
}

function getRoomCodeTextEl() {
  return document.querySelector("#room-code");
}

function getStartButton() {
  const btns = Array.from(document.querySelectorAll("button"));
  return btns.find((b) => (b.textContent || "").includes("게임 시작하기")) || null;
}

function setStartButtonEnabled(btn, enabled) {
  if (!btn) return;
  if (enabled) {
    btn.disabled = false;
    btn.classList.remove("opacity-50", "cursor-not-allowed");
    btn.classList.add("opacity-100", "cursor-pointer");
  } else {
    btn.disabled = true;
    btn.classList.remove("opacity-100", "cursor-pointer");
    btn.classList.add("opacity-50", "cursor-not-allowed");
  }
}

function getPlayerCardContainer() {
  return document.querySelector("section.relative.grid");
}

function renderPlayersToUI({
  container,
  players,
  myNickname,
  onMyCardClick,
}) {
  const keys = Object.keys(players || {});
  const my = players?.[myNickname] || null;
  if (!my) {
    container.innerHTML = "";
    return;
  }

  const others = keys.filter((k) => k !== myNickname);
  const otherKey = others.length ? others[0] : null;
  const other = otherKey ? players[otherKey] : null;

  const myReadyLabel = my.status === "ready" ? "Ready" : "Waiting";
  const otherReadyLabel = other?.status === "ready" ? "READY" : "WAITING";

  const myAvatar = my.avatar || DEFAULT_AVATAR_URL;
  const otherAvatar = other?.avatar || DEFAULT_AVATAR_URL;

  const myIsHost = Boolean(my.isHost);
  const otherIsHost = Boolean(other?.isHost);

  container.innerHTML = `
    <div class="absolute inset-0 flex items-center justify-center z-10">
      <div class="bg-secondary-container text-on-secondary-container font-headline font-black italic px-4 py-2 rounded-full shadow-lg -rotate-12 scale-110 border-4 border-surface">
        VS
      </div>
    </div>

    <div
      class="bg-surface-container-lowest p-5 rounded-xl flex flex-col items-center gap-4 shadow-[0_15px_30px_rgba(0,0,0,0.05)] border-b-4 border-primary/20"
      data-player-card="me"
      role="button"
      tabindex="0"
    >
      <div class="relative">
        <img class="w-20 h-20 rounded-full object-cover ring-4 ring-primary-container" alt="${escapeHtml(
          myNickname
        )}" src="${escapeHtml(myAvatar)}"/>
        <div class="absolute -bottom-1 -right-1 bg-tertiary-container text-on-tertiary-container p-1 rounded-full shadow-sm" style="${
          my.status === "ready" ? "" : "display:none;"
        }">
          <span class="material-symbols-outlined text-sm font-bold" data-icon="check" style="font-variation-settings: 'FILL' 1;">check</span>
        </div>
      </div>
      <div class="text-center">
        <p class="font-headline font-bold text-on-surface">${escapeHtml(
          myNickname
        )} (나)</p>
        <p class="text-[10px] font-semibold ${
          my.status === "ready" ? "text-primary" : "text-on-surface-variant"
        } uppercase">${escapeHtml(myReadyLabel)}</p>
      </div>
      ${myIsHost ? `<div class="text-[10px] font-bold text-primary uppercase tracking-wider">HOST</div>` : ""}
    </div>

    ${
      other
        ? `
      <div class="bg-surface-container-low p-5 rounded-xl flex flex-col items-center gap-4 border-b-4 border-transparent min-h-[184px] justify-center">
        <div class="flex flex-col items-center gap-3 ${other.status === "ready" ? "" : "animate-pulse"}">
          <div class="w-20 h-20 rounded-full overflow-hidden bg-surface-container-highest flex items-center justify-center text-on-surface-variant/30">
            <img class="w-20 h-20 rounded-full object-cover ${other.status === "ready" ? "" : "opacity-90"}" alt="${escapeHtml(
              other.name
            )}" src="${escapeHtml(otherAvatar)}"/>
          </div>
          <div class="text-center">
            <p id="opponent-name" class="text-xs font-semibold text-on-surface-variant">${escapeHtml(
              other.name || otherKey
            )}</p>
            <p id="opponent-status-line" class="text-[10px] font-semibold text-on-surface-variant uppercase mt-1" style="${
              other.status === "ready" ? "" : ""
            }">${escapeHtml(otherReadyLabel)}</p>
            <div id="opponent-loading-dots" class="flex gap-1 justify-center mt-2" style="${
              other.status === "ready" ? "display:none;" : ""
            }">
              <div class="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
              <div class="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
              <div class="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
            </div>
          </div>
        </div>
        ${otherIsHost ? `<div class="text-[10px] font-bold text-primary uppercase tracking-wider">HOST</div>` : ""}
      </div>
      `
        : `
      <div class="bg-surface-container-low p-5 rounded-xl flex flex-col items-center gap-4 border-b-4 border-transparent min-h-[184px] justify-center">
        <div class="flex flex-col items-center gap-3 animate-pulse">
          <div class="w-20 h-20 rounded-full bg-surface-container-highest flex items-center justify-center text-on-surface-variant/30">
            <span class="material-symbols-outlined text-4xl" data-icon="person">person</span>
          </div>
          <div class="text-center">
            <p id="opponent-name" class="text-xs font-semibold text-on-surface-variant">상대방 대기 중...</p>
            <div id="opponent-loading-dots" class="flex gap-1 justify-center mt-2">
              <div class="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
              <div class="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
              <div class="w-1.5 h-1.5 rounded-full bg-primary/40"></div>
            </div>
          </div>
        </div>
      </div>
      `
    }
  `;

  const meCard = container.querySelector('[data-player-card="me"]');
  if (meCard && typeof onMyCardClick === "function") {
    meCard.addEventListener("click", onMyCardClick);
    meCard.addEventListener("keydown", (e) => {
      if (e.key === "Enter") onMyCardClick();
    });
  }
}

function renderGameRoomChatMessages(container, messagesVal, myNickname) {
  if (!container) return;
  const entries = Object.entries(messagesVal || {}).map(([id, m]) => ({
    id,
    sender: String(m?.sender || ""),
    text: String(m?.text || ""),
    createdAt: m?.createdAt,
  }));
  entries.sort((a, b) => a.id.localeCompare(b.id));

  container.replaceChildren();

  if (entries.length === 0) {
    const hint = document.createElement("p");
    hint.className =
      "text-[11px] text-on-surface-variant/80 text-center py-2 font-medium";
    hint.textContent = "메시지를 보내 대화를 시작해 보세요.";
    container.appendChild(hint);
    return;
  }

  for (const m of entries) {
    const isMine = m.sender === myNickname;
    const bubble = document.createElement("div");
    bubble.className = isMine
      ? "bg-primary-container/10 rounded-lg rounded-tr-none shadow-sm text-sm ml-auto block max-w-[90%] text-right p-3"
      : "bg-white/80 rounded-lg rounded-tl-none shadow-sm text-sm inline-block max-w-[90%] p-3";

    if (!isMine && m.sender) {
      const label = document.createElement("div");
      label.className = "text-[10px] font-bold text-on-surface-variant/90 mb-0.5";
      label.textContent = m.sender;
      bubble.appendChild(label);
    }

    const p = document.createElement("p");
    p.textContent = m.text;
    p.className = isMine ? "text-on-primary-container" : "text-on-surface";
    bubble.appendChild(p);
    container.appendChild(bubble);
  }

  container.scrollTop = container.scrollHeight;
}

export function initGameRoom() {
  document.addEventListener("DOMContentLoaded", async () => {
    if (!redirectIfNoSessionUser()) return;

    const roomCode = getRoomFromQuery();
    if (!isValidRoom(roomCode)) {
      window.alert("방 코드를 올바르게 입력해 주세요.");
      window.location.replace(toHomeUrl());
      return;
    }

    const nickname = getSessionNickname();
    const uid = getSessionUid();
    if (!nickname || !uid) {
      window.location.replace(toHomeUrl());
      return;
    }

    const roomRef = ref(db, `${ROOMS_PATH}/${roomCode}`);
    const playersRef = ref(db, `${ROOMS_PATH}/${roomCode}/players`);
    const container = getPlayerCardContainer();
    const startButton = getStartButton();
    const roomCodeTextEl = getRoomCodeTextEl();

    if (roomCodeTextEl) roomCodeTextEl.textContent = roomCode;

    const roomSnap = await get(roomRef);
    if (!roomSnap.exists()) {
      window.alert("존재하지 않는 방입니다.");
      window.location.replace(toHomeUrl());
      return;
    }

    // 내 플레이어 보정(홈에서 생성하지 않고 직접 진입하는 경우 대비)
    await runTransaction(playersRef, (current) => {
      const players = current || {};
      if (players[nickname]) return players;
      if (Object.keys(players).length >= MAX_PLAYERS) return players;

      const isHost = Object.keys(players).length === 0;
      return {
        ...players,
        [nickname]: {
          uid,
          name: nickname,
          status: "waiting",
          isHost,
          avatar: "",
          joinedAt: serverTimestamp(),
        },
      };
    });

    let latestGameState = "WAITING";
    let latestPlayers = {};

    onValue(playersRef, (snapshot) => {
      latestPlayers = snapshot.val() || {};
      renderPlayersToUI({
        container,
        players: latestPlayers,
        myNickname: nickname,
        onMyCardClick: async () => {
          const my = latestPlayers?.[nickname];
          if (!my) return;
          if (latestGameState === "START") return;
          const nextStatus = my.status === "ready" ? "waiting" : "ready";
          await update(ref(db, `${ROOMS_PATH}/${roomCode}/players/${nickname}`), {
            status: nextStatus,
            statusUpdatedAt: serverTimestamp(),
          });
        },
      });

      const my = latestPlayers?.[nickname];
      const isHost = Boolean(my?.isHost);
      const count = Object.keys(latestPlayers || {}).length;
      const enabled = count === MAX_PLAYERS && isHost && latestGameState !== "START";
      setStartButtonEnabled(startButton, enabled);
    });

    onValue(roomRef, (snapshot) => {
      const data = snapshot.val() || {};
      latestGameState = data.gameState || "WAITING";

      const my = latestPlayers?.[nickname];
      const isHost = Boolean(my?.isHost);
      const count = Object.keys(latestPlayers || {}).length;
      const enabled = count === MAX_PLAYERS && isHost && latestGameState !== "START";
      setStartButtonEnabled(startButton, enabled);

      if (latestGameState === "START") {
        window.location.assign(toGameplayUrl(roomCode));
      }
    });

    if (startButton) {
      startButton.addEventListener("click", async () => {
        const my = latestPlayers?.[nickname];
        if (!my?.isHost) return;
        const count = Object.keys(latestPlayers || {}).length;
        if (count !== MAX_PLAYERS) return;
        if (latestGameState === "START") return;

        await update(roomRef, {
          gameState: "START",
          startedAt: serverTimestamp(),
        });
      });
    }

    // Live Chat
    const messagesRef = ref(db, `${ROOMS_PATH}/${roomCode}/messages`);
    const chatMessagesEl = document.getElementById("game-room-chat-messages");
    const chatInput = document.getElementById("game-room-chat-input");
    const chatSend = document.getElementById("game-room-chat-send");

    if (chatMessagesEl && chatInput && chatSend) {
      onValue(messagesRef, (snapshot) => {
        renderGameRoomChatMessages(chatMessagesEl, snapshot.val() || {}, nickname);
      });

      const sendChatMessage = async () => {
        const text = sanitizeChatText(chatInput.value);
        if (!text) return;
        chatInput.value = "";
        try {
          const newRef = push(messagesRef);
          await set(newRef, {
            sender: nickname,
            uid,
            text,
            createdAt: serverTimestamp(),
          });
        } catch (e) {
          console.error(e);
          window.alert("메시지 전송에 실패했습니다.");
          chatInput.value = text;
        }
      };

      chatSend.addEventListener("click", () => void sendChatMessage());
      chatInput.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" || e.isComposing) return;
        e.preventDefault();
        void sendChatMessage();
      });
    }
  });
}

function isValidThreeUniqueDigits(str) {
  const s = String(str || "");
  if (!/^[0-9]{3}$/.test(s)) return false;
  const d = s.split("");
  return new Set(d).size === 3;
}

// 숫자야구 채점: 자리 같으면 STRIKE, 나머지 자리에서 숫자가 있으면 BALL, 둘 다 없으면 OUT
function scoreGuess(secret, guess) {
  const sec = String(secret || "");
  const g = String(guess || "");
  if (sec.length !== 3 || g.length !== 3) return { strikes: 0, balls: 0, isOut: true };

  let strikes = 0;
  const secChars = sec.split("");
  const gChars = g.split("");

  for (let i = 0; i < 3; i += 1) {
    if (secChars[i] === gChars[i]) {
      strikes += 1;
      secChars[i] = "";
      gChars[i] = "";
    }
  }

  let balls = 0;
  for (let i = 0; i < 3; i += 1) {
    if (!gChars[i]) continue;
    const j = secChars.findIndex((c) => c && c === gChars[i]);
    if (j >= 0) {
      balls += 1;
      secChars[j] = "";
    }
  }

  const isOut = strikes === 0 && balls === 0;
  return { strikes, balls, isOut };
}

export function initGameplay() {
  document.addEventListener("DOMContentLoaded", async () => {
    const ok = redirectIfNoSessionUser();
    if (!ok) return;

    const roomCode = getRoomFromQuery();
    if (!roomCode || !isValidRoom(roomCode)) {
      window.alert("방 코드를 올바르게 입력해 주세요.");
      window.location.replace(toHomeUrl());
      return;
    }

    const nickname = getSessionNickname();
    const uid = getSessionUid();
    if (!nickname || !uid) {
      window.location.replace(toHomeUrl());
      return;
    }

    // Key DOMs
    const opponentAvatarEl = document.querySelector("#opponent-avatar");
    const opponentStatusEl = document.querySelector("#opponent-status");
    const myAvatarEl = document.querySelector("#my-avatar");
    const myNameEl = document.querySelector("#my-name");
    const overlayEl = document.querySelector("#gameplay-wait-overlay");
    const overlayTitleEl = document.getElementById("gameplay-overlay-title");
    const overlaySubtitleEl = document.getElementById("gameplay-overlay-subtitle");
    const headerTurnBadge = document.getElementById("header-turn-badge");
    const headerMainTitle = document.getElementById("header-main-title");
    const inningRoundEl = document.getElementById("inning-round");
    const timerSecondsEl = document.getElementById("timer-seconds");
    const timerRingFg = document.getElementById("timer-ring-fg");
    // matchHistoryList는 battle board로 교체됨 — battle-board-rows 사용
    const mySecretHintWrap = document.getElementById("my-secret-hint-wrap");
    const mySecretHintEl = document.getElementById("my-secret-hint");

    const inputSlots = [
      document.getElementById("input-slot-1"),
      document.getElementById("input-slot-2"),
      document.getElementById("input-slot-3"),
    ];
    const legacyDigitSlots = [
      document.getElementById("digit-slot-0"),
      document.getElementById("digit-slot-1"),
      document.getElementById("digit-slot-2"),
    ];
    const digitSlots = inputSlots.every(Boolean) ? inputSlots : legacyDigitSlots;

    const keypadButtons = Array.from(document.querySelectorAll(".keypad-button"));
    const submitButton =
      document.getElementById("gameplay-submit-btn") ||
      Array.from(document.querySelectorAll("button")).find((b) => (b.textContent || "").includes("제출"));
    const keypadAll = submitButton ? keypadButtons.concat([submitButton]) : keypadButtons;

    let latestGameState = "WAITING";
    let latestPlayers = {};
    let latestGameplay = null;
    let serverTimeOffset = 0;
    let redirectDone = false;
    let prevTurnStartedAt = null;
    let localDigits = "";
    let timerTick = null;
    let keypadEnabledState = false;

    function serverNow() {
      return Date.now() + serverTimeOffset;
    }

    function getOtherNickname(players) {
      const keys = Object.keys(players || {});
      return keys.find((k) => k !== nickname) || "";
    }

    function setKeypadEnabled(enabled) {
      const isSecretSetupStep =
        overlayTitleEl &&
        String(overlayTitleEl.textContent || "").includes("비밀 숫자를 정하세요") &&
        overlayEl &&
        overlayEl.style.display !== "none";
      const effectiveEnabled = enabled || isSecretSetupStep;
      keypadEnabledState = effectiveEnabled;
      for (const btn of keypadButtons) {
        // Disabled 속성은 브라우저에서 클릭 이벤트 자체를 차단할 수 있어
        // 여기서는 사용하지 않습니다. 대신 pointer-events로만 제어합니다.
        btn.disabled = false;
        btn.style.pointerEvents = effectiveEnabled ? "auto" : "none";
        btn.classList.toggle("opacity-40", !effectiveEnabled);
        btn.classList.toggle("cursor-not-allowed", !effectiveEnabled);
        btn.classList.toggle("cursor-pointer", effectiveEnabled);
      }

      if (submitButton) {
        const canSubmit =
          effectiveEnabled &&
          localDigits.length === 3 &&
          isValidThreeUniqueDigits(localDigits);
        submitButton.disabled = !canSubmit;
        submitButton.style.pointerEvents = canSubmit ? "auto" : "none";
        // 버튼 스타일 활성화(파란색 느낌) — 기존 클래스 유지하면서 상태만 토글
        submitButton.classList.toggle("opacity-30", !canSubmit);
        submitButton.classList.toggle("cursor-not-allowed", !canSubmit);
        submitButton.classList.toggle("cursor-pointer", canSubmit);
      }
    }

    function updateDigitBoxUI() {
      for (let i = 0; i < 3; i += 1) {
        const el = digitSlots[i];
        if (!el) continue;
        const ch = localDigits[i];
        el.textContent = ch || "_";
      }

      // digits가 바뀌면 submit 활성 조건도 즉시 반영합니다.
      setKeypadEnabled(keypadEnabledState);
    }

    function syncMySecretDisplay(myPlayer) {
      if (!mySecretHintWrap || !mySecretHintEl) return;
      const secretDivider = document.getElementById("my-secret-divider");
      const sn = myPlayer?.secretNumber;
      if (isValidThreeUniqueDigits(sn)) {
        mySecretHintWrap.classList.remove("hidden");
        mySecretHintWrap.classList.add("flex");
        mySecretHintEl.textContent = String(sn).split("").join(" ");
        if (secretDivider) {
          secretDivider.classList.remove("hidden");
          secretDivider.classList.add("block");
        }
      } else {
        mySecretHintWrap.classList.add("hidden");
        mySecretHintWrap.classList.remove("flex");
        mySecretHintEl.textContent = "";
        if (secretDivider) {
          secretDivider.classList.add("hidden");
          secretDivider.classList.remove("block");
        }
      }
    }

    // ── Battle Board 렌더링 ─────────────────────────────────────────
    // 이미 렌더된 행 수를 추적해 새 행에만 애니메이션을 적용합니다.
    let _boardRenderedCount = 0;
    // 데이터 변경 감지를 위한 해시 (행 수가 같아도 내용이 바뀌면 재렌더)
    let _lastBoardDataHash = "";

    /** 배지(S/B/Out) DOM 생성 헬퍼 */
    function _makeBadges(g) {
      const wrap = document.createElement("div");
      wrap.className = "flex gap-1 justify-center flex-wrap mt-1";
      if (g.isOut) {
        const o = document.createElement("span");
        o.className =
          "px-2 h-5 rounded-full bg-error/15 flex items-center justify-center text-error font-black text-[9px] uppercase tracking-tighter";
        o.textContent = "Out";
        wrap.appendChild(o);
      } else {
        if ((g.strikes || 0) > 0) {
          const s = document.createElement("span");
          s.className =
            "w-5 h-5 rounded-full bg-tertiary flex items-center justify-center text-on-tertiary font-black text-[9px]";
          s.textContent = `${g.strikes}S`;
          wrap.appendChild(s);
        }
        if ((g.balls || 0) > 0) {
          const b = document.createElement("span");
          b.className =
            "w-5 h-5 rounded-full bg-secondary flex items-center justify-center text-on-secondary font-black text-[9px]";
          b.textContent = `${g.balls}B`;
          wrap.appendChild(b);
        }
        if ((g.strikes || 0) === 0 && (g.balls || 0) === 0) {
          const n = document.createElement("span");
          n.className =
            "px-2 h-5 rounded-full bg-outline-variant/20 flex items-center justify-center text-outline-variant font-black text-[9px] uppercase tracking-tighter";
          n.textContent = "0";
          wrap.appendChild(n);
        }
      }
      return wrap;
    }

    /** 한 칸(내 or 상대) 셀 생성 */
    function _makeCell(g, isMine) {
      const cell = document.createElement("div");
      cell.className = [
        "flex-1 flex flex-col items-center justify-center py-2.5 px-1 rounded-xl min-h-[56px]",
        isMine
          ? "bg-surface-container-lowest shadow-[0_2px_8px_rgba(0,87,189,0.08)]"
          : "bg-secondary-container/20",
      ].join(" ");

      const digStr = String(g?.guess || "");

      if (!digStr) {
        // guess가 없으면 대기 점 표시 (상대가 아직 입력 중)
        const waitWrap = document.createElement("div");
        waitWrap.className = "flex gap-1 items-center justify-center py-1";
        ["dot-animate", "dot-animate-delayed", "dot-animate-last"].forEach((cls) => {
          const dot = document.createElement("div");
          dot.className = `w-1.5 h-1.5 rounded-full ${isMine ? "bg-primary/30" : "bg-secondary/30"} ${cls}`;
          waitWrap.appendChild(dot);
        });
        cell.appendChild(waitWrap);
        return cell;
      }

      // 숫자 표시: 각 자리를 개별 박스로
      const digitsWrap = document.createElement("div");
      digitsWrap.className = "flex gap-1 items-center justify-center";

      digStr.split("").forEach((d) => {
        const box = document.createElement("div");
        box.className = [
          "w-7 h-8 rounded-lg flex items-center justify-center",
          isMine
            ? "bg-primary/10"
            : "bg-secondary/10",
        ].join(" ");
        const span = document.createElement("span");
        span.className = [
          "text-xl font-black font-headline leading-none tabular-nums",
          isMine ? "text-primary" : "text-secondary",
        ].join(" ");
        span.textContent = d;
        box.appendChild(span);
        digitsWrap.appendChild(box);
      });

      cell.appendChild(digitsWrap);
      if (g) cell.appendChild(_makeBadges(g));
      return cell;
    }

    /** 행 번호 뱃지 */
    function _makeRoundBadge(n) {
      const el = document.createElement("div");
      el.className =
        "w-8 flex-shrink-0 flex items-center justify-center";
      const inner = document.createElement("span");
      inner.className =
        "text-[9px] font-black text-outline-variant italic leading-none";
      inner.textContent = `#${n}`;
      el.appendChild(inner);
      return el;
    }

    /**
     * 좌우 배틀 보드 전체를 (재)렌더링합니다.
     * guessesVal: Firebase guesses 객체
     * players:    Firebase players 객체 (otherKey 파악용)
     */
    function renderMatchHistoryFromGame(guessesVal, players) {
      const boardRows = document.getElementById("battle-board-rows");
      if (!boardRows) return;

      const allPlayers = players || latestPlayers || {};
      const otherNickname = getOtherNickname(allPlayers);

      const entries = Object.entries(guessesVal || {})
        .map(([id, g]) => ({ id, ...g }))
        .sort((a, b) => a.id.localeCompare(b.id));

      // ── 각 라운드 인덱스별로 내 guess / 상대 guess 그룹화 ──
      // 라운드는 제출 순서 기준: 짝수 인덱스(0,2,…)는 선공, 홀수는 후공 등이 아니라
      // 단순히 시간 순으로 나열하되, 내 시도와 상대 시도를 같은 행 높이에 배치합니다.
      const myGuesses = entries.filter((g) => g.attacker === nickname);
      const oppGuesses = entries.filter((g) => g.attacker !== nickname);
      const rowCount = Math.max(myGuesses.length, oppGuesses.length);

      // 데이터 변경 감지: 전체 guess 데이터의 해시를 비교
      const dataHash = entries.map(e => `${e.id}:${e.guess}`).join("|");
      if (_lastBoardDataHash === dataHash && rowCount > 0) return; // 변경 없음
      _lastBoardDataHash = dataHash;

      // 전체 재렌더
      boardRows.replaceChildren();
      _boardRenderedCount = 0;

      for (let i = 0; i < rowCount; i++) {
        const myG = myGuesses[i] || null;
        const oppG = oppGuesses[i] || null;
        const rowIndex = i;

        const row = document.createElement("div");
        row.className = "bb-row flex items-stretch gap-0";

        // 신규 행에만 애니메이션 적용
        if (rowIndex >= _boardRenderedCount) {
          row.style.animationDelay = `${(rowIndex - _boardRenderedCount) * 60}ms`;
          row.classList.add("board-entry");
        }

        row.appendChild(_makeCell(myG, true));
        row.appendChild(_makeRoundBadge(i + 1));
        row.appendChild(_makeCell(oppG, false));

        boardRows.appendChild(row);
      }

      _boardRenderedCount = rowCount;

      // 최신 행으로 스크롤
      boardRows.scrollTop = boardRows.scrollHeight;
      const scrollParent = boardRows.closest(".overflow-y-auto");
      if (scrollParent) scrollParent.scrollTop = scrollParent.scrollHeight;
    }

    function getTurnRemainingMs(gp) {
      if (!gp || gp.phase !== "PLAY" || typeof gp.turnStartedAt !== "number") {
        return GAMEPLAY_TURN_MS;
      }
      const dur = gp.turnDurationMs || GAMEPLAY_TURN_MS;
      const elapsed = serverNow() - gp.turnStartedAt;
      return Math.max(0, dur - elapsed);
    }

    function paintTimer(remainingMs) {
      if (timerSecondsEl) {
        const sec = Math.ceil(remainingMs / 1000);
        timerSecondsEl.textContent = String(Math.min(99, Math.max(0, sec)));
      }
      if (timerRingFg) {
        const ratio = GAMEPLAY_TURN_MS > 0 ? Math.max(0, Math.min(1, remainingMs / GAMEPLAY_TURN_MS)) : 0;
        const off = GAMEPLAY_TIMER_RING_C * (1 - ratio);
        timerRingFg.setAttribute("stroke-dashoffset", String(off));
      }
    }

    async function tryInitGameplayPlay() {
      const players = latestPlayers || {};
      const keys = Object.keys(players);
      if (keys.length < 2) return;

      const mine = players[nickname];
      const otherKey = keys.find((k) => k !== nickname);
      const other = otherKey ? players[otherKey] : null;
      if (!mine || !other) return;
      if (!isValidThreeUniqueDigits(mine?.secretNumber)) return;
      if (!isValidThreeUniqueDigits(other?.secretNumber)) return;

      const gpSnap = await get(ref(db, `${ROOMS_PATH}/${roomCode}/gameplay`));
      const cur = gpSnap.val();
      if (cur?.phase === "PLAY" || cur?.phase === "ENDED") return;

      const gameplayRef = ref(db, `${ROOMS_PATH}/${roomCode}/gameplay`);
      const hostNick = keys.find((k) => players[k]?.isHost) || keys[0];

      try {
        await runTransaction(gameplayRef, (current) => {
          if (current && (current.phase === "PLAY" || current.phase === "ENDED")) return current;
          return {
            phase: "PLAY",
            currentTurn: hostNick,
            turnStartedAt: serverTimestamp(),
            turnDurationMs: GAMEPLAY_TURN_MS,
            guesses: current?.guesses || {},
          };
        });
      } catch (e) {
        console.error(e);
      }
    }

    async function tryPassTurnTimeout() {
      const gp = latestGameplay;
      if (!gp || gp.phase !== "PLAY" || redirectDone) return;

      const gameplayRef = ref(db, `${ROOMS_PATH}/${roomCode}/gameplay`);
      const keys = Object.keys(latestPlayers || {});
      if (keys.length < 2) return;

      try {
        await runTransaction(gameplayRef, (cur) => {
          if (!cur || cur.phase !== "PLAY") return cur;
          const started =
            typeof cur.turnStartedAt === "number" ? cur.turnStartedAt : 0;
          const dur = cur.turnDurationMs || GAMEPLAY_TURN_MS;
          if (serverNow() - started < dur) return cur;

          const next = keys.find((k) => k !== cur.currentTurn);
          if (!next) return cur;

          return {
            ...cur,
            currentTurn: next,
            turnStartedAt: serverTimestamp(),
          };
        });
      } catch (e) {
        console.error(e);
      }
    }

    async function submitSecretFlow() {
      if (!isValidThreeUniqueDigits(localDigits)) {
        window.alert("서로 다른 숫자 3자리를 정해 주세요.");
        return;
      }

      const myPlayerRef = ref(db, `${ROOMS_PATH}/${roomCode}/players/${nickname}`);
      try {
        await update(myPlayerRef, { secretNumber: localDigits });
        localDigits = "";
        updateDigitBoxUI();
      } catch (e) {
        console.error(e);
        window.alert("비밀 숫자 저장에 실패했습니다.");
      }
    }

    async function submitGuessFlow() {
      const players = latestPlayers || {};
      const gp = latestGameplay;
      if (!gp || gp.phase !== "PLAY" || gp.currentTurn !== nickname) return;

      if (!isValidThreeUniqueDigits(localDigits)) {
        window.alert("서로 다른 숫자 3자리를 입력해 주세요.");
        return;
      }

      const otherKey = getOtherNickname(players);
      if (!otherKey) return;
      const defenderSecret = players[otherKey]?.secretNumber;
      if (!isValidThreeUniqueDigits(defenderSecret)) return;

      const { strikes, balls, isOut } = scoreGuess(defenderSecret, localDigits);

      const guessesRoot = ref(db, `${ROOMS_PATH}/${roomCode}/gameplay/guesses`);
      const newGuessRef = push(guessesRoot);

      try {
        if (strikes === 3) {
          await set(newGuessRef, {
            attacker: nickname,
            guess: localDigits,
            strikes,
            balls,
            isOut: false,
            createdAt: serverTimestamp(),
          });
          await update(ref(db, `${ROOMS_PATH}/${roomCode}/gameplay`), {
            phase: "ENDED",
            winner: nickname,
            lastGuess: {
              attacker: nickname,
              guess: localDigits,
              strikes,
              balls,
              isOut: false,
            },
          });
        } else {
          await set(newGuessRef, {
            attacker: nickname,
            guess: localDigits,
            strikes,
            balls,
            isOut,
            createdAt: serverTimestamp(),
          });
          await update(ref(db, `${ROOMS_PATH}/${roomCode}/gameplay`), {
            currentTurn: otherKey,
            turnStartedAt: serverTimestamp(),
            lastGuess: {
              attacker: nickname,
              guess: localDigits,
              strikes,
              balls,
              isOut,
            },
          });
        }
        localDigits = "";
        updateDigitBoxUI();
      } catch (e) {
        console.error(e);
        window.alert("제출에 실패했습니다.");
      }
    }

    function onKeypadClick(e) {
      const btn = e.currentTarget;
      if (!(btn instanceof HTMLButtonElement)) return;
      const isSecretSetupStep =
        overlayTitleEl &&
        String(overlayTitleEl.textContent || "").includes("비밀 숫자를 정하세요") &&
        overlayEl &&
        overlayEl.style.display !== "none";
      if (!keypadEnabledState && !isSecretSetupStep) return;

      const backspace = btn.querySelector('[data-icon="backspace"]');
      if (backspace) {
        localDigits = localDigits.slice(0, -1);
        updateDigitBoxUI();
        return;
      }

      const t = (btn.textContent || "").trim();
      if (!/^\d$/.test(t)) return;
      if (localDigits.includes(t)) return;
      if (localDigits.length >= 3) return;
      localDigits += t;
      updateDigitBoxUI();
    }

    function onSubmitClick() {
      const players = latestPlayers || {};
      const otherKey = getOtherNickname(players);
      const myPlayer = players[nickname];
      const otherPlayer = otherKey ? players[otherKey] : null;

      const mySecretOk = isValidThreeUniqueDigits(myPlayer?.secretNumber);
      const otherSecretOk = isValidThreeUniqueDigits(otherPlayer?.secretNumber);

      if (latestGameplay?.phase === "PLAY") {
        void submitGuessFlow();
      } else {
        if (!mySecretOk) void submitSecretFlow();
      }
    }

    for (const b of keypadButtons) {
      b.addEventListener("click", onKeypadClick);
    }
    if (submitButton) {
      submitButton.addEventListener("click", () => void onSubmitClick());
    }

    // server time offset
    onValue(ref(db, ".info/serverTimeOffset"), (snap) => {
      serverTimeOffset = Number(snap.val()) || 0;
    });

    const roomRef = ref(db, `${ROOMS_PATH}/${roomCode}`);
    const playersRef = ref(db, `${ROOMS_PATH}/${roomCode}/players`);
    const gameplayRef = ref(db, `${ROOMS_PATH}/${roomCode}/gameplay`);
    const myPlayerRef = ref(db, `${ROOMS_PATH}/${roomCode}/players/${nickname}`);

    // 화면 초기화
    if (myNameEl) myNameEl.textContent = nickname;
    if (myAvatarEl) myAvatarEl.src = "";
    if (opponentAvatarEl) opponentAvatarEl.src = DEFAULT_AVATAR_URL;
    if (opponentStatusEl) opponentStatusEl.innerHTML = `<span id="opponent-name">상대방</span> 대기 중...`;
    if (overlayEl) overlayEl.style.display = "flex";
    setKeypadEnabled(false);

    // gameplay 진입 flag
    try {
      await update(myPlayerRef, { inGameplay: true, uid });
    } catch (e) {
      console.error(e);
    }

    function applyUI() {
      const players = latestPlayers || {};
      const keys = Object.keys(players);
      const bothPlayers = keys.length >= 2;
      const otherNickname = getOtherNickname(players);
      const other = otherNickname ? players[otherNickname] : null;
      const my = players[nickname] || null;

      if (myAvatarEl) myAvatarEl.src = my?.avatar || DEFAULT_AVATAR_URL;

      // ── 배틀 보드 닉네임 헤더 업데이트 ──
      const boardMyNameEl = document.getElementById("board-my-name");
      const boardOppNameEl = document.getElementById("board-opp-name");
      if (boardMyNameEl) boardMyNameEl.textContent = nickname || "나";
      if (boardOppNameEl) boardOppNameEl.textContent = other?.name || otherNickname || "상대방";

      if (!bothPlayers) {
        if (overlayEl) overlayEl.style.display = "flex";
        if (overlayTitleEl) overlayTitleEl.textContent = "상대가 들어오는 중...";
        if (overlaySubtitleEl) overlaySubtitleEl.textContent = "두 플레이어가 준비되면 진행할 수 있습니다.";
        if (opponentStatusEl) {
          opponentStatusEl.innerHTML = `<span id="opponent-name">상대방</span> 대기 중...`;
        }
        setKeypadEnabled(false);
        renderMatchHistoryFromGame({}, players);
        paintTimer(GAMEPLAY_TURN_MS);
        syncMySecretDisplay(my);
        return;
      }

      syncMySecretDisplay(my);

      const mySecretOk = isValidThreeUniqueDigits(my?.secretNumber);
      const otherSecretOk = isValidThreeUniqueDigits(other?.secretNumber);
      const phase = latestGameplay?.phase;

      const nameHtml = `<span id="opponent-name">${escapeHtml(other?.name || otherNickname)}</span>`;

      // 승리 상태(ENDED)는 setup 단계에서도 바��� 처리합니다.
      if (phase === "ENDED" && latestGameplay?.winner && !redirectDone) {
        redirectDone = true;
        window.location.replace(toResultUrl(roomCode, latestGameplay.winner, nickname));
        return;
      }

      // Setup 단계
      if (!mySecretOk || !otherSecretOk || phase !== "PLAY") {
        void tryInitGameplayPlay();

        if (overlayEl) {
          overlayEl.style.display = "flex";
          // 비밀 숫자 입력 단계에서는 오버레이가 입력 박스를 가리지 않게 처리
          if (!mySecretOk) {
            overlayEl.style.background = "transparent";
            overlayEl.style.backdropFilter = "none";
            overlayEl.style.pointerEvents = "none";
            // 일부 환경에서 pointer-events none이 stack interaction에 의해 불완전하게 동작하는 경우가 있어,
            // 입력 박���/키패드 아래로 보내 클릭이 확실히 전달되게 합니다.
            overlayEl.style.zIndex = "40";
            // overlay 내부 자식 요소까지 pointer-events를 꺼서 100% 클릭 전달을 보장합니다.
            for (const node of overlayEl.querySelectorAll("*")) {
              node.style.pointerEvents = "none";
            }
          } else {
            overlayEl.style.background = "";
            overlayEl.style.backdropFilter = "";
            overlayEl.style.pointerEvents = "";
            overlayEl.style.zIndex = "";
            // setup 단계가 끝났으면 overlay 자식의 pointer-events도 원복합니다.
            for (const node of overlayEl.querySelectorAll("*")) {
              node.style.pointerEvents = "";
            }
          }
        }

        if (!mySecretOk) {
          if (overlayTitleEl) overlayTitleEl.textContent = "비밀 숫자를 정하세요";
          if (overlaySubtitleEl) {
            overlaySubtitleEl.textContent =
              "0~9 중 겹치지 않는 세 자리를 입력한 뒤 제출하세요.";
          }
          setKeypadEnabled(true);
        } else {
          if (overlayTitleEl) overlayTitleEl.textContent = "상대 설정 대기";
          if (overlaySubtitleEl) {
            overlaySubtitleEl.textContent =
              "상대방이 비밀 숫자를 모두 정하면 게임이 시작됩니다.";
          }
          setKeypadEnabled(false);
        }

        if (opponentStatusEl) {
          opponentStatusEl.innerHTML = `${nameHtml}${mySecretOk ? "님과 연결됨" : "님 대기 중..."}`;
        }

        if (headerTurnBadge) headerTurnBadge.textContent = "SETUP";
        if (headerMainTitle) headerMainTitle.textContent = mySecretOk ? "대기 중" : "숫자를 정하세요";

        renderMatchHistoryFromGame(latestGameplay?.guesses || {}, players);
        paintTimer(GAMEPLAY_TURN_MS);
        return;
      }

      // PLAY 단계
      if (overlayEl) overlayEl.style.display = "none";

      if (latestGameplay?.phase === "ENDED" && latestGameplay?.winner && !redirectDone) {
        redirectDone = true;
        window.location.replace(toResultUrl(roomCode, latestGameplay.winner, nickname));
        return;
      }

      const gp = latestGameplay;
      const isMyTurn = gp?.currentTurn === nickname;
      const rem = getTurnRemainingMs(gp);

      if (headerTurnBadge) headerTurnBadge.textContent = isMyTurn ? "YOUR TURN" : "OPPONENT";
      if (headerMainTitle) headerMainTitle.textContent = isMyTurn ? "입력하세요" : "상대 턴";
      if (opponentStatusEl) {
        opponentStatusEl.innerHTML = isMyTurn
          ? `${nameHtml}의 숫자를 맞혀 보세요`
          : `${nameHtml}가 입력 중...`;
      }

      setKeypadEnabled(isMyTurn);

      if (inningRoundEl) {
        const count = Object.keys(gp?.guesses || {}).length;
        inningRoundEl.textContent = String(Math.min(99, count + 1)).padStart(2, "0");
      }

      renderMatchHistoryFromGame(gp?.guesses || {}, players);
      paintTimer(rem);

      if (typeof gp?.turnStartedAt === "number" && gp.turnStartedAt !== prevTurnStartedAt) {
        prevTurnStartedAt = gp.turnStartedAt;
        localDigits = "";
        updateDigitBoxUI();
      }
    }

    onValue(roomRef, (snap) => {
      const data = snap.val() || {};
      latestGameState = data.gameState || "WAITING";
    });

    onValue(playersRef, (snap) => {
      latestPlayers = snap.val() || {};
      applyUI();
    });

    onValue(gameplayRef, (snap) => {
      latestGameplay = snap.val();
      applyUI();
    });

    timerTick = window.setInterval(() => {
      const gp = latestGameplay;
      if (!gp || gp.phase !== "PLAY") {
        paintTimer(GAMEPLAY_TURN_MS);
        return;
      }
      const rem = getTurnRemainingMs(gp);
      paintTimer(rem);
      if (rem <= 0) void tryPassTurnTimeout();
    }, 250);
  });
}

