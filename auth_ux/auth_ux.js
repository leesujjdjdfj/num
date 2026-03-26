import { app } from "../firebase-config.js";
import {
  getAuth,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  onAuthStateChanged,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
import {
  getDatabase,
  ref,
  get,
  set,
} from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

const auth = getAuth(app);
const db = getDatabase(app);
const googleProvider = new GoogleAuthProvider();

// DOM 요소
const tabLogin = document.getElementById("tab-login");
const tabSignup = document.getElementById("tab-signup");
const authForm = document.getElementById("auth-form");
const nicknameField = document.getElementById("nickname-field");
const nicknameInput = document.getElementById("nickname");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const submitBtn = document.getElementById("submit-btn");
const submitBtnText = document.getElementById("submit-btn-text");
const googleLoginBtn = document.getElementById("google-login-btn");
const modeSwitchText = document.getElementById("mode-switch-text");
const modeSwitchBtn = document.getElementById("mode-switch-btn");
const togglePasswordBtn = document.getElementById("toggle-password");
const errorMessage = document.getElementById("error-message");
const errorText = document.getElementById("error-text");

// 상태
let isLoginMode = true;
let isLoading = false;

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
  isLoading = loading;
  if (loading) {
    submitBtn.disabled = true;
    submitBtn.classList.add("opacity-70");
    submitBtnText.textContent = "처리 중...";
    googleLoginBtn.disabled = true;
    googleLoginBtn.classList.add("opacity-70");
  } else {
    submitBtn.disabled = false;
    submitBtn.classList.remove("opacity-70");
    submitBtnText.textContent = isLoginMode ? "로그인" : "회원가입";
    googleLoginBtn.disabled = false;
    googleLoginBtn.classList.remove("opacity-70");
  }
}

// 모드 전환 (로그인 <-> 회원가입)
function switchMode(toLogin) {
  isLoginMode = toLogin;
  hideError();

  if (isLoginMode) {
    tabLogin.classList.add("text-primary", "border-primary");
    tabLogin.classList.remove("text-on-surface-variant", "border-transparent");
    tabSignup.classList.remove("text-primary", "border-primary");
    tabSignup.classList.add("text-on-surface-variant", "border-transparent");
    nicknameField.classList.add("hidden");
    submitBtnText.textContent = "로그인";
    modeSwitchText.textContent = "아직 회원이 아니신가요?";
    modeSwitchBtn.textContent = "회원가입";
  } else {
    tabSignup.classList.add("text-primary", "border-primary");
    tabSignup.classList.remove("text-on-surface-variant", "border-transparent");
    tabLogin.classList.remove("text-primary", "border-primary");
    tabLogin.classList.add("text-on-surface-variant", "border-transparent");
    nicknameField.classList.remove("hidden");
    submitBtnText.textContent = "회원가입";
    modeSwitchText.textContent = "이미 계정이 있으신가요?";
    modeSwitchBtn.textContent = "로그인";
  }
}

// 비밀번호 표시/숨기기 토글
togglePasswordBtn.addEventListener("click", () => {
  const icon = togglePasswordBtn.querySelector(".material-symbols-outlined");
  if (passwordInput.type === "password") {
    passwordInput.type = "text";
    icon.textContent = "visibility";
    icon.setAttribute("data-icon", "visibility");
  } else {
    passwordInput.type = "password";
    icon.textContent = "visibility_off";
    icon.setAttribute("data-icon", "visibility_off");
  }
});

// 탭 클릭 이벤트
tabLogin.addEventListener("click", () => switchMode(true));
tabSignup.addEventListener("click", () => switchMode(false));
modeSwitchBtn.addEventListener("click", () => switchMode(!isLoginMode));

// 유저 프로필 확인 (nickname 존재 여부)
async function checkUserProfile(user) {
  const userRef = ref(db, `users/${user.uid}`);
  const snapshot = await get(userRef);

  if (snapshot.exists()) {
    const userData = snapshot.val();
    // nickname이 존재하면 프로필 설정 완료된 사용자
    if (userData.nickname) {
      return { hasProfile: true, userData };
    }
  }
  
  // nickname이 없으면 신규 사용자 또는 프로필 미설정 사용자
  return { hasProfile: false, userData: null };
}

// 이메일/비밀번호 회원가입 시 닉네임 저장 (프로필 설정 페이지 건너뛰기)
async function saveUserProfileForEmailSignup(user, nickname) {
  const userRef = ref(db, `users/${user.uid}`);
  await set(userRef, {
    nickname: nickname,
    email: user.email,
    avatar: "", // 기본 아바타 없음 - 나중에 설정 가능
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  
  localStorage.setItem("nickname", nickname);
  localStorage.setItem("uid", user.uid);
}

// 로그인 성공 후 처리
async function handleAuthSuccess(user, nickname = null) {
  try {
    // 이메일/비밀번호 회원가입의 경우 닉네임이 함께 전달됨
    if (nickname) {
      await saveUserProfileForEmailSignup(user, nickname);
      window.location.href = "../home_ux/home_ux.html";
      return;
    }
    
    // 구글 로그인 또는 이메일 로그인의 경우 프로필 확인
    const { hasProfile, userData } = await checkUserProfile(user);
    
    if (hasProfile) {
      // 이미 프로필이 설정된 사용자 -> 홈으로 이동
      localStorage.setItem("nickname", userData.nickname);
      localStorage.setItem("uid", user.uid);
      if (userData.avatar) {
        localStorage.setItem("avatar", userData.avatar);
      }
      window.location.href = "../home_ux/home_ux.html";
    } else {
      // 프로필 미설정 사용자 (구글 신규 로그인) -> 프로필 설정 페이지로
      window.location.href = "../profile_setup/profile_setup.html";
    }
  } catch (error) {
    console.error("Auth success handling error:", error);
    showError("로그인 후 처리 중 오류가 발생했습니다.");
    setLoading(false);
  }
}

// 이메일/비밀번호 로그인 또는 회원가입
authForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  if (isLoading) return;

  hideError();
  const email = emailInput.value.trim();
  const password = passwordInput.value;
  const nickname = nicknameInput.value.trim();

  if (!email || !password) {
    showError("이메일과 비밀번호를 입력해주세요.");
    return;
  }

  if (!isLoginMode && !nickname) {
    showError("닉네임을 입력해주세요.");
    return;
  }

  if (password.length < 6) {
    showError("비밀번호는 6자 이상이어야 합니다.");
    return;
  }

  setLoading(true);

  try {
    if (isLoginMode) {
      // 로그인
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      await handleAuthSuccess(userCredential.user);
    } else {
      // 회원가입
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      // 프로필에 닉네임 저장
      await updateProfile(userCredential.user, {
        displayName: nickname,
      });
      
      await handleAuthSuccess(userCredential.user, nickname);
    }
  } catch (error) {
    console.error("Auth error:", error);
    let errorMsg = "인증 중 오류가 발생했습니다.";
    
    switch (error.code) {
      case "auth/email-already-in-use":
        errorMsg = "이미 사용 중인 이메일입니다.";
        break;
      case "auth/invalid-email":
        errorMsg = "유효하지 않은 이메일 형식입니다.";
        break;
      case "auth/weak-password":
        errorMsg = "비밀번호가 너무 약합니다. 6자 이상 입력해주세요.";
        break;
      case "auth/user-not-found":
        errorMsg = "등록되지 않은 이메일입니다.";
        break;
      case "auth/wrong-password":
        errorMsg = "비밀번호가 올바르지 않습니다.";
        break;
      case "auth/too-many-requests":
        errorMsg = "너무 많은 시도가 있었습니다. 잠시 후 다시 시도해주���요.";
        break;
      case "auth/invalid-credential":
        errorMsg = "이메일 또는 비밀번호가 올바르지 않습니다.";
        break;
    }
    
    showError(errorMsg);
    setLoading(false);
  }
});

// 구글 로그인
googleLoginBtn.addEventListener("click", async () => {
  if (isLoading) return;

  hideError();
  setLoading(true);

  try {
    const result = await signInWithPopup(auth, googleProvider);
    await handleAuthSuccess(result.user);
  } catch (error) {
    console.error("Google auth error:", error);
    let errorMsg = "구글 로그인 중 오류가 발생했습니다.";
    
    if (error.code === "auth/popup-closed-by-user") {
      errorMsg = "로그인이 취소되었습니다.";
    } else if (error.code === "auth/popup-blocked") {
      errorMsg = "팝업이 차단되었습니다. 팝업 차단을 해제해주세요.";
    }
    
    showError(errorMsg);
    setLoading(false);
  }
});

// 이미 로그인된 경우 홈으로 리다이렉트
onAuthStateChanged(auth, (user) => {
  if (user) {
    // 이미 로그인 상태면 바로 홈으로
    handleAuthSuccess(user);
  }
});
