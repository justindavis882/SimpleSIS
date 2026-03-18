import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, getDocs, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { hideGlobalLoader, showToast } from "./ultils.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const courseTitleEl = document.getElementById('course-title-display');
const dateDisplayEl = document.getElementById('attendance-date-display');
const tbody = document.getElementById('roster-tbody');
const submitBtn = document.getElementById('submit-attendance-btn');
const logoutBtn = document.getElementById('logout-btn');

let activeSchoolId = localStorage.getItem('activeSchoolId');
let currentTeacherId = null;

// Read the course ID from the URL (e.g., ?course=XYZ123)
const urlParams = new URLSearchParams(window.location.search);
const activeCourseId = urlParams.get('course');

// Set today's date for the UI and Database
const today = new Date();
const dateString = today.toISOString().split('T')[0]; // YYYY-MM-DD format
dateDisplayEl.innerText = today.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

// --- AUTHENTICATION & INITIALIZATION ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId && activeCourseId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'teacher') {
        currentTeacherId = user.uid;
        loadSchoolBranding();
        loadCourseDetails();
        loadStudentRoster();
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

// --- LOAD COURSE DETAILS ---
async function loadCourseDetails() {
  try {
    const courseSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, activeCourseId));
    if (courseSnap.exists()) {
      courseTitleEl.innerText = `${courseSnap.data().courseCode}: ${courseSnap.data().courseName}`;
    } else {
      courseTitleEl.innerText = "Course Not Found";
    }
  } catch (error) {
    console.error("Error loading course:", error);
  }
}

// --- LOAD ROSTER ---
async function loadStudentRoster() {
  try {
    // 1. Fetch the course document to get the enrolled array
    const courseSnap = await getDoc(doc(db, `schools/${activeSchoolId}/courses`, activeCourseId));
    const courseData = courseSnap.data();
    const enrolledIds = courseData.enrolledStudents || []; // Default to empty if missing

    tbody.innerHTML = ''; 

    // 2. If the array is empty, show a message
    if (enrolledIds.length === 0) {
      tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color: #64748b;">No students are enrolled in this course yet. Check with an Admin.</td></tr>';
      submitBtn.disabled = true;
      return;
    }

    // 3. Fetch ONLY the students whose IDs are in that array
    for (const studentId of enrolledIds) {
      const studentSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, studentId));
      
      if (studentSnap.exists()) {
        const student = studentSnap.data();
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
          <td><strong>${student.lastName}, ${student.firstName}</strong></td>
          <td>${student.email}</td>
          <td style="text-align: right; display: flex; gap: 16px; justify-content: flex-end;">
            <label><input type="radio" name="attend_${studentId}" value="present" checked> Present</label>
            <label><input type="radio" name="attend_${studentId}" value="absent"> Absent</label>
            <label><input type="radio" name="attend_${studentId}" value="tardy"> Tardy</label>
          </td>
        `;
        tbody.appendChild(tr);
      }
    }
    submitBtn.disabled = false; // Enable submit if we found students

  } catch (error) {
    console.error("Error loading roster:", error);
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center; color:red;">Failed to load roster.</td></tr>';
  }
}

// --- SUBMIT ATTENDANCE ---
submitBtn.addEventListener('click', async () => {
  submitBtn.innerText = "Submitting...";
  submitBtn.disabled = true;

  try {
    // 1. Get all the rows in the table
    const rows = tbody.querySelectorAll('tr');
    
    // 2. Loop through each row to see which radio button is checked
    for (let row of rows) {
      const radioInputs = row.querySelectorAll('input[type="radio"]');
      if (radioInputs.length === 0) continue; // Skip empty/loading rows

      // Extract the student ID from the radio button's "name" attribute (attend_12345)
      const studentId = radioInputs[0].name.split('_')[1];
      
      // Find which specific radio was checked
      let status = "present";
      radioInputs.forEach(radio => {
        if (radio.checked) status = radio.value;
      });

      // 3. Write the record to the database
      await addDoc(collection(db, `schools/${activeSchoolId}/attendance`), {
        studentId: studentId,
        courseId: activeCourseId,
        teacherId: currentTeacherId,
        status: status,
        dateString: dateString,
        timestamp: serverTimestamp() // Firebase server time for accurate logging
      });
    }

    // Success!
    alert("Attendance submitted successfully!");
    window.location.href = 'teacher-portal.html';

  } catch (error) {
    console.error("Error submitting attendance:", error);
    alert("Failed to submit attendance. Check console.");
    submitBtn.innerText = "Submit Attendance";
    submitBtn.disabled = false;
  }
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

logoutBtn.addEventListener('click', () => {
  signOut(auth).then(() => { localStorage.removeItem('activeSchoolId'); });
});
