import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, query, where, onSnapshot } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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
const welcomeMsgEl = document.getElementById('welcome-message');
const schoolNameEl = document.getElementById('display-school-name');
const teacherEmailEl = document.getElementById('display-teacher-email');
const avatarEl = document.getElementById('teacher-avatar');
const coursesContainer = document.getElementById('teacher-courses-container');
const logoutBtn = document.getElementById('logout-btn');

let activeSchoolId = localStorage.getItem('activeSchoolId');

// --- AUTHENTICATION & ROLE CHECK ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'teacher') {
        const userData = userProfileSnap.data();
        
        // Populate Header
        welcomeMsgEl.innerText = `Welcome, ${userData.firstName} ${userData.lastName}`;
        teacherEmailEl.innerText = userData.email;
        avatarEl.innerText = userData.firstName.charAt(0); // First initial
        schoolNameEl.innerText = `Connected to School ID: ${activeSchoolId}`;
        
        loadSchoolBranding();
        loadMyCourses(user.uid);
      } else {
        alert("Security Violation: Teacher access required.");
        window.location.href = 'login.html';
      }
    } catch (error) {
      console.error("Auth error:", error);
      window.location.href = 'login.html';
    }
  } else {
    window.location.href = 'login.html';
  }
});

// --- LOAD TEACHER'S COURSES ---
function loadMyCourses(teacherUid) {
  // Query: Only get courses belonging to this school, taught by this teacher, that are active.
  const q = query(
    collection(db, `schools/${activeSchoolId}/courses`),
    where("teacherId", "==", teacherUid),
    where("isActive", "==", true)
  );

  onSnapshot(q, (snapshot) => {
    coursesContainer.innerHTML = ''; // Clear loading text

    if (snapshot.empty) {
      coursesContainer.innerHTML = '<p style="color: #64748b;">You have not been assigned any active courses yet.</p>';
      return;
    }

    snapshot.forEach((docSnap) => {
      const course = docSnap.data();
      const courseId = docSnap.id;

      const card = document.createElement('div');
      card.className = 'course-card';
      
      // We add a button row at the bottom of the card
      card.innerHTML = `
        <span class="course-code">${course.courseCode}</span>
        <h3 class="course-name">${course.courseName}</h3>
        <p class="course-term">${course.term}</p>
        <div style="margin-top: 20px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button class="btn-primary" style="flex: 1;" onclick="window.location.href='take-attendance.html?course=${courseId}'">Attendance</button>
          <button class="btn-secondary" style="flex: 1;" onclick="window.location.href='gradebook.html?course=${courseId}'">Gradebook</button>
        </div>
      `;
      
      coursesContainer.appendChild(card);
      coursesContainer.appendChild(card);
    });
  }, (error) => {
    console.error("Error fetching courses:", error);
    coursesContainer.innerHTML = '<p style="color: red;">Failed to load courses. Please check your connection.</p>';
  });
}

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
    }
  } catch (error) {
    console.error("Error loading branding:", error);
  }
}

// --- LOGOUT ---
logoutBtn.addEventListener('click', () => {
  signOut(auth).then(() => {
    localStorage.removeItem('activeSchoolId');
  });
});
