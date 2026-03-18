import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const loginForm = document.getElementById('standard-login-form');
const schoolIdInput = document.getElementById('login-school-id');
const emailInput = document.getElementById('login-email');
const passwordInput = document.getElementById('login-password');
const errorText = document.getElementById('login-error');
const submitBtn = loginForm.querySelector('.btn-primary');

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Reset UI
  errorText.classList.add('hidden');
  submitBtn.innerText = "Authenticating...";
  submitBtn.disabled = true;

  const schoolId = schoolIdInput.value.trim().toUpperCase();
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    // 1. Authenticate with Firebase Auth
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;

    // 2. Security Verification: Does this user belong to this school?
    const userProfileRef = doc(db, `schools/${schoolId}/users`, user.uid);
    const userProfileSnap = await getDoc(userProfileRef);

    if (userProfileSnap.exists()) {
      const userData = userProfileSnap.data();

      // 3. Check if account is suspended
      if (userData.isActive === false) {
        await auth.signOut();
        showError("Account Suspended. Please contact your school administrator.");
        return;
      }

      // 4. Save the active school context 
      localStorage.setItem('activeSchoolId', schoolId);
      localStorage.setItem('userRole', userData.role); 
      
      // 5. Smart Role-Based Routing!
      if (userData.role === 'admin') {
        window.location.href = 'dashboard.html';
      } else if (userData.role === 'teacher') {
        window.location.href = 'teacher-portal.html'; 
      } else if (userData.role === 'student') {
        window.location.href = 'student-portal.html'; 
      } else {
        await auth.signOut();
        showError("Invalid role assignment.");
      }

    } else {
      await auth.signOut();
      showError("Access Denied: You are not registered at this School ID.");
    }

  } catch (error) {
    console.error("Login failed:", error);
    showError("Invalid email, password, or School ID.");
  } finally {
    submitBtn.innerText = "Sign In";
    submitBtn.disabled = false;
  }
});

function showError(msg) {
  errorText.innerText = msg;
  errorText.classList.remove('hidden');
}
