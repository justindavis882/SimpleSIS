import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, addDoc, serverTimestamp, orderBy, limit } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { hideGlobalLoader } from "./utils.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const welcomeMsgEl = document.getElementById('welcome-message');
const studentNameDisplay = document.getElementById('student-name-display');
const logoutBtn = document.getElementById('logout-btn');
const gradesTbody = document.getElementById('grades-tbody');

const hoursForm = document.getElementById('log-hours-form');
const submitHoursBtn = document.getElementById('submit-hours-btn');
const recentLogsList = document.getElementById('recent-logs-list');

let activeSchoolId = localStorage.getItem('activeSchoolId');
let currentParentId = null;
let linkedStudentId = null; // The UUID of their child

// --- AUTHENTICATION & GATEKEEPER ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'parent') {
        const userData = userProfileSnap.data();
        currentParentId = user.uid;
        
        welcomeMsgEl.innerText = `Welcome, ${userData.firstName}`;
        loadSchoolBranding();

        // Check if the Admin has linked a student to this parent account
        if (userData.linkedStudentId) {
          linkedStudentId = userData.linkedStudentId;
          await loadStudentDetails();
          loadStudentGrades();
          loadRecentComplianceLogs();
        } else {
          studentNameDisplay.innerText = "No student linked to this account yet. Please contact administration.";
          gradesTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:#d93025;">Account pending student linkage.</td></tr>';
          submitHoursBtn.disabled = true;
        }

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

// --- LOAD STUDENT DETAILS ---
async function loadStudentDetails() {
  try {
    const studentSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, linkedStudentId));
    if (studentSnap.exists()) {
      const student = studentSnap.data();
      studentNameDisplay.innerText = `Viewing records for: ${student.firstName} ${student.lastName}`;
    }
  } catch (error) {
    console.error("Error loading student:", error);
  }
}

// --- LOAD ACADEMIC PROGRESS (READ-ONLY) ---
async function loadStudentGrades() {
  try {
    const q = query(collection(db, `schools/${activeSchoolId}/grades`), where("studentId", "==", linkedStudentId));
    const snaps = await getDocs(q);
    
    gradesTbody.innerHTML = '';

    if (snaps.empty) {
      gradesTbody.innerHTML = '<tr><td colspan="3" style="padding: 24px; text-align: center; color: #64748b;">No grades logged yet.</td></tr>';
      return;
    }

    // Cache course and assignment names so we don't fetch the same ones repeatedly
    const courseCache = {};
    const assignCache = {};

    for (const docSnap of snaps.docs) {
      const data = docSnap.data();

      // Fetch Course Name
      if (!courseCache[data.courseId]) {
        const cSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, data.courseId));
        courseCache[data.courseId] = cSnap.exists() ? cSnap.data().courseName : 'Unknown Course';
      }
      
      // Fetch Assignment Name
      if (!assignCache[data.assignmentId]) {
        const aSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses/${data.courseId}/assignments`, data.assignmentId));
        assignCache[data.assignmentId] = aSnap.exists() ? aSnap.data().title : 'Unknown Assignment';
      }

      // Format the Score Display
      let scoreDisplay = data.score !== null ? `${data.score} pts` : '--';
      if (data.missing) scoreDisplay = '<span style="color: #d93025; font-weight: bold;">Missing</span>';
      if (data.noCount) scoreDisplay = '<span style="color: #64748b;">No Count</span>';

      gradesTbody.innerHTML += `
        <tr>
          <td style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0; font-weight: 500; color: #0f172a;">${courseCache[data.courseId]}</td>
          <td style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0; color: #475569;">${assignCache[data.assignmentId]}</td>
          <td style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0;">${scoreDisplay}</td>
        </tr>
      `;
    }
  } catch (error) { 
    console.error("Error loading grades:", error); 
    gradesTbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red;">Error loading records.</td></tr>';
  }
}
// --- LOAD RECENT COMPLIANCE LOGS & PROGRESS ---
async function loadRecentComplianceLogs() {
  try {
    // 1. Fetch the student's assigned requirements from their profile
    const studentSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, linkedStudentId));
    const reqs = studentSnap.exists() ? studentSnap.data().complianceRequirements || {} : {};
    
    // Default to 0 if the Admin hasn't assigned them hours yet
    document.getElementById('peh-required').innerText = reqs.PEH101 !== undefined ? reqs.PEH101 : 0;
    document.getElementById('lan-required').innerText = reqs.LAN101 !== undefined ? reqs.LAN101 : 0;

    // 2. Fetch all their logged hours
    const q = query(collection(db, `schools/${activeSchoolId}/compliance_hours`), where("studentId", "==", linkedStudentId), orderBy("timestamp", "desc"));
    const snaps = await getDocs(q);

    recentLogsList.innerHTML = '';
    let pehApproved = 0;
    let lanApproved = 0;

    if (snaps.empty) {
      recentLogsList.innerHTML = '<li style="color: #64748b; padding: 8px 0;">No hours logged yet.</li>';
      return;
    }

    snaps.forEach(docSnap => {
      const data = docSnap.data();
      
      // Tally approved hours for the progress bars
      if (data.status === 'approved') {
        if (data.courseCode === 'PEH101') pehApproved += data.hoursLog;
        if (data.courseCode === 'LAN101') lanApproved += data.hoursLog;
      }

      // Render History List (Limit visually to save space, but we tallied all of them above)
      const statusBadge = data.status === 'pending' 
        ? '<span class="status-pending">Pending</span>' 
        : (data.status === 'approved' ? '<span style="color:#0f9d58; font-weight:bold; font-size:11px; text-transform:uppercase;">Approved</span>' : '<span style="color:#d93025; font-weight:bold; font-size:11px; text-transform:uppercase;">Rejected</span>');

      recentLogsList.innerHTML += `
        <li style="padding: 12px 0; border-bottom: 1px solid #f1f5f9;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
            <strong style="color:var(--primary-color);">${data.courseCode}</strong>
            ${statusBadge}
          </div>
          <p style="color:#475569; margin-bottom: 4px;">${data.taskDescription}</p>
          <span style="color:#94a3b8; font-size: 11px;">${data.dateCompleted} &bull; ${data.hoursLog} hrs</span>
        </li>
      `;
    });

    // Update Progress UI
    document.getElementById('peh-completed').innerText = pehApproved;
    document.getElementById('lan-completed').innerText = lanApproved;

  } catch (error) { console.error("Error loading logs:", error); }
}

// --- SUBMIT COMPLIANCE HOURS ---
hoursForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!linkedStudentId) return;

  submitHoursBtn.innerText = "Submitting...";
  submitHoursBtn.disabled = true;

  const payload = {
    parentId: currentParentId,
    studentId: linkedStudentId,
    courseCode: document.getElementById('hour-type').value,
    dateCompleted: document.getElementById('hour-date').value,
    hoursLog: parseFloat(document.getElementById('hour-amount').value),
    taskDescription: document.getElementById('hour-task').value.trim(), // NEW FIELD
    status: 'pending', 
    timestamp: serverTimestamp()
  };

  try {
    await addDoc(collection(db, `schools/${activeSchoolId}/compliance_hours`), payload);
    alert("Hours successfully submitted for review!");
    hoursForm.reset();
    loadRecentComplianceLogs(); // Refresh the list and progress bars instantly
  } catch (error) {
    console.error("Error submitting hours:", error);
    alert("Failed to submit hours.");
  } finally {
    submitHoursBtn.innerText = "Submit Hours";
    submitHoursBtn.disabled = false;
  }
});

// --- LOAD CUSTOM BRANDING ---
async function loadSchoolBranding() {
  try {
    const schoolRef = doc(db, "schools", activeSchoolId);
    const schoolSnap = await getDoc(schoolRef);
    if (schoolSnap.exists() && schoolSnap.data().branding) {
      const branding = schoolSnap.data().branding;
      if (branding.primaryColor) {
        document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
        const brandText = document.querySelector('.sidebar .brand h2');
        if (brandText) brandText.style.color = branding.primaryColor;
      }
      const logoEl = document.getElementById('sidebar-logo');
      if (logoEl && branding.logoUrl) {
        logoEl.src = branding.logoUrl;
        logoEl.classList.remove('hidden');
      }
    }
  } catch (error) { console.error(error); }
}

logoutBtn.addEventListener('click', () => { signOut(auth).then(() => { localStorage.removeItem('activeSchoolId'); }); });