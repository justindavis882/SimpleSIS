import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// Initialize Firebase (Paste your exact config here)
const firebaseConfig = {
  apiKey: "AIzaSyCLkAIMy7R5UEoirN4CaVWuKJbCxzyQBVI",
  authDomain: "simplesis-f3606.firebaseapp.com",
  projectId: "simplesis-f3606",
  storageBucket: "simplesis-f3606.firebasestorage.app",
  messagingSenderId: "217211857685",
  appId: "1:217211857685:web:56bc8f3e196d076599d71c",
  measurementId: "G-JKEFLYBDQK"
};

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

    // 2. Security Verification: Does this user actually belong to this school?
    // We check the specific subcollection: /schools/{schoolId}/users/{uid}
    const userProfileRef = doc(db, `schools/${schoolId}/users`, user.uid);
    const userProfileSnap = await getDoc(userProfileRef);

    if (userProfileSnap.exists()) {
      // Success! They are authenticated AND they belong to this school.
      // 3. Save the active school context so the dashboard knows what to load
      localStorage.setItem('activeSchoolId', schoolId);
      
      // 4. Send them to the dashboard
      window.location.href = 'dashboard.html';
    } else {
      // They logged in, but don't belong to this school ID.
      // Force a logout and show an error.
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