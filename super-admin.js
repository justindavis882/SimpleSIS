import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// 1. Initialize Firebase (Replace with your actual config)
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

// 2. DOM Elements
// Auth & Gatekeeper Elements
const loginContainer = document.getElementById('super-login-container');
const appContent = document.getElementById('app-content');
const loginForm = document.getElementById('super-login-form');
const emailInput = document.getElementById('super-email');
const passwordInput = document.getElementById('super-password');
const errorText = document.getElementById('login-error');
const logoutBtn = document.getElementById('super-logout-btn');
const emailDisplay = document.getElementById('super-admin-email-display');

// Dashboard Elements
const tbody = document.getElementById('schools-tbody');
const modal = document.getElementById('school-modal');
const openModalBtn = document.getElementById('open-create-modal-btn');
const closeBtn = document.getElementById('close-modal-btn');
const cancelBtn = document.getElementById('cancel-btn');
const form = document.getElementById('school-form');
const schoolIdInput = document.getElementById('new-school-id');
const statusInput = document.getElementById('new-school-status');

// --- AUTHENTICATION & GATEKEEPER LOGIC ---

onAuthStateChanged(auth, async (user) => {
  if (user) {
    // Check if they are on the Super Admin VIP list
    const superAdminRef = doc(db, "superAdmins", user.uid);
    const superAdminSnap = await getDoc(superAdminRef);

    if (superAdminSnap.exists()) {
      // Access Granted
      loginContainer.classList.add('hidden');
      appContent.classList.remove('hidden');
      emailDisplay.innerText = user.email;
      
      // Load the table data now that they are verified
      loadTableData(); 
    } else {
      // Access Denied: They are a normal user
      signOut(auth);
      showError("Access Denied. You do not have Master privileges.");
    }
  } else {
    // Not logged in
    loginContainer.classList.remove('hidden');
    appContent.classList.add('hidden');
  }
});

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  errorText.classList.add('hidden');
  
  const email = emailInput.value.trim();
  const password = passwordInput.value;

  try {
    await signInWithEmailAndPassword(auth, email, password);
    // onAuthStateChanged takes over upon success
  } catch (error) {
    console.error("Login Error:", error);
    showError("Invalid credentials or account not found.");
  }
});

logoutBtn.addEventListener('click', () => {
  signOut(auth);
});

function showError(msg) {
  errorText.innerText = msg;
  errorText.classList.remove('hidden');
}

// --- DATA LOGIC: REAL-TIME TABLE & CRUD ---

function loadTableData() {
  const schoolsRef = collection(db, "schools");
  
  // Real-time listener for the Schools collection
  onSnapshot(schoolsRef, (snapshot) => {
    tbody.innerHTML = ''; // Clear table before repopulating
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const id = docSnap.id;
      
      const name = data.name || "<em>Not Configured</em>";
      const email = data.adminContact || "<em>N/A</em>";
      const status = data.systemStatus || "unknown";

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${id}</strong></td>
        <td>${name}</td>
        <td>${email}</td>
        <td><span class="status-badge status-${status}">${status}</span></td>
        <td>
          <button class="btn-secondary toggle-status-btn" data-id="${id}" data-current="${status}">Toggle Status</button>
          <button class="btn-danger delete-btn" data-id="${id}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    });

    // Re-attach listeners to the newly created buttons
    attachTableListeners();
  });
}

// Create: Provision a New School
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = schoolIdInput.value.trim().toUpperCase();
  const status = statusInput.value;

  try {
    await setDoc(doc(db, "schools", id), {
      systemStatus: status,
      createdAt: new Date()
    });
    closeModal();
    form.reset();
  } catch (error) {
    console.error("Error creating school: ", error);
    alert("Failed to create school. Check console or security rules.");
  }
});

// Update & Delete Helpers
function attachTableListeners() {
  // Toggle Status
  document.querySelectorAll('.toggle-status-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      const currentStatus = e.target.getAttribute('data-current');
      
      let newStatus = 'active';
      if (currentStatus === 'active') newStatus = 'suspended';
      if (currentStatus === 'suspended') newStatus = 'pending';

      try {
        await updateDoc(doc(db, "schools", id), { systemStatus: newStatus });
      } catch (error) {
        console.error("Error updating status:", error);
      }
    });
  });

  // Delete School
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm(`Are you absolutely sure you want to delete ${id}? This cannot be undone.`)) {
        try {
          await deleteDoc(doc(db, "schools", id));
        } catch (error) {
          console.error("Error deleting school:", error);
        }
      }
    });
  });
}

// Modal Handlers
function openModal() { modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }

openModalBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);