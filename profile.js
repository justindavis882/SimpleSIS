import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { hidegloabalLoader, showToast } from "./utils.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const dynamicSidebar = document.getElementById('dynamic-sidebar');
const displayFullName = document.getElementById('display-full-name');
const displayRole = document.getElementById('display-role');
const largeAvatar = document.getElementById('large-avatar');

const profileForm = document.getElementById('profile-form');
const firstInput = document.getElementById('profile-first');
const lastInput = document.getElementById('profile-last');
const emailInput = document.getElementById('profile-email');
const saveBtn = document.getElementById('save-profile-btn');

const resetPwdBtn = document.getElementById('reset-password-btn');
const resetMsg = document.getElementById('reset-msg');
const logoutBtn = document.getElementById('logout-btn');

let activeSchoolId = localStorage.getItem('activeSchoolId');
let currentUserProfileId = null;
let currentUserEmail = null;

// --- AUTHENTICATION & ROUTING ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists()) {
        const userData = userProfileSnap.data();
        currentUserProfileId = user.uid;
        currentUserEmail = userData.email;

        loadSchoolBranding();
        buildNavigation(userData.role);
        populateProfileForm(userData);
      hideGlobalLoader(); 
        
      } else {
        window.location.href = 'login.html';
      }
    } catch (error) {
      window.location.href = 'login.html';
    }
  } else {
    window.location.href = 'login.html';
  }
});
// --- DYNAMIC SIDEBAR BUILDER ---
// This ensures that Teachers get the Teacher sidebar, and Admins get the Admin sidebar!
function buildNavigation(role) {
  dynamicSidebar.innerHTML = ''; 

  if (role === 'admin') {
    dynamicSidebar.innerHTML = `
      <a href="dashboard.html">Dashboard</a>
      <a href="users.html">Users & Roles</a>
      <a href="courses.html">Courses & Pacing</a>
      <a href="enrollment.html">Enrollment</a>
      <a href="attendance.html">Live Attendance</a>
      <a href="reports.html">Reports</a>
      <a href="settings.html">Settings</a>
      <a href="profile.html" class="active">My Profile</a>
    `;
  } else if (role === 'teacher') {
    dynamicSidebar.innerHTML = `
      <a href="teacher-portal.html">My Dashboard</a>
      <a href="teacher-portal.html">Take Attendance</a>
      <a href="teacher-portal.html">Gradebook</a>
      <a href="reports.html">Reports</a>
      <a href="profile.html" class="active">My Profile</a>
    `;

  } else if (role === 'student') {
    dynamicSidebar.innerHTML = `
      <a href="student-portal.html">My Dashboard</a>
      <a href="profile.html" class="active">My Profile</a>
    `;
  }
}

// --- POPULATE PROFILE DATA ---
function populateProfileForm(data) {
  displayFullName.innerText = `${data.firstName} ${data.lastName}`;
  displayRole.innerText = data.role;
  largeAvatar.innerText = data.firstName.charAt(0);
  
  firstInput.value = data.firstName;
  lastInput.value = data.lastName;
  emailInput.value = data.email;
}

// --- SAVE PROFILE UPDATES ---
profileForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveBtn.innerText = "Saving...";
  saveBtn.disabled = true;

  const newFirst = firstInput.value.trim();
  const newLast = lastInput.value.trim();

  try {
    const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, currentUserProfileId);
    await updateDoc(userProfileRef, {
      firstName: newFirst,
      lastName: newLast
    });

    // Update UI instantly
    displayFullName.innerText = `${newFirst} ${newLast}`;
    largeAvatar.innerText = newFirst.charAt(0);
    
    saveBtn.innerText = "✓ Saved Successfully";
    setTimeout(() => {
      saveBtn.innerText = "Save Profile Updates";
      saveBtn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error("Error updating profile:", error);
    alert("Failed to update profile.");
    saveBtn.innerText = "Save Profile Updates";
    saveBtn.disabled = false;
  }
});

// --- PASSWORD RESET LOGIC ---
resetPwdBtn.addEventListener('click', async () => {
  if (!currentUserEmail) return;
  
  resetPwdBtn.innerText = "Sending...";
  resetPwdBtn.disabled = true;

  try {
    await sendPasswordResetEmail(auth, currentUserEmail);
    resetPwdBtn.style.display = 'none';
    resetMsg.style.display = 'block';
  } catch (error) {
    console.error("Error sending reset email:", error);
    alert(`Failed to send email: ${error.message}`);
    resetPwdBtn.innerText = "Send Password Reset Email";
    resetPwdBtn.disabled = false;
  }
});

// --- LOAD CUSTOM BRANDING ---
async function loadSchoolBranding() {
  try {
    const schoolRef = doc(db, "schools", activeSchoolId);
    const schoolSnap = await getDoc(schoolRef);
    
    if (schoolSnap.exists() && schoolSnap.data().branding) {
      const branding = schoolSnap.data().branding;
      
      // 1. Set Primary Color
      if (branding.primaryColor) {
        document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
        const brandText = document.querySelector('.sidebar .brand h2');
        if (brandText) brandText.style.color = branding.primaryColor;
      }

      // 2. Set Sidebar Logo
      const logoEl = document.getElementById('sidebar-logo');
      if (logoEl && branding.logoUrl) {
        logoEl.src = branding.logoUrl;
        logoEl.classList.remove('hidden'); // Reveal the image tag!
      }
    }
  } catch (error) {
    console.error("Error loading branding:", error);
  }
}

logoutBtn.addEventListener('click', () => { signOut(auth).then(() => { localStorage.removeItem('activeSchoolId'); }); });
