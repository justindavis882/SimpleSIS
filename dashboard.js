import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { hideGlobalLoader, showToast } from "./utils.js";


import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const schoolNameEl = document.getElementById('display-school-name');
const termEl = document.getElementById('display-term');
const statusEl = document.getElementById('display-status');
const adminEmailEl = document.getElementById('display-admin-email');
const logoutBtn = document.getElementById('logout-btn');
const countStudentsEl = document.getElementById('count-students');
const countCoursesEl = document.getElementById('count-courses');
const activityContainer = document.getElementById('activity-feed-container');

let activeSchoolId = localStorage.getItem('activeSchoolId');

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
      loadDashboardStats();
      loadRecentActivity();
      
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

// --- LOAD DASHBOARD STATS ---
async function loadDashboardStats() {
  const activeSchoolId = localStorage.getItem('activeSchoolId');
  if (!activeSchoolId) return;

  // 1. Count Active Students
  try {
    const studentQ = query(
      collection(db, `schools/${activeSchoolId}/users`), 
      where("role", "==", "student"), 
      where("isActive", "==", true)
    );
    const studentSnap = await getDocs(studentQ);
    countStudentsEl.innerText = studentSnap.size; // .size gives the total count!
  } catch(error) { 
    console.error("Error counting students:", error); 
  }

  // 2. Count Active Courses
  try {
    const courseQ = query(
      collection(db, `schools/${activeSchoolId}/courses`), 
      where("isActive", "==", true)
    );
    const courseSnap = await getDocs(courseQ);
    countCoursesEl.innerText = courseSnap.size;
  } catch(error) { 
    console.error("Error counting courses:", error); 
  }
}

// --- LOAD RECENT ACTIVITY ---
async function loadRecentActivity() {
  const activeSchoolId = localStorage.getItem('activeSchoolId');
  if (!activeSchoolId) return;

  try {
    // Grab the 4 most recently created users
    const activityQ = query(
      collection(db, `schools/${activeSchoolId}/users`), 
      orderBy("createdAt", "desc"), 
      limit(4)
    );
    const activitySnap = await getDocs(activityQ);
    
    activityContainer.innerHTML = ''; // Clear the "Loading..." text

    if (activitySnap.empty) {
      activityContainer.innerHTML = '<p style="color: #64748b;">No recent activity logged.</p>';
      return;
    }

    activitySnap.forEach(docSnap => {
      const data = docSnap.data();
      
      // Format the timestamp nicely
      let dateStr = "Recently";
      if (data.createdAt) {
        // Handle both Firebase Timestamps and standard JS Dates
        const dateObj = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
        dateStr = dateObj.toLocaleDateString() + ' at ' + dateObj.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      }

      // Customize text based on role
      const actionText = data.role === 'student' ? 'New student enrolled:' : 'New staff account created:';
      const roleColor = data.role === 'admin' ? '#d93025' : (data.role === 'teacher' ? '#f59e0b' : '#1a73e8');

      // Build the feed card
      activityContainer.innerHTML += `
        <div class="feed-card" style="margin-bottom: 12px;">
          <p>
            <strong style="color: ${roleColor};">${actionText}</strong> 
            ${data.firstName} ${data.lastName}
          </p>
          <span class="timestamp">${dateStr}</span>
        </div>
      `;
    });

  } catch (error) {
    console.error("Error loading activity:", error);
    activityContainer.innerHTML = '<p style="color: #d93025;">Failed to load activity feed. Check console.</p>';
  }
}
