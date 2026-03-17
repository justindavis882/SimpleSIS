import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// Initialize Firebase (Paste your config here again)
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
const schoolNameEl = document.getElementById('display-school-name');
const termEl = document.getElementById('display-term');
const statusEl = document.getElementById('display-status');
const adminEmailEl = document.getElementById('display-admin-email');
const logoutBtn = document.getElementById('logout-btn');

// 1. Listen for Authentication State
// 1. Listen for Authentication State & Enforce RBAC
onAuthStateChanged(auth, async (user) => {
  const activeSchoolId = localStorage.getItem('activeSchoolId');

  if (user && activeSchoolId) {
    try {
      // Security Check: Verify Role
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'admin') {
        const userData = userProfileSnap.data();
        loadSchoolBranding();
        
        // Populate header with their actual name and role
        adminEmailEl.innerText = `${userData.firstName} ${userData.lastName} (Admin)`;
        
        // Access Granted: Load the data
        loadSchoolData();
      } else {
        // Access Denied: They are logged in, but not an admin
        alert("Access Denied: Administrator privileges required.");
        window.location.href = 'login.html';
      }
    } catch (error) {
      console.error("Authorization check failed:", error);
      window.location.href = 'login.html';
    }
  } else {
    // Not logged in or missing school context
    window.location.href = 'login.html';
  }
});

// 2. Fetch Data from Firestore
async function loadSchoolData() {
  const activeSchoolId = localStorage.getItem('activeSchoolId');

  if (!activeSchoolId) {
    console.error("No active school ID found in local storage.");
    schoolNameEl.innerText = "Error: Missing School Context";
    return;
  }

  try {
    const schoolRef = doc(db, "schools", activeSchoolId);
    const schoolSnap = await getDoc(schoolRef);

    if (schoolSnap.exists()) {
      const data = schoolSnap.data();
      
      // Update the UI with live database info!
      schoolNameEl.innerText = data.name;
      termEl.innerText = `Active Term: ${data.termSettings.currentTerm}`;
      statusEl.innerText = data.systemStatus;
      
    } else {
      console.log("No such school document!");
    }
  } catch (error) {
    console.error("Error fetching school data:", error);
  }
}

// 3. Handle Logout
logoutBtn.addEventListener('click', () => {
  signOut(auth).then(() => {
    localStorage.removeItem('activeSchoolId'); // Clean up
    // onAuthStateChanged will automatically redirect to index.html
  }).catch((error) => {
    console.error("Logout Error:", error);
  });
});

// --- LOAD CUSTOM BRANDING ---
async function loadSchoolBranding() {
  try {
    // Note: ensure 'doc' and 'getDoc' are imported from firestore at the top of your file!
    const schoolRef = doc(db, "schools", activeSchoolId);
    const schoolSnap = await getDoc(schoolRef);
    
    if (schoolSnap.exists() && schoolSnap.data().branding) {
      const branding = schoolSnap.data().branding;
      
      if (branding.primaryColor) {
        // 1. Override the CSS variables globally on the page
        document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
        
        // 2. Directly target the sidebar text as a fallback
        const brandText = document.querySelector('.sidebar .brand h2');
        if (brandText) brandText.style.color = branding.primaryColor;
      }
    }
  } catch (error) {
    console.error("Error loading branding:", error);
  }
}
