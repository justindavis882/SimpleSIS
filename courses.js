import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, addDoc, updateDoc, onSnapshot } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const tbody = document.getElementById('courses-tbody');
const modal = document.getElementById('course-modal');
const form = document.getElementById('course-form');
const teacherSelect = document.getElementById('course-teacher');
const logoutBtn = document.getElementById('logout-btn');

let activeSchoolId = localStorage.getItem('activeSchoolId');
let coursesCache = {};
let teachersCache = {};

// --- AUTHENTICATION ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    const userSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, user.uid));
    if (userSnap.exists() && userSnap.data().role === 'admin') {
      loadSchoolBranding();
      await fetchTeachers();
      listenToCourses();
    } else { window.location.href = 'login.html'; }
  } else { window.location.href = 'login.html'; }
});

// --- FETCH DATA ---
async function fetchTeachers() {
  const q = query(collection(db, `schools/${activeSchoolId}/users`), where("role", "==", "teacher"));
  const snaps = await getDocs(q);
  teacherSelect.innerHTML = '';
  snaps.forEach(d => {
    teachersCache[d.id] = d.data();
    teacherSelect.innerHTML += `<option value="${d.id}">${d.data().lastName}, ${d.data().firstName}</option>`;
  });
}

function listenToCourses() {
  onSnapshot(collection(db, `schools/${activeSchoolId}/courses`), (snapshot) => {
    tbody.innerHTML = '';
    coursesCache = {};

    if (snapshot.empty) return tbody.innerHTML = '<tr><td colspan="5" style="text-align: center;">No courses created yet.</td></tr>';

    snapshot.forEach(docSnap => {
      const data = docSnap.data();
      coursesCache[docSnap.id] = data;

      // Formatting for the table
      const typeBadge = data.courseType === 'Required' ? 'badge-req' : (data.courseType === 'Elective' ? 'badge-ele' : 'badge-aft');
      const daysStr = (data.daysMet || []).join(', ');
      
      // Format Time (12hr format)
      const formatTime = (time24) => {
        if(!time24) return "";
        let [h, m] = time24.split(':');
        let ampm = h >= 12 ? 'PM' : 'AM';
        h = h % 12 || 12;
        return `${h}:${m} ${ampm}`;
      };

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${data.courseCode}</strong><br><span style="color:#64748b; font-size:13px;">${data.courseName}</span></td>
        <td><span class="badge ${typeBadge}">${data.courseType || 'Required'}</span><br><span style="color:#64748b; font-size:13px;">Room: ${data.roomNumber || 'TBD'}</span></td>
        <td><span style="font-weight: 500;">${daysStr || 'TBD'}</span><br><span style="color:#64748b; font-size:13px;">${formatTime(data.startTime)} - ${formatTime(data.endTime)}</span></td>
        <td>${data.isActive ? '🟢 Active' : '🔴 Inactive'}</td>
        <td style="text-align: right;">
          <button class="btn-secondary edit-btn" data-id="${docSnap.id}">Edit</button>
        </td>
      `;
      tbody.appendChild(tr);
    });
  });
}

// --- FORM HANDLING (CRUD) ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  // Extract Arrays
  const selectedTeachers = Array.from(teacherSelect.selectedOptions).map(opt => opt.value);
  const selectedDays = Array.from(document.querySelectorAll('.day-chk:checked')).map(chk => chk.value);

  const payload = {
    courseCode: document.getElementById('course-code').value.trim(),
    courseName: document.getElementById('course-name').value.trim(),
    courseType: document.getElementById('course-type').value,
    roomNumber: document.getElementById('course-room').value.trim(),
    startDate: document.getElementById('start-date').value,
    endDate: document.getElementById('end-date').value,
    startTime: document.getElementById('start-time').value,
    endTime: document.getElementById('end-time').value,
    daysMet: selectedDays,
    teacherIds: selectedTeachers, // Notice the new 's' (Array)
    isActive: document.getElementById('course-active').checked
  };

  const editId = document.getElementById('edit-course-id').value;
  try {
    if (editId) {
      await updateDoc(doc(db, `schools/${activeSchoolId}/courses`, editId), payload);
    } else {
      payload.enrolledStudents = [];
      await addDoc(collection(db, `schools/${activeSchoolId}/courses`), payload);
    }
    closeModal();
  } catch (err) { console.error(err); alert("Failed to save course."); }
});

// Event Delegation for Edit Buttons
tbody.addEventListener('click', (e) => {
  if (e.target.classList.contains('edit-btn')) {
    const id = e.target.getAttribute('data-id');
    const data = coursesCache[id];
    
    document.getElementById('modal-title').innerText = "Edit Course";
    document.getElementById('edit-course-id').value = id;
    document.getElementById('course-code').value = data.courseCode;
    document.getElementById('course-name').value = data.courseName;
    document.getElementById('course-type').value = data.courseType || "Required";
    document.getElementById('course-room').value = data.roomNumber || "";
    document.getElementById('start-date').value = data.startDate || "";
    document.getElementById('end-date').value = data.endDate || "";
    document.getElementById('start-time').value = data.startTime || "";
    document.getElementById('end-time').value = data.endTime || "";
    document.getElementById('course-active').checked = data.isActive !== false;

    // Repopulate Checkboxes
    document.querySelectorAll('.day-chk').forEach(chk => {
      chk.checked = (data.daysMet || []).includes(chk.value);
    });

    // Repopulate Multi-Select Dropdown
    Array.from(teacherSelect.options).forEach(opt => {
      opt.selected = (data.teacherIds || []).includes(opt.value);
      // Fallback for older data that used the string 'teacherId'
      if (data.teacherId && !data.teacherIds && data.teacherId === opt.value) opt.selected = true; 
    });

    modal.classList.remove('hidden');
  }
});

function closeModal() {
  modal.classList.add('hidden');
  form.reset();
  document.getElementById('edit-course-id').value = "";
  document.getElementById('modal-title').innerText = "Create New Course";
}

document.getElementById('open-course-modal-btn').addEventListener('click', () => modal.classList.remove('hidden'));
document.getElementById('close-modal-btn').addEventListener('click', closeModal);
document.getElementById('cancel-btn').addEventListener('click', closeModal);

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
