import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, addDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const dynamicSidebar = document.getElementById('dynamic-sidebar');
const templatesTbody = document.getElementById('templates-tbody');
const createTemplateBtn = document.getElementById('open-template-modal-btn');
const logoutBtn = document.getElementById('logout-btn');

// Modals
const builderModal = document.getElementById('template-modal');
const templateForm = document.getElementById('template-form');
const runModal = document.getElementById('run-modal');
const generateBtn = document.getElementById('generate-report-btn');

// Output
const reportContainer = document.getElementById('printable-report-container');
const reportOutput = document.getElementById('report-output');
const reportControls = document.querySelector('.report-controls');

let activeSchoolId = localStorage.getItem('activeSchoolId');
let currentUserRole = null;
let currentTeacherId = null;
let templatesCache = {};
let activeTemplateId = null;

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const userProfileSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, user.uid));
      if (userProfileSnap.exists()) {
        const userData = userProfileSnap.data();
        currentUserRole = userData.role;
        currentTeacherId = user.uid;
        loadSchoolBranding();
        buildNavigation(currentUserRole);
        if (currentUserRole === 'admin') createTemplateBtn.classList.remove('hidden');
        listenToTemplates();
      } else { window.location.href = 'login.html'; }
    } catch (e) { window.location.href = 'login.html'; }
  } else { window.location.href = 'login.html'; }
});

function buildNavigation(role) {
  if (role === 'admin') {
    dynamicSidebar.innerHTML = `<a href="dashboard.html">Dashboard</a><a href="users.html">Users & Roles</a><a href="courses.html">Courses & Pacing</a><a href="enrollment.html">Enrollment</a><a href="attendance.html">Live Attendance</a><a href="reports.html" class="active">Reports</a><a href="settings.html">Settings</a><a href="profile.html">My Profile</a>`;
  } else if (role === 'teacher') {
    dynamicSidebar.innerHTML = `<a href="teacher-portal.html">My Dashboard</a><a href="teacher-portal.html">Take Attendance</a><a href="teacher-portal.html">Gradebook</a><a href="reports.html" class="active">Reports</a><a href="profile.html">My Profile</a>`;
  }
}

// --- LOAD TEMPLATES ---
function listenToTemplates() {
  onSnapshot(collection(db, `schools/${activeSchoolId}/reports`), (snapshot) => {
    templatesTbody.innerHTML = '';
    templatesCache = {};

    if (snapshot.empty) return templatesTbody.innerHTML = '<tr><td colspan="4" style="text-align: center;">No templates created yet.</td></tr>';

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      templatesCache[docSnap.id] = data;
      const modulesString = (data.modules || []).join(', ').toUpperCase();

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${data.name}</strong></td>
        <td><span style="background: #e8f0fe; color: var(--primary-color); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${data.target.toUpperCase()}</span></td>
        <td style="color: #64748b; font-size: 12px;">${modulesString || "None"}</td>
        <td style="text-align: right;">
          <button class="btn-primary run-btn" data-id="${docSnap.id}" style="padding: 6px 12px; width: auto;">▶ Run</button>
          ${currentUserRole === 'admin' ? `<button class="btn-danger delete-btn" data-id="${docSnap.id}" style="padding: 6px 12px; width: auto; margin-left: 8px;">Delete</button>` : ''}
        </td>
      `;
      templatesTbody.appendChild(tr);
    });
  });
}

// --- CREATE TEMPLATE ---
templateForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (currentUserRole !== 'admin') return;

  const name = document.getElementById('report-name').value.trim();
  const target = document.getElementById('report-target').value;
  const modules = Array.from(document.querySelectorAll('.module-chk:checked')).map(cb => cb.value);

  if (!name || modules.length === 0) return alert("Provide a name and select at least one module!");

  try {
    await addDoc(collection(db, `schools/${activeSchoolId}/reports`), { name, target, modules });
    builderModal.classList.add('hidden');
    templateForm.reset();
  } catch (err) { console.error(err); }
});

// --- EVENT DELEGATION (Fixes Double Clicks!) ---
templatesTbody.addEventListener('click', async (e) => {
  const targetId = e.target.getAttribute('data-id');
  
  // Delete Route
  if (e.target.classList.contains('delete-btn')) {
    if(confirm("Delete template?")) await deleteDoc(doc(db, `schools/${activeSchoolId}/reports`, targetId));
  }

  // Run Route (Fixes the target bug!)
  if (e.target.classList.contains('run-btn')) {
    activeTemplateId = targetId;
    const template = templatesCache[targetId];
    
    document.getElementById('run-modal-title').innerText = `Run: ${template.name}`;
    const targetSelect = document.getElementById('run-target-select');
    runModal.classList.remove('hidden');

    if (template.target === 'course') {
      document.getElementById('run-target-label').innerText = "Select Course";
      const q = currentUserRole === 'teacher' 
        ? query(collection(db, `schools/${activeSchoolId}/courses`), where("teacherIds", "array-contains", currentTeacherId)) 
        : collection(db, `schools/${activeSchoolId}/courses`);
      
      const snaps = await getDocs(q);
      targetSelect.innerHTML = '<option value="" disabled selected>Choose a course...</option>';
      snaps.forEach(d => targetSelect.innerHTML += `<option value="${d.id}">${d.data().courseCode}: ${d.data().courseName}</option>`);
    
    } else if (template.target === 'student') {
      document.getElementById('run-target-label').innerText = "Select Student";
      const snaps = await getDocs(query(collection(db, `schools/${activeSchoolId}/users`), where("role", "==", "student")));
      targetSelect.innerHTML = '<option value="" disabled selected>Choose a student...</option>';
      snaps.forEach(d => targetSelect.innerHTML += `<option value="${d.id}">${d.data().lastName}, ${d.data().firstName}</option>`);
    }
  }
});

// --- THE REPORT GENERATOR ---
generateBtn.addEventListener('click', async () => {
  const targetId = document.getElementById('run-target-select').value;
  const targetName = document.getElementById('run-target-select').options[document.getElementById('run-target-select').selectedIndex].text;
  
  // Capture the custom dates!
  const startDate = document.getElementById('run-start-date').value;
  const endDate = document.getElementById('run-end-date').value;

  if (!targetId) return alert("Please select a target.");

  runModal.classList.add('hidden');
  reportControls.style.display = 'none';
  reportContainer.style.display = 'block';
  reportOutput.innerHTML = '<h3 style="text-align: center; color: #64748b; margin-top: 50px;">Compiling Data...</h3>';

  const template = templatesCache[activeTemplateId];
  const mods = template.modules;

  // Update Header to show Date Range if one was applied
  let dateRangeText = "All Time";
  if (startDate || endDate) {
    dateRangeText = `${startDate ? startDate : 'Beginning'} to ${endDate ? endDate : 'Present'}`;
  }

  let html = `<div class="report-header">
                <h1 style="color: var(--primary-color); margin-bottom: 8px;">${template.name}</h1>
                <h2>${targetName}</h2>
                <p style="color: #64748b;">Report Period: ${dateRangeText} <br> Generated on: ${new Date().toLocaleDateString()}</p>
              </div>`;

  try {
    // Pass dates down to the builders
    if (template.target === 'course') {
      if (mods.includes('roster')) html += await buildCourseRoster(targetId);
      if (mods.includes('grades') || mods.includes('missing')) html += await buildCourseGrades(targetId, mods.includes('missing'), mods.includes('grades'), startDate, endDate);
    } else if (template.target === 'student') {
      html += await buildStudentData(targetId, mods, startDate, endDate);
    }
  } catch (err) {
    console.error(err);
    html += `<p style="color:red;">Error compiling report.</p>`;
  }

  reportOutput.innerHTML = html;
});

// --- HELPER: DATE FILTER ---
function isWithinDateRange(recordDateStr, startDate, endDate) {
  if (!recordDateStr) return true; // If the record has no date, let it pass
  if (startDate && recordDateStr < startDate) return false;
  if (endDate && recordDateStr > endDate) return false;
  return true;
}

// --- MODULE BUILDERS ---
async function buildCourseRoster(courseId) {
  const courseSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, courseId));
  const enrolledIds = courseSnap.data().enrolledStudents || [];
  if (enrolledIds.length === 0) return `<div class="report-section"><h3>Student Roster</h3><p>No students enrolled.</p></div>`;

  let rows = '';
  for (const sId of enrolledIds) {
    const s = await getDoc(doc(db, `schools/${activeSchoolId}/users`, sId));
    if (s.exists()) rows += `<tr><td>${s.data().lastName}, ${s.data().firstName}</td><td>${s.data().email}</td></tr>`;
  }
  return `<div class="report-section"><h3>Student Roster</h3><table class="report-table"><thead><tr><th>Name</th><th>Email</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function buildCourseGrades(courseId, showMissing, showAll, startDate, endDate) {
  const gradesSnap = await getDocs(query(collection(db, `schools/${activeSchoolId}/grades`), where("courseId", "==", courseId)));
  if (gradesSnap.empty) return `<div class="report-section"><h3>Grade Records</h3><p>No grades logged yet.</p></div>`;

  let rows = '';
  const cache = { students: {}, assignments: {} };

  for (const g of gradesSnap.docs) {
    const data = g.data();
    
    // Filter Logic: Missing vs All
    const isMissing = data.missing === true;
    if (!showAll && !isMissing) continue; 

    // Extract Date from Firebase Timestamp
    let recordDateStr = "";
    if (data.timestamp) {
      recordDateStr = data.timestamp.toDate().toISOString().split('T')[0];
    }
    
    // Apply Date Filter!
    if (!isWithinDateRange(recordDateStr, startDate, endDate)) continue;

    if (!cache.students[data.studentId]) {
      const s = await getDoc(doc(db, `schools/${activeSchoolId}/users`, data.studentId));
      cache.students[data.studentId] = s.exists() ? `${s.data().lastName}, ${s.data().firstName}` : 'Unknown';
    }
    if (!cache.assignments[data.assignmentId]) {
      const a = await getDoc(doc(db, `schools/${activeSchoolId}/courses/${courseId}/assignments`, data.assignmentId));
      cache.assignments[data.assignmentId] = a.exists() ? a.data().title : 'Unknown';
    }

    let statusHtml = data.score !== null ? data.score : '--';
    if (isMissing) statusHtml = '<span style="color: #d93025; font-weight:bold;">Missing</span>';
    if (data.noCount) statusHtml = 'No Count';

    rows += `<tr><td>${recordDateStr}</td><td>${cache.students[data.studentId]}</td><td>${cache.assignments[data.assignmentId]}</td><td>${statusHtml}</td></tr>`;
  }

  if(!rows) return `<div class="report-section"><h3>Grade Records</h3><p>No records match the selected date filter.</p></div>`;
  return `<div class="report-section"><h3>Grade Records</h3><table class="report-table"><thead><tr><th>Date Logged</th><th>Student</th><th>Assignment</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

async function buildStudentData(studentId, mods, startDate, endDate) {
  let output = '';
  
  // 1. Roster / Profile
  if (mods.includes('roster')) {
    const s = await getDoc(doc(db, `schools/${activeSchoolId}/users`, studentId));
    output += `<div class="report-section"><h3>Student Profile</h3><p><strong>Name:</strong> ${s.data().lastName}, ${s.data().firstName}<br><strong>Email:</strong> ${s.data().email}</p></div>`;
    
    // Reverse Lookup Schedule
    const scheduleQ = query(collection(db, `schools/${activeSchoolId}/courses`), where("enrolledStudents", "array-contains", studentId));
    const scheduleSnap = await getDocs(scheduleQ);
    let schedRows = '';
    scheduleSnap.forEach(c => {
      schedRows += `<tr><td>${c.data().courseCode}</td><td>${c.data().courseName}</td><td>${c.data().term}</td></tr>`;
    });
    output += `<div class="report-section"><h3>Current Schedule</h3><table class="report-table"><thead><tr><th>Code</th><th>Course</th><th>Term</th></tr></thead><tbody>${schedRows || '<tr><td colspan="3">Not enrolled in any courses.</td></tr>'}</tbody></table></div>`;
  }
  
  // 2. Grades / Missing
  if (mods.includes('grades') || mods.includes('missing')) {
    const gradesSnap = await getDocs(query(collection(db, `schools/${activeSchoolId}/grades`), where("studentId", "==", studentId)));
    let rows = '';
    
    for (const g of gradesSnap.docs) {
      const data = g.data();
      const isMissing = data.missing === true;
      if (!mods.includes('grades') && !isMissing) continue;

      let recordDateStr = data.timestamp ? data.timestamp.toDate().toISOString().split('T')[0] : "";
      if (!isWithinDateRange(recordDateStr, startDate, endDate)) continue;

      const a = await getDoc(doc(db, `schools/${activeSchoolId}/courses/${data.courseId}/assignments`, data.assignmentId));
      const assignName = a.exists() ? a.data().title : 'Unknown';

      let statusHtml = data.score !== null ? data.score : '--';
      if (isMissing) statusHtml = '<span style="color: #d93025; font-weight:bold;">Missing</span>';
      
      rows += `<tr><td>${recordDateStr}</td><td>${assignName}</td><td>${statusHtml}</td></tr>`;
    }
    output += `<div class="report-section"><h3>Academic Progress</h3><table class="report-table"><thead><tr><th>Date Logged</th><th>Assignment</th><th>Score</th></tr></thead><tbody>${rows || '<tr><td colspan="3">No matching records for this period.</td></tr>'}</tbody></table></div>`;
  }

  // 3. Attendance
  if (mods.includes('attendance')) {
    const attSnap = await getDocs(query(collection(db, `schools/${activeSchoolId}/attendance`), where("studentId", "==", studentId)));
    let attRows = '';
    
    const attRecords = [];
    attSnap.forEach(doc => attRecords.push(doc.data()));
    attRecords.sort((a, b) => new Date(b.dateString) - new Date(a.dateString));

    for (const record of attRecords) {
      // Date Filter!
      if (!isWithinDateRange(record.dateString, startDate, endDate)) continue;

      const c = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, record.courseId));
      const courseName = c.exists() ? c.data().courseName : 'Unknown Course';
      let badgeColor = record.status === 'present' ? '#0f9d58' : (record.status === 'absent' ? '#d93025' : '#f59e0b');
      
      attRows += `<tr><td>${record.dateString}</td><td>${courseName}</td><td><strong style="color: ${badgeColor}; text-transform: capitalize;">${record.status}</strong></td></tr>`;
    }
    output += `<div class="report-section"><h3>Attendance History</h3><table class="report-table"><thead><tr><th>Date</th><th>Course</th><th>Status</th></tr></thead><tbody>${attRows || '<tr><td colspan="3">No attendance records for this period.</td></tr>'}</tbody></table></div>`;
  }

  return output;
}

// --- MODAL & UI CONTROLS ---
createTemplateBtn.addEventListener('click', () => {
  builderModal.classList.remove('hidden');
  document.getElementById('template-form').reset(); // Ensure it opens clean
});
document.getElementById('close-modal-btn').addEventListener('click', () => builderModal.classList.add('hidden'));
document.getElementById('cancel-btn').addEventListener('click', () => builderModal.classList.add('hidden'));
document.getElementById('close-run-btn').addEventListener('click', () => runModal.classList.add('hidden'));
document.getElementById('cancel-run-btn').addEventListener('click', () => runModal.classList.add('hidden'));
document.getElementById('close-report-btn').addEventListener('click', () => {
  reportContainer.style.display = 'none';
  reportControls.style.display = 'block';
  // Clear the date inputs when going back so they don't accidentally carry over
  document.getElementById('run-start-date').value = '';
  document.getElementById('run-end-date').value = '';
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

logoutBtn.addEventListener('click', () => { signOut(auth).then(() => { localStorage.removeItem('activeSchoolId'); }); });
