import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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

// DOM Elements
const welcomeMsgEl = document.getElementById('welcome-message');
const schoolNameEl = document.getElementById('display-school-name');
const studentEmailEl = document.getElementById('display-student-email');
const avatarEl = document.getElementById('student-avatar');
const logoutBtn = document.getElementById('logout-btn');

const scheduleContainer = document.getElementById('schedule-container');
const missingWorkContainer = document.getElementById('missing-work-container');
const missingCountBadge = document.getElementById('missing-count');
const absentCountEl = document.getElementById('absent-count');
const tardyCountEl = document.getElementById('tardy-count');
const attendanceList = document.getElementById('attendance-list');

let activeSchoolId = localStorage.getItem('activeSchoolId');
let currentStudentId = null;

// --- AUTHENTICATION & GATEKEEPER ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'student') {
        const userData = userProfileSnap.data();
        currentStudentId = user.uid;
        
        // Populate Header
        welcomeMsgEl.innerText = `Welcome, ${userData.firstName}`;
        studentEmailEl.innerText = userData.email;
        avatarEl.innerText = userData.firstName.charAt(0);
        
        loadSchoolBranding();
        
        // Fire off data loads
        loadSchedule();
        loadMissingWork();
        loadAttendanceSummary();

      } else {
        alert("Security Violation: Student access required.");
        window.location.href = 'login.html';
      }
    } catch (error) { window.location.href = 'login.html'; }
  } else { window.location.href = 'login.html'; }
});

// --- 1. LOAD SCHEDULE ---
async function loadSchedule() {
  try {
    const q = query(collection(db, `schools/${activeSchoolId}/courses`), where("enrolledStudents", "array-contains", currentStudentId));
    const snaps = await getDocs(q);
    
    scheduleContainer.innerHTML = '';

    if (snaps.empty) {
      scheduleContainer.innerHTML = '<p style="color: #64748b; font-size: 14px;">You are not enrolled in any active courses.</p>';
      return;
    }

    snaps.forEach(docSnap => {
      const course = docSnap.data();
      
      // Format time helper
      const formatTime = (time24) => {
        if(!time24) return "";
        let [h, m] = time24.split(':');
        let ampm = h >= 12 ? 'PM' : 'AM';
        return `${h % 12 || 12}:${m} ${ampm}`;
      };

      const timeString = (course.startTime && course.endTime) ? `${formatTime(course.startTime)} - ${formatTime(course.endTime)}` : 'Time TBD';

      scheduleContainer.innerHTML += `
        <div class="schedule-item">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <strong style="color: var(--primary-color); font-size: 15px;">${course.courseName}</strong>
            <span style="font-size: 12px; background: #f1f5f9; padding: 2px 6px; border-radius: 4px; color: #475569;">Rm: ${course.roomNumber || 'TBD'}</span>
          </div>
          <div style="font-size: 13px; color: #64748b; display: flex; justify-content: space-between;">
            <span>${(course.daysMet || []).join(', ') || 'Days TBD'}</span>
            <span>${timeString}</span>
          </div>
        </div>
      `;
    });
  } catch (error) { console.error("Error loading schedule:", error); }
}

// --- 2. LOAD MISSING WORK ---
async function loadMissingWork() {
  try {
    // Query grades for this student where missing == true
    const q = query(collection(db, `schools/${activeSchoolId}/grades`), where("studentId", "==", currentStudentId), where("missing", "==", true));
    const snaps = await getDocs(q);
    
    missingWorkContainer.innerHTML = '';
    let missingCount = 0;

    if (snaps.empty) {
      missingWorkContainer.innerHTML = `
        <div style="text-align: center; padding: 20px 0;">
          <div style="font-size: 32px; margin-bottom: 8px;">🎉</div>
          <p style="color: #0f9d58; font-weight: 500;">You're all caught up!</p>
          <p style="font-size: 13px; color: #64748b;">No missing assignments logged.</p>
        </div>`;
      return;
    }

    for (const docSnap of snaps.docs) {
      const data = docSnap.data();
      missingCount++;

      // Fetch the assignment name
      const aSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses/${data.courseId}/assignments`, data.assignmentId));
      const assignName = aSnap.exists() ? aSnap.data().title : 'Unknown Assignment';
      
      // Fetch the course name
      const cSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, data.courseId));
      const courseName = cSnap.exists() ? cSnap.data().courseName : '';

      missingWorkContainer.innerHTML += `
        <div style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
          <strong style="display: block; color: #0f172a; font-size: 14px;">${assignName}</strong>
          <span style="font-size: 12px; color: #d93025; font-weight: 500;">${courseName}</span>
        </div>
      `;
    }

    // Update the red badge
    missingCountBadge.innerText = `${missingCount} Missing`;
    missingCountBadge.classList.remove('hidden');

  } catch (error) { console.error("Error loading missing work:", error); }
}

// --- 3. LOAD ATTENDANCE ---
async function loadAttendanceSummary() {
  try {
    const q = query(collection(db, `schools/${activeSchoolId}/attendance`), where("studentId", "==", currentStudentId));
    const snaps = await getDocs(q);
    
    let absences = 0;
    let tardies = 0;
    const records = [];

    snaps.forEach(docSnap => {
      const data = docSnap.data();
      if (data.status === 'absent') absences++;
      if (data.status === 'tardy') tardies++;
      if (data.status !== 'present') records.push(data); // Store non-present records for the list
    });

    absentCountEl.innerText = absences;
    tardyCountEl.innerText = tardies;

    // Show the 5 most recent infractions
    records.sort((a, b) => new Date(b.dateString) - new Date(a.dateString));
    attendanceList.innerHTML = '';

    if (records.length === 0) {
      attendanceList.innerHTML = '<li style="color: #0f9d58; padding: 8px 0;">Perfect attendance!</li>';
      return;
    }

    for (let i = 0; i < Math.min(records.length, 5); i++) {
      const rec = records[i];
      const cSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, rec.courseId));
      const courseCode = cSnap.exists() ? cSnap.data().courseCode : 'Class';
      
      const color = rec.status === 'absent' ? '#d93025' : '#f59e0b';
      
      attendanceList.innerHTML += `
        <li style="padding: 8px 0; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between;">
          <span>${rec.dateString} <span style="color: #64748b;">(${courseCode})</span></span>
          <strong style="color: ${color}; text-transform: capitalize;">${rec.status}</strong>
        </li>
      `;
    }

  } catch (error) { console.error("Error loading attendance:", error); }
}

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
