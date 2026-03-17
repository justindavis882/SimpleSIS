import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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
const courseTitleEl = document.getElementById('course-title-display');
const thead = document.getElementById('matrix-thead');
const tbody = document.getElementById('matrix-tbody');
const submitGradesBtn = document.getElementById('submit-grades-btn');
const logoutBtn = document.getElementById('logout-btn');

// Modal Elements
const modal = document.getElementById('assignment-modal');
const openModalBtn = document.getElementById('open-assignment-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const assignmentForm = document.getElementById('assignment-form');
const assignmentsListEl = document.getElementById('assignments-list');
const editIdInput = document.getElementById('edit-id');

// State Caches
let activeSchoolId = localStorage.getItem('activeSchoolId');
let currentTeacherId = null;
const urlParams = new URLSearchParams(window.location.search);
const activeCourseId = urlParams.get('course');

let assignmentsCache = []; // Array of assignment objects
let studentCache = []; // Array of student objects
let gradesCache = {}; // Keyed by: "studentId_assignmentId"

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
  if (!activeCourseId) return window.location.href = 'teacher-portal.html';

  if (user && activeSchoolId) {
    try {
      const userProfileSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, user.uid));
      if (userProfileSnap.exists() && userProfileSnap.data().role === 'teacher') {
        currentTeacherId = user.uid;
        loadSchoolBranding();
        initializeGradebook(); 
      } else { window.location.href = 'login.html'; }
    } catch (e) { window.location.href = 'login.html'; }
  } else { window.location.href = 'login.html'; }
});

// --- MASTER DATA LOADER ---
async function initializeGradebook() {
  try {
    // 1. Load Course Details
    const courseSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, activeCourseId));
    if (!courseSnap.exists()) return;
    courseTitleEl.innerText = `${courseSnap.data().courseCode}: ${courseSnap.data().courseName}`;
    const enrolledIds = courseSnap.data().enrolledStudents || [];

    // 2. Load Student Profiles
    studentCache = [];
    for (const sId of enrolledIds) {
      const sSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, sId));
      if (sSnap.exists()) {
        studentCache.push({ id: sId, ...sSnap.data() });
      }
    }
    // Sort students alphabetically by last name
    studentCache.sort((a, b) => a.lastName.localeCompare(b.lastName));

    // 3. Load Grades (One-time fetch for the grid)
    const gradesQ = query(collection(db, `schools/${activeSchoolId}/grades`), where("courseId", "==", activeCourseId));
    const gradesSnap = await getDocs(gradesQ);
    gradesCache = {};
    gradesSnap.forEach(gSnap => {
      const gData = gSnap.data();
      gradesCache[`${gData.studentId}_${gData.assignmentId}`] = gData;
    });

    // 4. Listen to Assignments (Real-time so modal updates instantly)
    listenToAssignments();

  } catch (error) {
    console.error("Error initializing gradebook:", error);
  }
}

// --- ASSIGNMENTS LISTENER & GRID RENDERER ---
function listenToAssignments() {
  const assignmentsRef = collection(db, `schools/${activeSchoolId}/courses/${activeCourseId}/assignments`);
  
  onSnapshot(assignmentsRef, (snapshot) => {
    assignmentsCache = [];
    assignmentsListEl.innerHTML = '';

    snapshot.forEach(docSnap => {
      const data = { id: docSnap.id, ...docSnap.data() };
      assignmentsCache.push(data);

      // Populate Modal List
      const item = document.createElement('div');
      item.className = 'assignment-list-item';
      item.innerHTML = `
        <div><strong>${data.title}</strong> <span style="color:#64748b; font-size:12px;">(${data.maxScore} pts)</span></div>
        <div>
          <button class="btn-secondary edit-btn" data-id="${data.id}" style="padding: 4px 8px; font-size: 12px; width: auto; margin-right: 8px;">Edit</button>
          <button class="btn-danger delete-btn" data-id="${data.id}" style="padding: 4px 8px; font-size: 12px; width: auto;">Delete</button>
        </div>
      `;
      assignmentsListEl.appendChild(item);
    });

    // Sort assignments by Due Date (oldest first)
    assignmentsCache.sort((a, b) => new Date(a.dateDue) - new Date(b.dateDue));
    
    attachModalListListeners();
    renderMatrixGrid(); // Rebuild the whole table!
  });
}

function renderMatrixGrid() {
  if (assignmentsCache.length === 0) {
    thead.innerHTML = '<tr><th>Student Name</th><th>No Assignments</th></tr>';
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; padding: 24px; color:#64748b;">Use the "Manage Assignments" button to create your first assignment.</td></tr>';
    submitGradesBtn.disabled = true;
    return;
  }

  // 1. Build Header Row
  let headerHtml = '<tr><th>Student Name</th>';
  assignmentsCache.forEach(assign => {
    headerHtml += `
      <th style="text-align: center;">
        ${assign.title}<br>
        <span style="font-size: 11px; font-weight: normal; color: #94a3b8;">${assign.dateDue} &bull; ${assign.maxScore} pts</span>
      </th>`;
  });
  headerHtml += '</tr>';
  thead.innerHTML = headerHtml;

  // 2. Build Student Rows
  if (studentCache.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${assignmentsCache.length + 1}" style="text-align:center;">No students enrolled in this course.</td></tr>`;
    return;
  }

  tbody.innerHTML = '';
  studentCache.forEach(student => {
    const tr = document.createElement('tr');
    
    // First Column: Sticky Name
    let rowHtml = `<td>${student.lastName}, ${student.firstName}</td>`;
    
    // Grid Cells
    assignmentsCache.forEach(assign => {
      const gradeKey = `${student.id}_${assign.id}`;
      const existingGrade = gradesCache[gradeKey];
      
      // Determine what to show in the box based on Skyward shorthand
      let displayVal = "";
      if (existingGrade) {
        if (existingGrade.missing) displayVal = "M";
        else if (existingGrade.noCount) displayVal = "NC";
        else if (existingGrade.score !== null) displayVal = existingGrade.score;
      }

      rowHtml += `
        <td style="text-align: center;">
          <input type="text" class="grid-input" 
            data-student-id="${student.id}" 
            data-assignment-id="${assign.id}" 
            value="${displayVal}">
        </td>`;
    });
    
    tr.innerHTML = rowHtml;
    tbody.appendChild(tr);
  });

  submitGradesBtn.disabled = false;
}

// --- SAVING THE MATRIX ---
submitGradesBtn.addEventListener('click', async () => {
  submitGradesBtn.innerText = "Saving...";
  submitGradesBtn.disabled = true;

  const inputs = document.querySelectorAll('.grid-input');
  let savePromises = [];
  let updateCount = 0;

  inputs.forEach(input => {
    const studentId = input.getAttribute('data-student-id');
    const assignmentId = input.getAttribute('data-assignment-id');
    const rawValue = input.value.trim().toUpperCase(); // Capitalize for easy checking
    const gradeKey = `${studentId}_${assignmentId}`;
    
    let parsedState = { score: null, missing: false, noCount: false };

    // Parse Skyward Logic
    if (rawValue === "M") parsedState.missing = true;
    else if (rawValue === "NC" || rawValue === "EX") parsedState.noCount = true;
    else if (rawValue !== "") {
      const num = parseFloat(rawValue);
      if (!isNaN(num)) parsedState.score = num;
    }

    // Only hit the database if they typed something or changed something
    const oldState = gradesCache[gradeKey];
    const isNewAndFilled = !oldState && rawValue !== "";
    const isChanged = oldState && (oldState.score !== parsedState.score || oldState.missing !== parsedState.missing || oldState.noCount !== parsedState.noCount);

    if (isNewAndFilled || isChanged) {
      const gradeRef = doc(db, `schools/${activeSchoolId}/grades`, gradeKey);
      
      const payload = {
        studentId: studentId,
        courseId: activeCourseId,
        assignmentId: assignmentId,
        teacherId: currentTeacherId,
        score: parsedState.score,
        missing: parsedState.missing,
        noCount: parsedState.noCount,
        timestamp: serverTimestamp()
      };

      // Push to Firebase and update local cache immediately
      savePromises.push(setDoc(gradeRef, payload, { merge: true }));
      gradesCache[gradeKey] = payload; 
      updateCount++;
    }
  });

  try {
    await Promise.all(savePromises);
    alert(`Matrix sync complete. ${updateCount} grades updated!`);
  } catch (error) {
    console.error("Error saving grid:", error);
    alert("An error occurred while saving. Please check your connection.");
  } finally {
    submitGradesBtn.innerText = "💾 Save All Grades";
    submitGradesBtn.disabled = false;
    renderMatrixGrid(); // Refresh UI to clean up formatting
  }
});

// --- MODAL CRUD LOGIC (Unchanged) ---
assignmentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    title: document.getElementById('assign-title').value.trim(),
    dateAssigned: document.getElementById('assign-date').value,
    dateDue: document.getElementById('assign-due').value,
    maxScore: parseInt(document.getElementById('assign-max').value),
    description: document.getElementById('assign-desc').value.trim(),
    updatedAt: serverTimestamp()
  };

  const editingId = editIdInput.value;
  try {
    if (editingId) await updateDoc(doc(db, `schools/${activeSchoolId}/courses/${activeCourseId}/assignments`, editingId), payload);
    else await addDoc(collection(db, `schools/${activeSchoolId}/courses/${activeCourseId}/assignments`), { ...payload, createdAt: serverTimestamp() });
    
    resetForm();
  } catch (error) { console.error(error); alert("Failed to save assignment."); }
});

function attachModalListListeners() {
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      const data = assignmentsCache.find(a => a.id === id);
      document.getElementById('form-mode-title').innerText = "✏️ Edit Assignment";
      editIdInput.value = id;
      document.getElementById('assign-title').value = data.title;
      document.getElementById('assign-date').value = data.dateAssigned;
      document.getElementById('assign-due').value = data.dateDue;
      document.getElementById('assign-max').value = data.maxScore;
      document.getElementById('assign-desc').value = data.description || "";
      document.getElementById('cancel-edit-btn').classList.remove('hidden');
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if(confirm("Delete assignment?")) {
        await deleteDoc(doc(db, `schools/${activeSchoolId}/courses/${activeCourseId}/assignments`, id));
        if (editIdInput.value === id) resetForm();
      }
    });
  });
}

function resetForm() {
  assignmentForm.reset();
  editIdInput.value = "";
  document.getElementById('form-mode-title').innerText = "+ Create New Assignment";
  document.getElementById('cancel-edit-btn').classList.add('hidden');
}

document.getElementById('cancel-edit-btn').addEventListener('click', resetForm);
openModalBtn.addEventListener('click', () => modal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => { modal.classList.add('hidden'); resetForm(); });

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
