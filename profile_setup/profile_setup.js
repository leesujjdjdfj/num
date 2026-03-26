import { app } from "../firebase-config.js";
import {
  getAuth,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const auth = getAuth(app);
const db = getDatabase(app);

// 아바타 옵션 목록
const AVATAR_OPTIONS = [
  {
    id: "avatar1",
    url: "https://lh3.googleusercontent.com/aida-public/AB6AXuABkJbag-bmuZ2pMngzVii5XqUl90Zaq70vEIsI9qTU7NIwomMzRIO8IvJX3SF7tH9Fd6WXz6KXD1qgnVYVGHxhtyo9G2OYcQOVnBfyxF9EacoQvEEoV2bzaXWCvalZ1mGsBsWMUUAIgw1Ebt-6E13OdiuYj8kCXAi-bA85ZONz9bSDs6ZUzx_1mIAed7Vgeb6Kpg9nNri-Hj6cE2-kAcmInq_vehR-j5-wPhltSy1mhxMyUS-zO99tva9XNkrMDQgURzR9gEGyX6zo",
    alt: "밝은 파란 배경의 웃는 캐릭터"
  },
  {
    id: "avatar2",
    url: "https://lh3.googleusercontent.com/aida-public/AB6AXuDiOaY5Ly0-_hNtYJeWCTFGGkxCSjwIEPA03Mp7tJxa3lHX9MZkUxpvOOQEUygYnlneXERP79Jvkl6r8rlx7N3F1nJ2m4aTo2EId9MsC6dcAHtmdEOw-CJB3HHbl0zmJQoy6FpATM8n8cEzo_tZU9M25PApzGm_6mGH7HABjvac8ylxNlNe-fAYl785QTaK-uL1qCOu2Cn5vWYjVxZP1qq8UNOOKs6jxjTVrKol37GM4ldh1sHDGMAgEwoGuymwol5GFE-b7LuU1PGe",
    alt: "노란 배경의 안경 쓴 캐릭터"
  },
  {
    id: "avatar3",
    url: "https://lh3.googleusercontent.com/aida-public/AB6AXuCp-yWP9yDJb8WKhG5M3M3oEP6Dof7VVYxziXF2hQaeedhmQ3C91UArBlqlhmMFZKj8kx9o4tjPAoz9EBIeldauVc9KT7zpsALlKNMljaN4B0RVScnP2H1_o8Nw2UKzz7mChTZFZN_9Od_yQYUhD9_xvsGa_EENJbqp2YpVhIn6f75DARAtI1K2aadI6zSIJR0JqwtE8dPKhy0XkP2QVYeT6VrEubM1PuVuSjH6keLoRm8jB7x2Rs1TqC0u8p6e8NyoJ45sex7HigVb",
    alt: "민트 배경의 모자 쓴 게이머"
  },
  {
    id: "avatar4",
    url: "https://lh3.googleusercontent.com/aida-public/AB6AXuCA0Jtp2EirzCYRkg5zECuXJ779LTAkcLCQ2M1P4khrT5mRh5k2nTlRJn5ycRKeMqHsfMwR21ZLvTU-rR6lE9qdtsjxj8vVsEAwJQNMYAfkium6KxX0IJWPvT4alAQCm5lPHH70qgcUEumMDfIvf90MrzxE7nCDVjKPnsCsieXD5LYWCAWa7Q-NfGgMxHrOTDJoSuFgefcVniTWsnONhW3ZbpAY6Kr3TZQQU4rxOPos06Mamwf-OAysmoFxD1V9pjgg65TTKNqvYjPJ",
    alt: "기본 캐릭터"
  },
  {
    id: "avatar5",
    url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Felix&backgroundColor=b6e3f4",
    alt: "파란 배경 모험가 1"
  },
  {
    id: "avatar6",
    url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Aneka&backgroundColor=c0aede",
    alt: "보라 배경 모험가 2"
  },
  {
    id: "avatar7",
    url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Jasper&backgroundColor=d1d4f9",
    alt: "연보라 배경 모험가 3"
  },
  {
    id: "avatar8",
    url: "https://api.dicebear.com/7.x/adventurer/svg?seed=Milo&backgroundColor=ffd5dc",
    alt: "핑크 배경 모험가 4"
  },
];

// DOM 요소
const avatarGrid = document.getElementById("avatar-grid");
const selectedAvatarInput = document.getElementById("selected-avatar");
const nicknameInput = document.getElementById("nickname");
const profileForm = document.getElementById("profile-form");
const submitBtn = document.getElementById("submit-btn");
const submitBtnText = document.getElementById("submit-btn-text");
const errorMessage = document.getElementById("error-message");
const errorText = document.getElementById("error-text");

let currentUser = null;
let selectedAvatarUrl = "";

// 에러 메시지 표시
function showError(message) {
  errorText.textContent = message;
  errorMessage.classList.remove("hidden");
}

function hideError() {
  errorMessage.classList.add("hidden");
}

// 로딩 상태 설정
function setLoading(loading) {
  if (loading) {
    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-70");
    submitBtnText.textContent = "저장 중...";
  } else {
    submitBtn.disabled = false;
    submitBtn.classList.remove("opacity-70");
    submitBtnText.textContent = "설정 완료";
  }
}

// 아바타 그리드 렌더링
function renderAvatarGrid() {
  avatarGrid.innerHTML = "";
  
  AVATAR_OPTIONS.forEach((avatar, index) => {
    const div = document.createElement("div");
    div.className = "relative";
    div.innerHTML = `
      <div 
        class="avatar-option w-full aspect-square rounded-full overflow-hidden border-2 border-surface-container-highest bg-surface-container cursor-pointer transition-all hover:border-primary ${index === 0 ? 'ring-4 ring-primary selected' : ''}"
        data-avatar-id="${avatar.id}"
        data-avatar-url="${avatar.url}"
      >
        <img 
          src="${avatar.url}" 
          alt="${avatar.alt}" 
          class="w-full h-full object-cover"
        />
      </div>
      <div class="check-icon absolute -bottom-1 -right-1 w-5 h-5 bg-primary rounded-full items-center justify-center text-on-primary ${index === 0 ? 'flex' : 'hidden'}">
        <span class="material-symbols-outlined text-xs" style="font-variation-settings: 'FILL' 1;">check</span>
      </div>
    `;
    avatarGrid.appendChild(div);
  });

  // 첫 번째 아바타를 기본 선택
  selectedAvatarUrl = AVATAR_OPTIONS[0].url;
  selectedAvatarInput.value = selectedAvatarUrl;

  // 아바타 선택 이벤트
  avatarGrid.querySelectorAll(".avatar-option").forEach((el) => {
    el.addEventListener("click", () => {
      // 모든 아바타 선택 해제
      avatarGrid.querySelectorAll(".avatar-option").forEach((opt) => {
        opt.classList.remove("ring-4", "ring-primary", "selected");
        opt.parentElement.querySelector(".check-icon").classList.add("hidden");
        opt.parentElement.querySelector(".check-icon").classList.remove("flex");
      });
      
      // 클릭한 아바타 선택
      el.classList.add("ring-4", "ring-primary", "selected");
      el.parentElement.querySelector(".check-icon").classList.remove("hidden");
      el.parentElement.querySelector(".check-icon").classList.add("flex");
      
      selectedAvatarUrl = el.dataset.avatarUrl;
      selectedAvatarInput.value = selectedAvatarUrl;
    });
  });
}

// 닉네임 유효성 검사
function validateNickname(nickname) {
  const trimmed = nickname.trim();
  if (!trimmed) {
    return { valid: false, message: "닉네임을 입력해주세요." };
  }
  if (trimmed.length < 2) {
    return { valid: false, message: "닉네임은 2자 이상이어야 합니다." };
  }
  if (trimmed.length > 12) {
    return { valid: false, message: "닉네임은 12자 이하여야 합니다." };
  }
  // 특수문자 제한 (Firebase RTDB 키에 사용할 수 없는 문자)
  if (/[.$#\[\]\/]/.test(trimmed)) {
    return { valid: false, message: "닉네임에 . $ # [ ] / 문자는 사용할 수 없습니다." };
  }
  return { valid: true, nickname: trimmed };
}

// 프로필 저장
async function saveProfile(user, nickname, avatarUrl) {
  const userRef = ref(db, `users/${user.uid}`);
  
  await set(userRef, {
    nickname: nickname,
    avatar: avatarUrl,
    email: user.email,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  
  // localStorage에도 저장 (기존 앱 호환)
  localStorage.setItem("nickname", nickname);
  localStorage.setItem("uid", user.uid);
  localStorage.setItem("avatar", avatarUrl);
}

// 폼 제출 처리
profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  hideError();
  
  if (!currentUser) {
    showError("로그인이 필요합니다. 다시 로그인해주세요.");
    setTimeout(() => {
      window.location.href = "../auth_ux/auth_ux.html";
    }, 2000);
    return;
  }
  
  const validation = validateNickname(nicknameInput.value);
  if (!validation.valid) {
    showError(validation.message);
    return;
  }
  
  if (!selectedAvatarUrl) {
    showError("아바타를 선택해주세요.");
    return;
  }
  
  setLoading(true);
  
  try {
    await saveProfile(currentUser, validation.nickname, selectedAvatarUrl);
    
    // 메인 홈으로 이동
    window.location.href = "../home_ux/home_ux.html";
  } catch (error) {
    console.error("Profile save error:", error);
    showError("프로필 저장 중 오류가 발생했습니다. 다시 시도해주세요.");
    setLoading(false);
  }
});

// 인증 상태 확인
onAuthStateChanged(auth, async (user) => {
  if (!user) {
    // 로그인되지 않은 경우 로그인 페이지로
    window.location.href = "../auth_ux/auth_ux.html";
    return;
  }
  
  currentUser = user;
  
  // 이미 프로필이 설정되어 있는지 확인
  try {
    const userRef = ref(db, `users/${user.uid}`);
    const snapshot = await get(userRef);
    
    if (snapshot.exists()) {
      const userData = snapshot.val();
      if (userData.nickname) {
        // 이미 프로필이 설정되어 있으면 홈으로
        window.location.href = "../home_ux/home_ux.html";
        return;
      }
    }
  } catch (error) {
    console.error("Error checking user profile:", error);
  }
  
  // 구글 계정 이름이 있으면 기본값으로 설정
  if (user.displayName) {
    nicknameInput.value = user.displayName.slice(0, 12);
  }
  
  // 아바타 그리드 렌더링
  renderAvatarGrid();
});
