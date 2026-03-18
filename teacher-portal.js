import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { hideGlobalLoader, showToast } from "./utils.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const welcomeMsgEl = document.getElementById('welcome-message');
const schoolNameEl = document.getElementById('display-school-name');
const teacherEmailEl = document.getElementById('display-teacher-email');
const avatarEl = document.getElementById('teacher-avatar');
const coursesContainer = document.getElementById('teacher-courses-container');
const logoutBtn = document.getElementById('logout-btn');

// Modal Elements
const infoModal = document.getElementById('course-info-modal');
const infoContent = document.getElementById('course-info-content');
const infoTitle = document.getElementById('info-modal-title');

let activeSchoolId = localStorage.getItem('activeSchoolId');

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {

  if (user && activeSchoolId) {
    try {
      const userProfileSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, user.uid));
      if (userProfileSnap.exists() && userProfileSnap.data().role === 'teacher') {
        currentTeacherId = user.uid;
        loadSchoolBranding();
        
        // Wait for the gradebook to build, THEN hide the loader
        await initializeGradebook(); 
        hideGlobalLoader(); 
        
      } else { 
        window.location.href = 'login.html'; 
      }
    } catch (e) { 
      window.location.href = 'login.html'; 
    }
  } else { 
    window.location.href = 'login.html'; 
  }
});

// --- DATA STREAMS: COURSES & ATTENDANCE ---
let cachedCourses = [];
let attendanceTimes = {};

function loadMyCourses(teacherUid) {
  const todayStr = new Date().toISOString().split('T')[0];

  // STREAM 1: Daily Attendance
  const attQ = query(collection(db, `schools/${activeSchoolId}/attendance`), where("teacherId", "==", teacherUid), where("dateString", "==", todayStr));
  onSnapshot(attQ, (snapshot) => {
    attendanceTimes = {}; 
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      if (data.timestamp && !attendanceTimes[data.courseId]) {
        attendanceTimes[data.courseId] = data.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      } else if (!data.timestamp && !attendanceTimes[data.courseId]) {
        attendanceTimes[data.courseId] = "Just Now"; 
      }
    });
    renderCourseCards(); 
  });

  // STREAM 2: Assigned Courses
  const courseQ = query(collection(db, `schools/${activeSchoolId}/courses`), where("teacherIds", "array-contains", teacherUid), where("isActive", "==", true));
  onSnapshot(courseQ, (snapshot) => {
    cachedCourses = [];
    snapshot.forEach((docSnap) => {
      cachedCourses.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderCourseCards(); 
  }, (error) => {
    console.error("Error fetching courses:", error);
    coursesContainer.innerHTML = '<p style="color: red;">Failed to load courses. Please check your connection.</p>';
  });
}

// --- RENDER THE CARDS ---
function renderCourseCards() {
  coursesContainer.innerHTML = ''; 

  if (cachedCourses.length === 0) {
    coursesContainer.innerHTML = '<p style="color: #64748b;">You have not been assigned any active courses yet.</p>';
    return;
  }

  cachedCourses.forEach((course) => {
    const courseId = course.id;
    const isTaken = attendanceTimes[courseId];
    const attBadgeHtml = isTaken 
      ? `<span style="color: #0f9d58; font-weight: 600;">✓ Taken at ${attendanceTimes[courseId]}</span>` 
      : `<span style="color: #d93025; font-weight: 600;">⚠ Pending</span>`;

    const card = document.createElement('div');
    card.className = 'course-card';
    
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 12px;">
        <span class="course-code" style="margin-bottom: 0;">${course.courseCode}</span>
        <button class="info-btn" data-id="${courseId}" style="background: none; border: none; cursor: pointer; font-size: 16px; transition: transform 0.2s;" title="View Course Details">ℹ️</button>
      </div>
      <h3 class="course-name">${course.courseName}</h3>
      
      <div style="margin-top: 12px; background: #f8fafc; padding: 8px 12px; border-radius: 6px; border: 1px solid #e2e8f0; font-size: 13px;">
        Daily Roll: ${attBadgeHtml}
      </div>

      <div style="margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
        <button class="btn-primary" style="flex: 1;" onclick="window.location.href='take-attendance.html?course=${courseId}'">Attendance</button>
        <button class="btn-secondary" style="flex: 1;" onclick="window.location.href='gradebook.html?course=${courseId}'">Gradebook</button>
      </div>
    `;

    coursesContainer.appendChild(card);
  });
}

// --- INFO MODAL LOGIC ---
// Format Time Helper (24hr to 12hr)
function formatTime(time24) {
  if(!time24) return "TBD";
  let [h, m] = time24.split(':');
  let ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${h}:${m} ${ampm}`;
}

// Event Delegation for the Info Button
coursesContainer.addEventListener('click', (e) => {
  if (e.target.classList.contains('info-btn')) {
    const courseId = e.target.getAttribute('data-id');
    const course = cachedCourses.find(c => c.id === courseId);
    
    if (course) {
      infoTitle.innerText = `${course.courseCode}: ${course.courseName}`;
      
      const typeBadge = course.courseType === 'Required' ? 'background: #fee2e2; color: #b91c1c;' : (course.courseType === 'Elective' ? 'background: #e0e7ff; color: #4338ca;' : 'background: #fef3c7; color: #b45309;');
      const daysStr = (course.daysMet || []).join(', ');
      
      infoContent.innerHTML = `
        <div style="display: flex; gap: 8px; margin-bottom: 20px;">
          <span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; ${typeBadge}">${course.courseType || 'Required'}</span>
          <span style="padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold; background: #e8f0fe; color: var(--primary-color);">Room: ${course.roomNumber || 'TBD'}</span>
        </div>
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px;">
          <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong style="color: #0f172a; font-size: 14px;">Schedule</strong><br>
            <span style="font-size: 13px;">${daysStr || 'TBD'}</span><br>
            <span style="font-size: 13px;">${formatTime(course.startTime)} - ${formatTime(course.endTime)}</span>
          </div>
          <div style="background: #f8fafc; padding: 12px; border-radius: 6px; border: 1px solid #e2e8f0;">
            <strong style="color: #0f172a; font-size: 14px;">Term Dates</strong><br>
            <span style="font-size: 13px;">Start: ${course.startDate || 'TBD'}</span><br>
            <span style="font-size: 13px;">End: ${course.endDate || 'TBD'}</span>
          </div>
        </div>
        <div style="font-size: 13px;">
          <strong style="color: #0f172a; font-size: 14px;">Co-Teachers Assigned:</strong> 
          ${course.teacherIds && course.teacherIds.length > 1 ? `You and ${course.teacherIds.length - 1} other(s)` : 'Just You'}
        </div>
      `;
      infoModal.classList.remove('hidden');
    }
  }
});

document.getElementById('close-info-modal-btn').addEventListener('click', () => infoModal.classList.add('hidden'));
document.getElementById('close-info-btn').addEventListener('click', () => infoModal.classList.add('hidden'));

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
