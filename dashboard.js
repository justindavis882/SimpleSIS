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

// --- LOAD RECENT ACTIVITY (EXPANDED) ---
async function loadRecentActivity() {
  const activeSchoolId = localStorage.getItem('activeSchoolId');
  if (!activeSchoolId) return;

  try {
    // 1. Run all three queries simultaneously for maximum speed
    const [userSnap, gradeSnap, attSnap] = await Promise.all([
      getDocs(query(collection(db, `schools/${activeSchoolId}/users`), orderBy("createdAt", "desc"), limit(3))),
      getDocs(query(collection(db, `schools/${activeSchoolId}/grades`), orderBy("timestamp", "desc"), limit(3))),
      getDocs(query(collection(db, `schools/${activeSchoolId}/attendance`), orderBy("timestamp", "desc"), limit(3)))
    ]);

    let activities = [];

    // 2. Parse Users Data
    userSnap.forEach(docSnap => {
      const data = docSnap.data();
      // Handle standard dates or Firebase Timestamps safely
      const time = data.createdAt ? (data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt)) : new Date(0);
      const roleColor = data.role === 'admin' ? '#d93025' : (data.role === 'teacher' ? '#f59e0b' : '#1a73e8');
      
      activities.push({
        time: time,
        text: `<strong style="color: ${roleColor};">New ${data.role} account:</strong> ${data.firstName} ${data.lastName}`,
        icon: '👤'
      });
    });

    // 3. Parse Grades Data
    gradeSnap.forEach(docSnap => {
      const data = docSnap.data();
      const time = data.timestamp ? data.timestamp.toDate() : new Date(0);
      
      activities.push({
        time: time,
        text: `<strong style="color: #0f9d58;">Grade Updated:</strong> A score was logged in course ${data.courseId}`,
        icon: '📝'
      });
    });

    // 4. Parse Attendance Data
    attSnap.forEach(docSnap => {
      const data = docSnap.data();
      const time = data.timestamp ? data.timestamp.toDate() : new Date(0);
      
      activities.push({
        time: time,
        text: `<strong style="color: #8b5cf6;">Attendance Logged:</strong> A record was submitted for course ${data.courseId}`,
        icon: '📅'
      });
    });

    // 5. Sort everything together by newest first
    activities.sort((a, b) => b.time - a.time);

    // 6. Take the top 5 overall
    const topActivities = activities.slice(0, 5);

    activityContainer.innerHTML = ''; // Clear loading text

    if (topActivities.length === 0) {
      activityContainer.innerHTML = '<p style="color: #64748b;">No recent system activity logged.</p>';
      return;
    }

    // 7. Render to the DOM with polished formatting
    topActivities.forEach(item => {
      // Format the date string cleanly
      const dateStr = item.time.getTime() === 0 ? "Recently" : 
        (item.time.toLocaleDateString() + ' at ' + item.time.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}));
      
      activityContainer.innerHTML += `
        <div class="feed-card" style="margin-bottom: 12px; display: flex; gap: 16px; align-items: flex-start; padding: 16px;">
          <div style="font-size: 20px; background: #f8fafc; padding: 10px; border-radius: 8px; border: 1px solid #e2e8f0; display: flex; align-items: center; justify-content: center;">
            ${item.icon}
          </div>
          <div style="flex-grow: 1;">
            <p style="margin-bottom: 6px; font-size: 14px; color: #0f172a; line-height: 1.4;">${item.text}</p>
            <span class="timestamp" style="font-size: 12px; color: #64748b; font-weight: 500;">${dateStr}</span>
          </div>
        </div>
      `;
    });

  } catch (error) {
    console.error("Error loading combined activity:", error);
    activityContainer.innerHTML = '<p style="color: #d93025;">Failed to load activity feed. Ensure indices are built if required.</p>';
  }
}
