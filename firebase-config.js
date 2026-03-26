import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";

// Firebase Console에서 프로젝트 생성 후, Realtime Database Web setup의 설정값을 채워주세요.
const firebaseConfig = {
  apiKey: "AIzaSyAO-XBwsw0RVgPmNyESTSzYaJUDEppQ9-k",
  authDomain: "number-56e3d.firebaseapp.com",
  databaseURL: "https://number-56e3d-default-rtdb.firebaseio.com",
  projectId: "number-56e3d",
  storageBucket: "number-56e3d.firebasestorage.app",
  messagingSenderId: "619417993388",
  appId: "1:619417993388:web:064e773b9b1f2f4b811f09",
  measurementId: "G-9BLC54GQSL",
};

const app = initializeApp(firebaseConfig);
const db = getDatabase(app);
const auth = getAuth(app);

export { app, db, auth, firebaseConfig };

