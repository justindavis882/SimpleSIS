import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// 1. Initialize Primary Firebase
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
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      // Security Check: Verify Role
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'admin') {
        // Access Granted
        schoolNameEl.innerText = `Managing School ID: ${activeSchoolId}`;
        loadUsers();
      } else {
        // Access Denied
        alert("Security Violation: Admins only.");
        window.location.href = 'login.html';
      }
    } catch (error) {
      console.error("Auth error:", error);
      window.location.href = 'login.html';
    }
  } else {
    window.location.href = 'login.html';
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