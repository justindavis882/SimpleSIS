import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, updateDoc, deleteDoc, onSnapshot, serverTimestamp, setDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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

// DOM Elements - Main UI
const courseTitleEl = document.getElementById('course-title-display');
const assignmentSelect = document.getElementById('assignment-select');
const tbody = document.getElementById('roster-tbody');
const submitGradesBtn = document.getElementById('submit-grades-btn');
const logoutBtn = document.getElementById('logout-btn');

// DOM Elements - Modal
const modal = document.getElementById('assignment-modal');
const openModalBtn = document.getElementById('open-assignment-modal-btn');
const closeModalBtn = document.getElementById('close-modal-btn');
const assignmentForm = document.getElementById('assignment-form');
const assignmentsListEl = document.getElementById('assignments-list');

// Form Inputs
const formTitle = document.getElementById('form-mode-title');
const editIdInput = document.getElementById('edit-id');
const titleInput = document.getElementById('assign-title');
const dateAssignedInput = document.getElementById('assign-date');
const dateDueInput = document.getElementById('assign-due');
const maxScoreInput = document.getElementById('assign-max');
const descInput = document.getElementById('assign-desc');
const cancelEditBtn = document.getElementById('cancel-edit-btn');

// State Variables
let activeSchoolId = localStorage.getItem('activeSchoolId');
let currentTeacherId = null;
const urlParams = new URLSearchParams(window.location.search);
const activeCourseId = urlParams.get('course');

let assignmentsCache = {}; 
let rosterCache = []; 

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
  if (!activeCourseId) {
    alert("Please select a course from your dashboard.");
    window.location.href = 'teacher-portal.html';
    return;
  }

  if (user && activeSchoolId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'teacher') {
        currentTeacherId = user.uid;
        loadSchoolBranding();
        loadCourseDetails();
        listenToAssignments(); 
      } else {
        window.location.href = 'login.html';
      }
    } catch (error) { window.location.href = 'login.html'; }
  } else {
    window.location.href = 'login.html';
  }
});

// --- INITIAL DATA LOAD ---
async function loadCourseDetails() {
  const courseSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, activeCourseId));
  if (courseSnap.exists()) {
    courseTitleEl.innerText = `${courseSnap.data().courseCode}: ${courseSnap.data().courseName}`;
    rosterCache = courseSnap.data().enrolledStudents || [];
  }
}

// --- REAL-TIME ASSIGNMENTS (CRUD) ---
function listenToAssignments() {
  const assignmentsRef = collection(db, `schools/${activeSchoolId}/courses/${activeCourseId}/assignments`);
  
  onSnapshot(assignmentsRef, (snapshot) => {
    // 1. Clear UI
    assignmentSelect.innerHTML = '<option value="" disabled selected>Select an assignment...</option>';
    assignmentsListEl.innerHTML = '';
    assignmentsCache = {};

    if (snapshot.empty) {
      assignmentsListEl.innerHTML = '<p style="color: #64748b; font-size: 14px;">No assignments created yet.</p>';
      return;
    }

    // 2. Populate Dropdown & Modal List
    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      const id = docSnap.id;
      assignmentsCache[id] = data;

      // Dropdown Option
      const option = document.createElement('option');
      option.value = id;
      option.text = `${data.title} (Max: ${data.maxScore})`;
      assignmentSelect.appendChild(option);

      // Modal List Item
      const item = document.createElement('div');
      item.className = 'assignment-list-item';
      item.innerHTML = `
        <div>
          <strong>${data.title}</strong> <span style="color:#64748b; font-size:12px;">(Due: ${data.dateDue})</span>
        </div>
        <div>
          <button class="btn-secondary edit-btn" data-id="${id}" style="padding: 4px 8px; font-size: 12px; width: auto; margin-right: 8px;">Edit</button>
          <button class="btn-danger delete-btn" data-id="${id}" style="padding: 4px 8px; font-size: 12px; width: auto;">Delete</button>
        </div>
      `;
      assignmentsListEl.appendChild(item);
    });

    attachModalListListeners();
  });
}

// --- ASSIGNMENT FORM LOGIC (CREATE / UPDATE) ---
assignmentForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const payload = {
    title: titleInput.value.trim(),
    dateAssigned: dateAssignedInput.value,
    dateDue: dateDueInput.value,
    maxScore: parseInt(maxScoreInput.value),
    description: descInput.value.trim(),
    updatedAt: serverTimestamp()
  };

  const editingId = editIdInput.value;

  try {
    if (editingId) {
      // UPDATE
      await updateDoc(doc(db, `schools/${activeSchoolId}/courses/${activeCourseId}/assignments`, editingId), payload);
    } else {
      // CREATE
      payload.createdAt = serverTimestamp();
      await addDoc(collection(db, `schools/${activeSchoolId}/courses/${activeCourseId}/assignments`), payload);
    }
    
    resetForm();
  } catch (error) {
    console.error("Error saving assignment:", error);
    alert("Failed to save assignment.");
  }
});

function attachModalListListeners() {
  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const id = e.target.getAttribute('data-id');
      const data = assignmentsCache[id];
      
      formTitle.innerText = "✏️ Edit Assignment";
      editIdInput.value = id;
      titleInput.value = data.title;
      dateAssignedInput.value = data.dateAssigned;
      dateDueInput.value = data.dateDue;
      maxScoreInput.value = data.maxScore;
      descInput.value = data.description || "";
      
      cancelEditBtn.classList.remove('hidden');
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if(confirm("Delete this assignment? This will NOT delete grades already submitted, but they will be orphaned.")) {
        await deleteDoc(doc(db, `schools/${activeSchoolId}/courses/${activeCourseId}/assignments`, id));
        if (editIdInput.value === id) resetForm();
      }
    });
  });
}

function resetForm() {
  assignmentForm.reset();
  editIdInput.value = "";
  formTitle.innerText = "+ Create New Assignment";
  cancelEditBtn.classList.add('hidden');
}
cancelEditBtn.addEventListener('click', resetForm);

// --- MODAL CONTROLS ---
openModalBtn.addEventListener('click', () => modal.classList.remove('hidden'));
closeModalBtn.addEventListener('click', () => {
  modal.classList.add('hidden');
  resetForm();
});


// --- GRADEBOOK ROSTER LOGIC ---
assignmentSelect.addEventListener('change', () => {
  loadGradingTable(assignmentSelect.value);
});

async function loadGradingTable(assignmentId) {
  const selectedAssignment = assignmentsCache[assignmentId];
  if (!selectedAssignment) return;

  tbody.innerHTML = '';
  
  if (rosterCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No students enrolled.</td></tr>';
    submitGradesBtn.disabled = true;
    return;
  }

  // Generate rows for enrolled students
  for (const studentId of rosterCache) {
    const studentSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, studentId));
    
    if (studentSnap.exists()) {
      const student = studentSnap.data();
      const tr = document.createElement('tr');
      
      tr.innerHTML = `
        <td><strong>${student.lastName}, ${student.firstName}</strong></td>
        <td>
          <div class="status-checkboxes">
            <label><input type="checkbox" class="missing-chk" data-id="${studentId}"> Missing</label>
            <label><input type="checkbox" class="nocount-chk" data-id="${studentId}"> No Count</label>
          </div>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <input type="number" class="grade-input" data-id="${studentId}" min="0" max="${selectedAssignment.maxScore}" placeholder="--"> 
          <span style="color: #64748b; font-size: 14px; margin-left: 4px;">/ ${selectedAssignment.maxScore}</span>
        </td>
      `;
      tbody.appendChild(tr);
    }
  }

  // Attach dynamic logic: If "Missing" is checked, optionally clear the score
  document.querySelectorAll('.missing-chk').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const id = e.target.getAttribute('data-id');
      const scoreInput = document.querySelector(`.grade-input[data-id="${id}"]`);
      if (e.target.checked) scoreInput.value = 0; // Auto-zero missing work
    });
  });

  submitGradesBtn.disabled = false;
}

// --- SUBMIT GRADES TO FIREBASE ---
submitGradesBtn.addEventListener('click', async () => {
  const assignmentId = assignmentSelect.value;
  if (!assignmentId) return;

  submitGradesBtn.innerText = "Saving...";
  submitGradesBtn.disabled = true;

  try {
    const rows = tbody.querySelectorAll('tr');
    let gradesSaved = 0;

    for (let row of rows) {
      const studentId = row.querySelector('.grade-input').getAttribute('data-id');
      const scoreInput = row.querySelector('.grade-input').value;
      const isMissing = row.querySelector('.missing-chk').checked;
      const isNoCount = row.querySelector('.nocount-chk').checked;

      // Only write to DB if they actually entered a score or flagged it
      if (scoreInput !== "" || isMissing || isNoCount) {
        
        // We use setDoc with a custom ID (studentId_assignmentId) so if the teacher 
        // grades this assignment again tomorrow, it UPDATES the record instead of duplicating it.
        const gradeDocId = `${studentId}_${assignmentId}`;
        const gradeRef = doc(db, `schools/${activeSchoolId}/grades`, gradeDocId);

        await setDoc(gradeRef, {
          studentId: studentId,
          courseId: activeCourseId,
          assignmentId: assignmentId,
          teacherId: currentTeacherId,
          score: scoreInput === "" ? null : parseFloat(scoreInput),
          missing: isMissing,
          noCount: isNoCount,
          timestamp: serverTimestamp()
        }, { merge: true });

        gradesSaved++;
      }
    }

    alert(`Successfully saved/updated ${gradesSaved} grades!`);
    
    // Clear the table to confirm submission and force them to re-select
    assignmentSelect.value = "";
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #64748b;">Grades saved! Select an assignment to continue grading.</td></tr>';

  } catch (error) {
    console.error("Error submitting grades:", error);
    alert("Failed to save grades.");
  } finally {
    submitGradesBtn.innerText = "Save Grades";
    submitGradesBtn.disabled = true;
  }
});

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
