import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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
const assignmentNameInput = document.getElementById('assignment-name');
const maxScoreInput = document.getElementById('max-score');
const tbody = document.getElementById('roster-tbody');
const submitBtn = document.getElementById('submit-grades-btn');
const logoutBtn = document.getElementById('logout-btn');

let activeSchoolId = localStorage.getItem('activeSchoolId');
let currentTeacherId = null;

// Read course ID from URL
const urlParams = new URLSearchParams(window.location.search);
const activeCourseId = urlParams.get('course');

// --- AUTHENTICATION & GATEKEEPER ---
onAuthStateChanged(auth, async (user) => {
  if (!activeCourseId) {
    alert("Please select a course from your dashboard to enter grades.");
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
        loadStudentRoster();
      } else {
        alert("Security Violation: Teacher access required.");
        window.location.href = 'login.html';
      }
    } catch (error) {
      window.location.href = 'login.html';
    }
  } else {
    window.location.href = 'login.html';
  }
});

// --- LOAD COURSE & ROSTER ---
async function loadCourseDetails() {
  try {
    const courseSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, activeCourseId));
    if (courseSnap.exists()) {
      courseTitleEl.innerText = `${courseSnap.data().courseCode}: ${courseSnap.data().courseName}`;
    }
  } catch (error) { console.error("Error loading course:", error); }
}

async function loadStudentRoster() {
  try {
    const courseSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, activeCourseId));
    const enrolledIds = courseSnap.data().enrolledStudents || []; 

    tbody.innerHTML = ''; 

    if (enrolledIds.length === 0) {
      tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color: #64748b;">No students are enrolled in this course yet.</td></tr>';
      return;
    }

    // Fetch and build rows for enrolled students
    for (const studentId of enrolledIds) {
      const studentSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, studentId));
      
      if (studentSnap.exists()) {
        const student = studentSnap.data();
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
          <td><strong>${student.lastName}, ${student.firstName}</strong></td>
          <td style="text-align: right;">
            <input type="number" class="grade-input" data-student-id="${studentId}" min="0" placeholder="--">
          </td>
        `;
        tbody.appendChild(tr);
      }
    }
    
    // Enable submit only after roster loads
    submitBtn.disabled = false; 

  } catch (error) {
    console.error("Error loading roster:", error);
    tbody.innerHTML = '<tr><td colspan="2" style="text-align:center; color:red;">Failed to load roster.</td></tr>';
  }
}

// --- SUBMIT GRADES ---
submitBtn.addEventListener('click', async () => {
  const assignmentName = assignmentNameInput.value.trim();
  const maxScore = parseInt(maxScoreInput.value);

  if (!assignmentName) {
    alert("Please enter an Assignment Name.");
    return;
  }

  submitBtn.innerText = "Saving Grades...";
  submitBtn.disabled = true;

  try {
    const gradeInputs = document.querySelectorAll('.grade-input');
    let gradesSaved = 0;

    for (let input of gradeInputs) {
      const score = input.value;
      const studentId = input.getAttribute('data-student-id');

      // Only save if the teacher actually typed a number
      if (score !== "") {
        await addDoc(collection(db, `schools/${activeSchoolId}/grades`), {
          studentId: studentId,
          courseId: activeCourseId,
          teacherId: currentTeacherId,
          assignmentName: assignmentName,
          score: parseFloat(score),
          maxScore: maxScore,
          date: new Date().toISOString().split('T')[0],
          timestamp: serverTimestamp()
        });
        gradesSaved++;
      }
    }

    alert(`Successfully saved ${gradesSaved} grades!`);
    window.location.href = 'teacher-portal.html';

  } catch (error) {
    console.error("Error submitting grades:", error);
    alert("Failed to save grades. Check console.");
    submitBtn.innerText = "Submit Grades";
    submitBtn.disabled = false;
  }
});

// --- LOAD BRANDING ---
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
