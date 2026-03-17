import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, updateDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCLkAIMy7R5UEoirN4CaVWuKJbCxzyQBVI",
  authDomain: "simplesis-f3606.firebaseapp.com",
  projectId: "simplesis-f3606",
  storageBucket: "simplesis-f3606.firebasestorage.app",
  messagingSenderId: "217211857685",
  appId: "1:217211857685:web:56bc8f3e196d076599d71c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements - Form Inputs
const nameInput = document.getElementById('setting-school-name');
const emailInput = document.getElementById('setting-admin-email');
const termInput = document.getElementById('setting-current-term');
const statusSelect = document.getElementById('setting-status');
const logoUrlInput = document.getElementById('setting-logo-url');
const colorPrimaryInput = document.getElementById('setting-color-primary');
const hexPrimaryDisplay = document.getElementById('hex-primary');

// UI Elements
const displaySchoolName = document.getElementById('display-school-name');
const saveBtn = document.getElementById('save-settings-btn');
const logoutBtn = document.getElementById('logout-btn');

let activeSchoolId = localStorage.getItem('activeSchoolId');

// --- AUTH & LOAD DATA ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'admin') {
        displaySchoolName.innerText = `Managing Configuration for: ${activeSchoolId}`;
        loadSchoolSettings();
      } else {
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

// --- FETCH & POPULATE SETTINGS ---
async function loadSchoolSettings() {
  try {
    const schoolRef = doc(db, "schools", activeSchoolId);
    const schoolSnap = await getDoc(schoolRef);

    if (schoolSnap.exists()) {
      const data = schoolSnap.data();

      // Populate General
      nameInput.value = data.name || "";
      emailInput.value = data.adminContact || "";
      statusSelect.value = data.systemStatus || "active";

      // Populate Term
      if (data.termSettings) {
        termInput.value = data.termSettings.currentTerm || "";
      }

      // Populate Branding
      if (data.branding) {
        logoUrlInput.value = data.branding.logoUrl || "";
        if (data.branding.primaryColor) {
          colorPrimaryInput.value = data.branding.primaryColor;
          hexPrimaryDisplay.innerText = data.branding.primaryColor;
          applyThemeColor(data.branding.primaryColor);
        }
      }
    }
  } catch (error) {
    console.error("Error fetching settings:", error);
    alert("Failed to load school settings.");
  }
}

// --- SAVE SETTINGS ---
saveBtn.addEventListener('click', async () => {
  saveBtn.innerText = "Saving...";
  saveBtn.disabled = true;

  try {
    const schoolRef = doc(db, "schools", activeSchoolId);
    
    // Construct the update payload
    await updateDoc(schoolRef, {
      name: nameInput.value.trim(),
      adminContact: emailInput.value.trim(),
      systemStatus: statusSelect.value,
      "termSettings.currentTerm": termInput.value.trim(),
      "branding.logoUrl": logoUrlInput.value.trim(),
      "branding.primaryColor": colorPrimaryInput.value
    });

    saveBtn.innerText = "Settings Saved!";
    setTimeout(() => {
      saveBtn.innerText = "Save All Changes";
      saveBtn.disabled = false;
    }, 2000);

  } catch (error) {
    console.error("Error saving settings:", error);
    alert(`Error saving settings: ${error.message}`);
    saveBtn.innerText = "Save All Changes";
    saveBtn.disabled = false;
  }
});

// --- LIVE THEME PREVIEW ---
// Update the hex display and CSS variables as the user drags the color picker
colorPrimaryInput.addEventListener('input', (e) => {
  const newColor = e.target.value;
  hexPrimaryDisplay.innerText = newColor;
  applyThemeColor(newColor);
});

function applyThemeColor(hexColor) {
  // Overrides the CSS :root variables we set in settings.css
  document.documentElement.style.setProperty('--primary-color', hexColor);
  
  // Update the sidebar brand to match
  const sidebarBrand = document.getElementById('sidebar-brand-name');
  if(sidebarBrand) sidebarBrand.style.color = hexColor;
}

// --- LOGOUT ---
logoutBtn.addEventListener('click', () => {
  signOut(auth).then(() => {
    localStorage.removeItem('activeSchoolId');
  });
});
