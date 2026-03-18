import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, updateDoc, arrayUnion, arrayRemove } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const schoolNameEl = document.getElementById('display-school-name');
const courseSelect = document.getElementById('course-select');
const studentSelect = document.getElementById('student-select');
const enrollBtn = document.getElementById('enroll-btn');
const tbody = document.getElementById('roster-tbody');
const logoutBtn = document.getElementById('logout-btn');

let activeSchoolId = localStorage.getItem('activeSchoolId');

// Data Caches
let allCourses = {};
let allStudents = {};

// --- AUTH & LOAD DATA ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'admin') {
        schoolNameEl.innerText = `Managing School ID: ${activeSchoolId}`;
        loadSchoolBranding();
        await fetchBaseData();
      } else {
        window.location.href = 'login.html';
      }
    } catch (error) { console.error(error); }
  } else {
    window.location.href = 'login.html';
  }
});

// --- FETCH INITIAL DATA ---
async function fetchBaseData() {
  try {
    // 1. Fetch active courses
    const coursesSnap = await getDocs(query(collection(db, `schools/${activeSchoolId}/courses`), where("isActive", "==", true)));
    courseSelect.innerHTML = '<option value="" disabled selected>Select a course...</option>';
    
    coursesSnap.forEach(docSnap => {
      const data = docSnap.data();
      allCourses[docSnap.id] = data;
      const option = document.createElement('option');
      option.value = docSnap.id;
      option.text = `${data.courseCode}: ${data.courseName}`;
      courseSelect.appendChild(option);
    });

    // 2. Fetch active students
    const studentsSnap = await getDocs(query(collection(db, `schools/${activeSchoolId}/users`), where("role", "==", "student"), where("isActive", "==", true)));
    studentsSnap.forEach(docSnap => {
      allStudents[docSnap.id] = docSnap.data();
    });

  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

// --- RENDER UI WHEN COURSE IS SELECTED ---
courseSelect.addEventListener('change', () => {
  renderRosterAndDropdown(courseSelect.value);
});

async function renderRosterAndDropdown(courseId) {
  // Always fetch fresh course data to ensure we have the latest enrolled array
  const courseSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, courseId));
  const courseData = courseSnap.data();
  allCourses[courseId] = courseData; // update cache
  
  const enrolledIds = courseData.enrolledStudents || []; // If undefined, make empty array
  
  tbody.innerHTML = '';
  studentSelect.innerHTML = '<option value="" disabled selected>Select a student...</option>';
  studentSelect.disabled = false;
  enrollBtn.disabled = false;

  let enrolledCount = 0;

  // Sort students into the Table OR the Dropdown
  for (const [studentId, studentData] of Object.entries(allStudents)) {
    if (enrolledIds.includes(studentId)) {
      // Add to Roster Table
      enrolledCount++;
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${studentData.lastName}, ${studentData.firstName}</strong></td>
        <td>${studentData.email}</td>
        <td style="text-align: right;">
          <button class="btn-danger remove-btn" data-id="${studentId}">Remove</button>
        </td>
      `;
      tbody.appendChild(tr);
    } else {
      // Add to Available Dropdown
      const option = document.createElement('option');
      option.value = studentId;
      option.text = `${studentData.lastName}, ${studentData.firstName}`;
      studentSelect.appendChild(option);
    }
  }

  if (enrolledCount === 0) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; color: #64748b;">No students currently enrolled in this course.</td></tr>';
  }

  attachRemoveListeners(courseId);
}

// --- ADD STUDENT ---
enrollBtn.addEventListener('click', async () => {
  const courseId = courseSelect.value;
  const studentId = studentSelect.value;
  
  if (!courseId || !studentId) return;
  enrollBtn.innerText = "Adding...";

  try {
    const courseRef = doc(db, `schools/${activeSchoolId}/courses`, courseId);
    await updateDoc(courseRef, {
      enrolledStudents: arrayUnion(studentId)
    });
    
    // Refresh UI
    renderRosterAndDropdown(courseId);
  } catch (error) {
    console.error("Error enrolling:", error);
  } finally {
    enrollBtn.innerText = "+ Enroll";
  }
});

// --- REMOVE STUDENT ---
function attachRemoveListeners(courseId) {
  document.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const studentId = e.target.getAttribute('data-id');
      
      if(confirm("Remove this student from the course?")) {
        try {
          const courseRef = doc(db, `schools/${activeSchoolId}/courses`, courseId);
          await updateDoc(courseRef, {
            enrolledStudents: arrayRemove(studentId)
          });
          
          // Refresh UI
          renderRosterAndDropdown(courseId);
        } catch (error) {
          console.error("Error removing student:", error);
        }
      }
    });
  });
}

// --- LOAD CUSTOM BRANDING ---
async function loadSchoolBranding() {
  try {
    const schoolSnap = await getDoc(doc(db, "schools", activeSchoolId));
    if (schoolSnap.exists() && schoolSnap.data().branding?.primaryColor) {
      const color = schoolSnap.data().branding.primaryColor;
      document.documentElement.style.setProperty('--primary-color', color);
      const brandText = document.querySelector('.sidebar .brand h2');
      if (brandText) brandText.style.color = color;
    }
  } catch (error) { console.error(error); }
}

logoutBtn.addEventListener('click', () => { signOut(auth).then(() => { localStorage.removeItem('activeSchoolId'); }); });
