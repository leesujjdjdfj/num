import { auth, db } from '../firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { ref, get, update, onValue, off } from 'https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js';

// ─────────────────────────────────────────────────────────────────────────────
// Avatar Data
// ─────────────────────────────────────────────────────────────────────────────
const AVATARS = [
  '🎮', '⚾', '🏆', '🎯',
  '🚀', '⭐', '🎨', '🎭'
];

let currentUser = null;
let currentUid = null;
let selectedAvatar = null;
let gameStatsListener = null;

// ─────────────────────────────────────────────────────────────────────────────
// UI Updates
// ─────────────────────────────────────────────────────────────────────────────
function updateProfileUI(userData) {
  const nicknameEl = document.getElementById('profile-nickname');
  const avatarEl = document.getElementById('profile-avatar');
  
  if (nicknameEl) {
    nicknameEl.textContent = userData.nickname || 'Player';
  }
  
  if (avatarEl) {
    avatarEl.textContent = userData.avatar || '🎮';
  }
  
  // Store for modal
  selectedAvatar = userData.avatar || '🎮';
}

function updateStatsUI(stats) {
  const totalGames = stats.totalGames || 0;
  const wins = stats.wins || 0;
  const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
  const bestScore = stats.bestScore || 0;
  
  const totalEl = document.getElementById('stat-total-games');
  const winsEl = document.getElementById('stat-wins');
  const rateEl = document.getElementById('stat-win-rate');
  const scoreEl = document.getElementById('stat-best-score');
  
  if (totalEl) totalEl.textContent = totalGames;
  if (winsEl) winsEl.textContent = wins;
  if (rateEl) rateEl.textContent = `${winRate}%`;
  if (scoreEl) scoreEl.textContent = bestScore.toLocaleString('en-US');
}

function renderAvatarGrid(containerId, onSelect) {
  const container = document.getElementById(containerId);
  if (!container) return;
  
  container.innerHTML = '';
  AVATARS.forEach((avatar) => {
    const div = document.createElement('div');
    div.className = `avatar-option relative w-16 h-16 bg-surface-container-low rounded-lg flex items-center justify-center text-3xl border-2 border-transparent ${
      avatar === selectedAvatar ? 'selected ring-2 ring-primary' : ''
    }`;
    div.textContent = avatar;
    div.addEventListener('click', () => {
      document.querySelectorAll(`#${containerId} .avatar-option`).forEach((el) => {
        el.classList.remove('selected', 'ring-2', 'ring-primary');
      });
      div.classList.add('selected', 'ring-2', 'ring-primary');
      selectedAvatar = avatar;
      if (onSelect) onSelect(avatar);
    });
    container.appendChild(div);
  });
}

function renderRecentGames(games) {
  const container = document.getElementById('recent-games-list');
  if (!container) return;
  
  if (!games || games.length === 0) {
    container.innerHTML = '<p class="text-center text-on-surface-variant text-sm py-4">게임 기록이 없습니다</p>';
    return;
  }
  
  container.innerHTML = '';
  games.slice(0, 5).forEach((game) => {
    const div = document.createElement('div');
    div.className = `flex items-center justify-between p-3 bg-surface-container-lowest rounded-lg shadow-sm`;
    
    const isWin = game.isWin;
    const scoreText = game.score ? game.score.toLocaleString('en-US') : '0';
    
    div.innerHTML = `
      <div class="flex items-center gap-3 flex-1">
        <div class="w-10 h-10 rounded-lg flex items-center justify-center ${isWin ? 'bg-primary/10' : 'bg-error/10'}">
          <span class="material-symbols-outlined text-lg ${isWin ? 'text-primary' : 'text-error'}" style="font-variation-settings: 'FILL' 1;">${isWin ? 'workspace_premium' : 'sentiment_dissatisfied'}</span>
        </div>
        <div>
          <p class="text-sm font-semibold">${isWin ? '승리' : '패배'}</p>
          <p class="text-[10px] text-on-surface-variant">${new Date(game.playedAt).toLocaleDateString('ko-KR')}</p>
        </div>
      </div>
      <div class="text-right">
        <p class="font-headline font-bold text-lg ${isWin ? 'text-primary' : 'text-error'}">${scoreText}</p>
        <p class="text-[10px] text-on-surface-variant">점수</p>
      </div>
    `;
    container.appendChild(div);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Firebase Operations
// ─────────────────────────────────────────────────────────────────────────────
async function loadUserProfile(uid) {
  try {
    const userRef = ref(db, `users/${uid}`);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
      const userData = snapshot.val();
      updateProfileUI(userData);
      return userData;
    }
  } catch (error) {
    console.error('Error loading profile:', error);
  }
  return null;
}

function setupStatsListener(uid) {
  try {
    // Clean up existing listener
    if (gameStatsListener) {
      off(ref(db, `users/${uid}/stats`));
      gameStatsListener = null;
    }
    
    const statsRef = ref(db, `users/${uid}/stats`);
    gameStatsListener = onValue(statsRef, (snapshot) => {
      if (snapshot.exists()) {
        const stats = snapshot.val();
        updateStatsUI(stats);
      } else {
        updateStatsUI({ totalGames: 0, wins: 0, bestScore: 0 });
      }
    });
  } catch (error) {
    console.error('Error setting up stats listener:', error);
  }
}

function setupRecentGamesListener(uid) {
  try {
    const gamesRef = ref(db, `users/${uid}/recentGames`);
    onValue(gamesRef, (snapshot) => {
      if (snapshot.exists()) {
        const gamesObj = snapshot.val();
        const games = Object.values(gamesObj || {}).sort((a, b) => {
          return new Date(b.playedAt) - new Date(a.playedAt);
        });
        renderRecentGames(games);
      } else {
        renderRecentGames([]);
      }
    });
  } catch (error) {
    console.error('Error setting up recent games listener:', error);
  }
}

async function updateUserAvatar(uid, avatar) {
  try {
    const userRef = ref(db, `users/${uid}`);
    await update(userRef, { avatar });
    localStorage.setItem('avatar', avatar);
  } catch (error) {
    console.error('Error updating avatar:', error);
    throw error;
  }
}

async function updateUserNickname(uid, nickname) {
  try {
    if (nickname.length < 2 || nickname.length > 12) {
      throw new Error('닉네임은 2~12자여야 합니다');
    }
    
    const userRef = ref(db, `users/${uid}`);
    await update(userRef, { nickname });
    localStorage.setItem('nickname', nickname);
  } catch (error) {
    console.error('Error updating nickname:', error);
    throw error;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Modal Handlers
// ─────────────────────────────────────────────────────────────────────────────
function openAvatarModal() {
  const modal = document.getElementById('avatar-modal');
  renderAvatarGrid('avatar-grid-modal', null);
  modal?.classList.remove('hidden');
}

function closeAvatarModal() {
  const modal = document.getElementById('avatar-modal');
  modal?.classList.add('hidden');
}

function openProfileEditModal(currentNickname) {
  const modal = document.getElementById('profile-edit-modal');
  const nicknameInput = document.getElementById('edit-nickname');
  if (nicknameInput) {
    nicknameInput.value = currentNickname;
  }
  modal?.classList.remove('hidden');
}

function closeProfileEditModal() {
  const modal = document.getElementById('profile-edit-modal');
  modal?.classList.add('hidden');
}

// ─────────────────────────────────────────────────────────────────────────────
// Event Listeners
// ─────────────────────────────────────────────────────────────────────────────
function setupEventListeners() {
  // Close button
  document.getElementById('btn-close')?.addEventListener('click', () => {
    window.location.href = '../home_ux/home_ux.html';
  });
  
  // Avatar edit
  document.getElementById('btn-edit-avatar')?.addEventListener('click', openAvatarModal);
  document.getElementById('profile-avatar')?.addEventListener('click', openAvatarModal);
  document.getElementById('btn-close-modal')?.addEventListener('click', closeAvatarModal);
  
  document.getElementById('btn-confirm-avatar')?.addEventListener('click', async () => {
    if (!currentUid) return;
    try {
      await updateUserAvatar(currentUid, selectedAvatar);
      updateProfileUI({ nickname: document.getElementById('profile-nickname').textContent, avatar: selectedAvatar });
      closeAvatarModal();
    } catch (error) {
      alert('아바타 변경에 실패했습니다');
    }
  });
  
  // Profile edit
  document.getElementById('btn-edit-profile')?.addEventListener('click', () => {
    const nickname = document.getElementById('profile-nickname')?.textContent || '';
    openProfileEditModal(nickname);
  });
  
  document.getElementById('btn-close-edit-modal')?.addEventListener('click', closeProfileEditModal);
  document.getElementById('btn-cancel-edit')?.addEventListener('click', closeProfileEditModal);
  
  document.getElementById('edit-profile-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUid) return;
    
    const newNickname = document.getElementById('edit-nickname')?.value.trim() || '';
    
    if (newNickname.length < 2) {
      alert('닉네임은 최소 2자 이상이어야 합니다');
      return;
    }
    
    try {
      await updateUserNickname(currentUid, newNickname);
      updateProfileUI({ nickname: newNickname, avatar: selectedAvatar });
      closeProfileEditModal();
    } catch (error) {
      alert(error.message || '닉네임 변경에 실패했습니다');
    }
  });
  
  // Logout
  document.getElementById('btn-logout')?.addEventListener('click', async () => {
    if (confirm('로그아웃하시겠습니까?')) {
      try {
        await signOut(auth);
        localStorage.removeItem('nickname');
        localStorage.removeItem('uid');
        localStorage.removeItem('avatar');
        window.location.href = '../auth_ux/auth_ux.html';
      } catch (error) {
        console.error('Logout error:', error);
        alert('로그아웃에 실패했습니다');
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Initialize
// ─────────────────────────────────────────────────────────────────────────────
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    window.location.href = '../auth_ux/auth_ux.html';
    return;
  }
  
  currentUser = user;
  currentUid = user.uid;
  
  // Load user profile
  const userData = await loadUserProfile(user.uid);
  if (!userData) {
    alert('사용자 정보를 불러올 수 없습니다');
    window.location.href = '../home_ux/home_ux.html';
    return;
  }
  
  // Setup listeners for real-time updates
  setupStatsListener(user.uid);
  setupRecentGamesListener(user.uid);
  
  // Setup event listeners
  setupEventListeners();
});
