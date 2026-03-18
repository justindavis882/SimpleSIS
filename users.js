import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { hideGlobalLoader, showToast } from "./utils.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 2. Initialize SECONDARY Firebase App 
// (This prevents the Admin from being logged out when creating a new user account)
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

// DOM Elements
const schoolNameEl = document.getElementById('display-school-name');
const logoutBtn = document.getElementById('logout-btn');
const tbody = document.getElementById('users-tbody');

// Modal Elements
const modal = document.getElementById('user-modal');
const openModalBtn = document.getElementById('open-create-modal-btn');
const closeBtn = document.getElementById('close-modal-btn');
const cancelBtn = document.getElementById('cancel-btn');
const form = document.getElementById('user-form');
const submitBtn = document.getElementById('submit-user-btn');

let activeSchoolId = localStorage.getItem('activeSchoolId');

// --- AUTHENTICATION & ROLE CHECK ---
// --- DIAGNOSTIC AUTHENTICATION & ROLE CHECK ---
onAuthStateChanged(auth, async (user) => {
  // 1. Grab the ID inside the function just to be safe
  const activeSchoolId = localStorage.getItem('activeSchoolId');

  // 2. Check if Firebase lost the user
  if (!user) {
    alert("DEBUG: Firebase says no user is logged in. Session was lost!");
    window.location.href = 'login.html';
    return;
  }

  // 3. Check if LocalStorage lost the School ID
  if (!activeSchoolId) {
    alert("DEBUG: The activeSchoolId is missing from your browser memory.");
    window.location.href = 'login.html';
    return;
  }

  // 4. Try to read the database profile
  try {
    const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
    const userProfileSnap = await getDoc(userProfileRef);

    if (userProfileSnap.exists() && userProfileSnap.data().role === 'admin') {
      
      // SUCCESS! Load the appropriate page data
      if (document.getElementById('display-school-name')) {
        document.getElementById('display-school-name').innerText = `Managing School ID: ${activeSchoolId}`;

        loadSchoolBranding();
        hideGlobalLoader();
      }
      
      // Run the specific page functions if they exist
      if (typeof loadUsers === 'function') loadUsers();
      if (typeof populateTeacherDropdown === 'function') populateTeacherDropdown();
      if (typeof loadCourses === 'function') loadCourses();

    } else {
      // They exist, but aren't an admin
      const roleFound = userProfileSnap.exists() ? userProfileSnap.data().role : "No Profile Document Found";
      alert(`DEBUG: Access Denied. Your role is listed as: ${roleFound}`);
      window.location.href = 'login.html';
    }
  } catch (error) {
    // A database rule blocked the read!
    alert(`DEBUG: Firestore Error! Check your browser's console (F12). Error: ${error.message}`);
    console.error("Diagnostic Auth Error:", error);
  }
});

// --- LOAD USERS (REAL-TIME) ---
function loadUsers() {
  const usersRef = collection(db, `schools/${activeSchoolId}/users`);
  
  onSnapshot(usersRef, (snapshot) => {
    tbody.innerHTML = ''; // Clear table
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const uid = docSnap.id;
      const isActive = data.isActive;

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${data.lastName}, ${data.firstName}</strong></td>
        <td>${data.email}</td>
        <td style="text-transform: capitalize;">${data.role}</td>
        <td><span class="status-badge status-${isActive}">${isActive ? 'Active' : 'Suspended'}</span></td>
        <td>
          <button class="btn-secondary toggle-status-btn" style="width:auto;" data-uid="${uid}" data-active="${isActive}">Toggle Status</button>
          <button class="btn-danger delete-btn" data-uid="${uid}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    attachTableListeners();
  });
}

// --- CREATE NEW USER ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.innerText = "Creating...";
  submitBtn.disabled = true;

  const fName = document.getElementById('new-first-name').value.trim();
  const lName = document.getElementById('new-last-name').value.trim();
  const email = document.getElementById('new-email').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;

  try {
    // 1. Create Auth record using the Secondary App
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = userCredential.user.uid;

    // 2. Instantly sign out of the secondary app so it's fresh for the next one
    await signOut(secondaryAuth);

    // 3. Create the Database Document tying them to this specific school
    const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, newUid);
    await setDoc(userProfileRef, {
      firstName: fName,
      lastName: lName,
      email: email,
      role: role,
      isActive: true,
      createdAt: new Date()
    });

    closeModal();
    form.reset();
  } catch (error) {
    console.error("Error creating user:", error);
    alert(`Failed to create user: ${error.message}`);
  } finally {
    submitBtn.innerText = "Create User";
    submitBtn.disabled = false;
  }
});

// --- UPDATE & DELETE ---
function attachTableListeners() {
  // Suspend/Activate
  document.querySelectorAll('.toggle-status-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const uid = e.target.getAttribute('data-uid');
      // Convert string back to boolean
      const currentStatus = e.target.getAttribute('data-active') === 'true'; 

      try {
        await updateDoc(doc(db, `schools/${activeSchoolId}/users`, uid), { 
          isActive: !currentStatus 
        });
      } catch (error) {
        console.error("Error updating status:", error);
      }
    });
  });

  // Delete User Document (Soft-delete by removing them from the School's SIS database)
  // Note: True auth deletion requires a Cloud Function, but deleting this document 
  // immediately blocks them from logging into this school via your login.js logic.
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const uid = e.target.getAttribute('data-uid');
      if (confirm(`Remove this user from the school?`)) {
        try {
          await deleteDoc(doc(db, `schools/${activeSchoolId}/users`, uid));
        } catch (error) {
          console.error("Error deleting user:", error);
        }
      }
    });
  });
}

// --- MODAL & LOGOUT HANDLERS ---
function openModal() { modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }

openModalBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);

logoutBtn.addEventListener('click', () => {
  signOut(auth).then(() => {
    localStorage.removeItem('activeSchoolId');
  });
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
