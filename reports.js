import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, addDoc, deleteDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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
const dynamicSidebar = document.getElementById('dynamic-sidebar');
const templatesTbody = document.getElementById('templates-tbody');
const createTemplateBtn = document.getElementById('open-template-modal-btn');
const logoutBtn = document.getElementById('logout-btn');

// Builder Modal
const builderModal = document.getElementById('template-modal');
const templateForm = document.getElementById('template-form');
const nameInput = document.getElementById('report-name');
const archetypeSelect = document.getElementById('report-archetype');
const descInput = document.getElementById('report-desc');

// Run Modal
const runModal = document.getElementById('run-modal');
const runTitle = document.getElementById('run-modal-title');
const runTargetLabel = document.getElementById('run-target-label');
const runTargetSelect = document.getElementById('run-target-select');
const generateBtn = document.getElementById('generate-report-btn');

// Output View
const reportContainer = document.getElementById('printable-report-container');
const reportOutput = document.getElementById('report-output');
const reportControls = document.querySelector('.report-controls'); // the table section
const closeReportBtn = document.getElementById('close-report-btn');

let activeSchoolId = localStorage.getItem('activeSchoolId');
let currentUserRole = null;
let currentTeacherId = null;
let templatesCache = {};
let activeRunArchetype = null;

// --- AUTHENTICATION & ROUTING ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists()) {
        const userData = userProfileSnap.data();
        currentUserRole = userData.role;
        currentTeacherId = user.uid;

        loadSchoolBranding();
        buildNavigation(currentUserRole);
        
        // Admins can see the create button
        if (currentUserRole === 'admin') {
          createTemplateBtn.classList.remove('hidden');
        }

        listenToTemplates();
      } else { window.location.href = 'login.html'; }
    } catch (e) { window.location.href = 'login.html'; }
  } else { window.location.href = 'login.html'; }
});

function buildNavigation(role) {
  if (role === 'admin') {
    dynamicSidebar.innerHTML = `
      <a href="dashboard.html">Dashboard</a>
      <a href="users.html">Users & Roles</a>
      <a href="courses.html">Courses & Pacing</a>
      <a href="enrollment.html">Enrollment</a>
      <a href="attendance.html">Live Attendance</a>
      <a href="reports.html" class="active">Reports</a>
      <a href="settings.html">Settings</a>
      <a href="profile.html">My Profile</a>
    `;
  } else if (role === 'teacher') {
    dynamicSidebar.innerHTML = `
      <a href="teacher-portal.html">My Dashboard</a>
      <a href="teacher-portal.html">Take Attendance</a>
      <a href="teacher-portal.html">Gradebook</a>
      <a href="reports.html" class="active">Reports</a>
      <a href="profile.html">My Profile</a>
    `;
  }
}

// --- TEMPLATE CRUD (Admins) ---
function listenToTemplates() {
  const reportsRef = collection(db, `schools/${activeSchoolId}/reports`);
  
  onSnapshot(reportsRef, (snapshot) => {
    templatesTbody.innerHTML = '';
    templatesCache = {};

    if (snapshot.empty) {
      templatesTbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: #64748b;">No report templates created yet.</td></tr>';
      return;
    }

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      templatesCache[docSnap.id] = data;

      const formatArchetype = data.archetype.replace('_', ' ').toUpperCase();
      
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${data.name}</strong></td>
        <td><span style="background: #e8f0fe; color: var(--primary-color); padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: bold;">${formatArchetype}</span></td>
        <td style="color: #64748b;">${data.description}</td>
        <td style="text-align: right;">
          <button class="btn-primary run-btn" data-id="${docSnap.id}" style="padding: 6px 12px; width: auto;">▶ Run</button>
          ${currentUserRole === 'admin' ? `<button class="btn-danger delete-btn" data-id="${docSnap.id}" style="padding: 6px 12px; width: auto;">Delete</button>` : ''}
        </td>
      `;
      templatesTbody.appendChild(tr);
    });

    attachTableListeners();
  });
}

templateForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  // 1. Hard Gatekeeper: Stop sneaky teachers!
  if (currentUserRole !== 'admin') {
    alert("Security Violation: Only Administrators can create report templates.");
    builderModal.classList.add('hidden');
    return;
  }

  // 2. Strict Validation: Prevent empty spaces from passing as text
  const reportName = nameInput.value.trim();
  const reportDesc = descInput.value.trim();

  if (!reportName || !reportDesc) {
    alert("Hold up! Please provide a valid Name and Description for this report.");
    return; // Stops the function from saving to the database
  }

  // 3. Save to Firebase
  try {
    await addDoc(collection(db, `schools/${activeSchoolId}/reports`), {
      name: reportName,
      archetype: archetypeSelect.value,
      description: reportDesc
    });
    builderModal.classList.add('hidden');
    templateForm.reset();
  } catch (error) { 
    console.error("Error creating template:", error); 
    alert("Failed to create template. Check your connection.");
  }
});

// --- RUN REPORT ENGINE ---
function attachTableListeners() {
  // DELETE (Admin Only)
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if(confirm("Delete this template?")) {
        await deleteDoc(doc(db, `schools/${activeSchoolId}/reports`, e.target.getAttribute('data-id')));
      }
    });
  });

  // RUN REPORT (Universal)
  document.querySelectorAll('.run-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const template = templatesCache[e.target.getAttribute('data-id')];
      activeRunArchetype = template.archetype;
      
      runTitle.innerText = `Run: ${template.name}`;
      runTargetSelect.innerHTML = '<option value="" disabled selected>Loading...</option>';
      runModal.classList.remove('hidden');

      // Populate Target Dropdown based on Archetype
      try {
        if (activeRunArchetype.includes('course')) {
          runTargetLabel.innerText = "Select Course";
          
          // Teachers only see their courses; Admins see all
          const qBase = collection(db, `schools/${activeSchoolId}/courses`);
          const q = currentUserRole === 'teacher' ? query(qBase, where("teacherId", "==", currentTeacherId)) : qBase;
          
          const snaps = await getDocs(q);
          runTargetSelect.innerHTML = '<option value="" disabled selected>Choose a course...</option>';
          snaps.forEach(d => {
            runTargetSelect.innerHTML += `<option value="${d.id}">${d.data().courseCode}: ${d.data().courseName}</option>`;
          });

        } else if (activeRunArchetype.includes('student')) {
          runTargetLabel.innerText = "Select Student";
          const snaps = await getDocs(query(collection(db, `schools/${activeSchoolId}/users`), where("role", "==", "student")));
          runTargetSelect.innerHTML = '<option value="" disabled selected>Choose a student...</option>';
          snaps.forEach(d => {
            runTargetSelect.innerHTML += `<option value="${d.id}">${d.data().lastName}, ${d.data().firstName}</option>`;
          });
        }
      } catch (err) { console.error(err); }
    });
  });
}

// THE GENERATOR
generateBtn.addEventListener('click', async () => {
  const targetId = runTargetSelect.value;
  const targetName = runTargetSelect.options[runTargetSelect.selectedIndex].text;
  if (!targetId) return alert("Please select a target.");

  generateBtn.innerText = "Generating...";
  runModal.classList.add('hidden');
  
  // Switch to Print View
  reportControls.style.display = 'none';
  reportContainer.style.display = 'block';
  reportOutput.innerHTML = '<h3 style="text-align: center; color: #64748b; margin-top: 50px;">Compiling Data...</h3>';

  let html = `<div class="report-header">
                <h1 style="color: var(--primary-color); margin-bottom: 8px;">SimpleSIS Report</h1>
                <h2>Target: ${targetName}</h2>
                <p style="color: #64748b;">Generated on: ${new Date().toLocaleDateString()}</p>
              </div>`;

  try {
    if (activeRunArchetype === 'missing_assignments') {
      html += await generateMissingReport(targetId);
    } else if (activeRunArchetype === 'course_roster') {
      html += await generateRosterReport(targetId);
    } else if (activeRunArchetype === 'student_progress') {
      html += await generateStudentProgress(targetId);
    }
  } catch (error) {
    html += `<p style="color: red; text-align: center;">Error compiling report.</p>`;
    console.error(error);
  }

  reportOutput.innerHTML = html;
  generateBtn.innerText = "Generate";
});

// --- REPORT BUILDER FUNCTIONS ---

async function generateMissingReport(courseId) {
  // 1. Get all grades for the course where missing == true
  const q = query(collection(db, `schools/${activeSchoolId}/grades`), where("courseId", "==", courseId), where("missing", "==", true));
  const gradesSnap = await getDocs(q);
  
  if (gradesSnap.empty) return "<p style='text-align: center;'>No missing assignments found for this course. Great job!</p>";

  // Fetch names
  const students = {};
  const assignments = {};
  
  let tableRows = '';
  for (const docSnap of gradesSnap.docs) {
    const data = docSnap.data();
    
    // Cache fetching to save reads
    if (!students[data.studentId]) {
      const s = await getDoc(doc(db, `schools/${activeSchoolId}/users`, data.studentId));
      students[data.studentId] = s.exists() ? `${s.data().lastName}, ${s.data().firstName}` : 'Unknown Student';
    }
    if (!assignments[data.assignmentId]) {
      const a = await getDoc(doc(db, `schools/${activeSchoolId}/courses/${courseId}/assignments`, data.assignmentId));
      assignments[data.assignmentId] = a.exists() ? a.data().title : 'Unknown Assignment';
    }

    tableRows += `<tr><td>${students[data.studentId]}</td><td>${assignments[data.assignmentId]}</td><td style="color: #d93025; font-weight: bold;">Missing</td></tr>`;
  }

  return `<table class="report-table"><thead><tr><th>Student Name</th><th>Assignment</th><th>Status</th></tr></thead><tbody>${tableRows}</tbody></table>`;
}

async function generateRosterReport(courseId) {
  const courseSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, courseId));
  const enrolledIds = courseSnap.data().enrolledStudents || [];
  
  if (enrolledIds.length === 0) return "<p>No students enrolled.</p>";

  let tableRows = '';
  for (const sId of enrolledIds) {
    const s = await getDoc(doc(db, `schools/${activeSchoolId}/users`, sId));
    if (s.exists()) {
      tableRows += `<tr><td>${s.data().lastName}, ${s.data().firstName}</td><td>${s.data().email}</td></tr>`;
    }
  }
  return `<table class="report-table"><thead><tr><th>Student Name</th><th>Email</th></tr></thead><tbody>${tableRows}</tbody></table>`;
}

async function generateStudentProgress(studentId) {
  const q = query(collection(db, `schools/${activeSchoolId}/grades`), where("studentId", "==", studentId));
  const gradesSnap = await getDocs(q);
  
  if (gradesSnap.empty) return "<p>No grades found for this student.</p>";

  const assignments = {};
  let tableRows = '';

  for (const docSnap of gradesSnap.docs) {
    const data = docSnap.data();
    
    if (!assignments[data.assignmentId]) {
      const a = await getDoc(doc(db, `schools/${activeSchoolId}/courses/${data.courseId}/assignments`, data.assignmentId));
      assignments[data.assignmentId] = a.exists() ? a.data().title : 'Unknown';
    }

    let displayScore = data.score !== null ? data.score : "--";
    if (data.missing) displayScore = "Missing (0)";
    if (data.noCount) displayScore = "No Count";

    tableRows += `<tr><td>${assignments[data.assignmentId]}</td><td>${displayScore}</td></tr>`;
  }

  return `<table class="report-table"><thead><tr><th>Assignment</th><th>Score Logged</th></tr></thead><tbody>${tableRows}</tbody></table>`;
}

// --- MODAL & UI CONTROLS ---
closeReportBtn.addEventListener('click', () => {
  reportContainer.style.display = 'none';
  reportControls.style.display = 'block';
});

createTemplateBtn.addEventListener('click', () => builderModal.classList.remove('hidden'));
document.getElementById('close-modal-btn').addEventListener('click', () => builderModal.classList.add('hidden'));
document.getElementById('cancel-btn').addEventListener('click', () => builderModal.classList.add('hidden'));

document.getElementById('close-run-btn').addEventListener('click', () => runModal.classList.add('hidden'));
document.getElementById('cancel-run-btn').addEventListener('click', () => runModal.classList.add('hidden'));

// --- BRANDING & LOGOUT ---
async function loadSchoolBranding() {
  try {
    const schoolSnap = await getDoc(doc(db, "schools", activeSchoolId));
    if (schoolSnap.exists() && schoolSnap.data().branding?.primaryColor) {
      const color = schoolSnap.data().branding.primaryColor;
      document.documentElement.style.setProperty('--primary-color', color);
      const brandText = document.querySelector('.sidebar .brand h2');
      if (brandText) brandText.style.color = color;
    }
  } catch (e) {}
}

logoutBtn.addEventListener('click', () => { signOut(auth).then(() => { localStorage.removeItem('activeSchoolId'); }); });
