import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, getDoc, query, where, getDocs } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// Initialize Firebase
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
const schoolNameEl = document.getElementById('display-school-name');
const logoutBtn = document.getElementById('logout-btn');
const tbody = document.getElementById('courses-tbody');

// Modal Elements
const modal = document.getElementById('course-modal');
const openModalBtn = document.getElementById('open-create-modal-btn');
const closeBtn = document.getElementById('close-modal-btn');
const cancelBtn = document.getElementById('cancel-btn');
const form = document.getElementById('course-form');
const submitBtn = document.getElementById('submit-course-btn');
const teacherSelect = document.getElementById('course-teacher');

let activeSchoolId = localStorage.getItem('activeSchoolId');

// --- AUTHENTICATION & ROLE CHECK ---
// --- DIAGNOSTIC AUTHENTICATION & ROLE CHECK ---
onAuthStateChanged(auth, async (user) => {
  // 1. Grab the ID inside the function just to be safe
  const activeSchoolId = localStorage.getItem('activeSchoolId');

  // 2. Check if Firebase lost the user
  if (!user) {
    alert("DEBUG: Firebase says no user is logged in. Session was lost!");
    window.location.href = 'login.html';
    return;
  }

  // 3. Check if LocalStorage lost the School ID
  if (!activeSchoolId) {
    alert("DEBUG: The activeSchoolId is missing from your browser memory.");
    window.location.href = 'login.html';
    return;
  }

  // 4. Try to read the database profile
  try {
    const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
    const userProfileSnap = await getDoc(userProfileRef);

    if (userProfileSnap.exists() && userProfileSnap.data().role === 'admin') {
      loadSchoolBranding();
      
      // SUCCESS! Load the appropriate page data
      if (document.getElementById('display-school-name')) {
        document.getElementById('display-school-name').innerText = `Managing School ID: ${activeSchoolId}`;
      }
      
      // Run the specific page functions if they exist
      if (typeof loadUsers === 'function') loadUsers();
      if (typeof populateTeacherDropdown === 'function') populateTeacherDropdown();
      if (typeof loadCourses === 'function') loadCourses();

    } else {
      // They exist, but aren't an admin
      const roleFound = userProfileSnap.exists() ? userProfileSnap.data().role : "No Profile Document Found";
      alert(`DEBUG: Access Denied. Your role is listed as: ${roleFound}`);
      window.location.href = 'login.html';
    }
  } catch (error) {
    // A database rule blocked the read!
    alert(`DEBUG: Firestore Error! Check your browser's console (F12). Error: ${error.message}`);
    console.error("Diagnostic Auth Error:", error);
  }
});

// --- POPULATE INSTRUCTORS ---
// Query the users subcollection for anyone with the role 'teacher'
async function populateTeacherDropdown() {
  try {
    const q = query(
      collection(db, `schools/${activeSchoolId}/users`), 
      where("role", "==", "teacher"),
      where("isActive", "==", true)
    );
    
    const querySnapshot = await getDocs(q);
    teacherSelect.innerHTML = '<option value="" disabled selected>Select an instructor</option>';
    
    querySnapshot.forEach((doc) => {
      const teacher = doc.data();
      const option = document.createElement('option');
      // Store the UID as the value, display the name
      option.value = doc.id; 
      option.text = `${teacher.lastName}, ${teacher.firstName}`;
      teacherSelect.appendChild(option);
    });
  } catch (error) {
    console.error("Error loading teachers:", error);
    teacherSelect.innerHTML = '<option value="" disabled>Error loading teachers</option>';
  }
}

// --- LOAD COURSES (REAL-TIME) ---
function loadCourses() {
  const coursesRef = collection(db, `schools/${activeSchoolId}/courses`);
  
  onSnapshot(coursesRef, async (snapshot) => {
    tbody.innerHTML = ''; 
    
    for (const docSnap of snapshot.docs) {
      const data = docSnap.data();
      const courseId = docSnap.id;
      const isActive = data.isActive;

      // Fetch the teacher's name dynamically using the stored teacherId
      let teacherName = "Unassigned";
      if (data.teacherId) {
          try {
              const teacherDoc = await getDoc(doc(db, `schools/${activeSchoolId}/users`, data.teacherId));
              if (teacherDoc.exists()) {
                  teacherName = `${teacherDoc.data().lastName}, ${teacherDoc.data().firstName}`;
              }
          } catch(e) { console.error(e); }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${data.courseCode}</strong></td>
        <td>${data.courseName}</td>
        <td>${teacherName}</td>
        <td>${data.term}</td>
        <td><span class="status-badge status-${isActive}">${isActive ? 'Active' : 'Archived'}</span></td>
        <td>
          <button class="btn-secondary toggle-status-btn" style="width:auto;" data-id="${courseId}" data-active="${isActive}">Toggle Status</button>
          <button class="btn-danger delete-btn" data-id="${courseId}">Delete</button>
        </td>
      `;
      tbody.appendChild(tr);
    }

    attachTableListeners();
  });
}

// --- CREATE NEW COURSE ---
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitBtn.innerText = "Saving...";
  submitBtn.disabled = true;

  const code = document.getElementById('course-code').value.trim().toUpperCase();
  const name = document.getElementById('course-name').value.trim();
  const term = document.getElementById('course-term').value;
  const teacherId = teacherSelect.value;

  try {
    // Generate a random ID or use the code (using standard addDoc/auto-ID is safer to prevent code collisions)
    const newCourseRef = doc(collection(db, `schools/${activeSchoolId}/courses`));
    
    await setDoc(newCourseRef, {
      courseCode: code,
      courseName: name,
      term: term,
      teacherId: teacherId, // Storing relational data!
      isActive: true,
      createdAt: new Date()
    });

    closeModal();
    form.reset();
  } catch (error) {
    console.error("Error creating course:", error);
    alert(`Failed to create course: ${error.message}`);
  } finally {
    submitBtn.innerText = "Save Course";
    submitBtn.disabled = false;
  }
});

// --- UPDATE & DELETE ---
function attachTableListeners() {
  document.querySelectorAll('.toggle-status-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      const currentStatus = e.target.getAttribute('data-active') === 'true'; 

      try {
        await updateDoc(doc(db, `schools/${activeSchoolId}/courses`, id), { 
          isActive: !currentStatus 
        });
      } catch (error) { console.error(error); }
    });
  });

  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      if (confirm(`Delete this course? This cannot be undone and may orphan student grades.`)) {
        try {
          await deleteDoc(doc(db, `schools/${activeSchoolId}/courses`, id));
        } catch (error) { console.error(error); }
      }
    });
  });
}

// --- MODAL & LOGOUT HANDLERS ---
function openModal() { modal.classList.remove('hidden'); }
function closeModal() { modal.classList.add('hidden'); }

openModalBtn.addEventListener('click', openModal);
closeBtn.addEventListener('click', closeModal);
cancelBtn.addEventListener('click', closeModal);

logoutBtn.addEventListener('click', () => {
  signOut(auth).then(() => {
    localStorage.removeItem('activeSchoolId');
  });
});

// --- LOAD CUSTOM BRANDING ---
async function loadSchoolBranding() {
  try {
    // Note: ensure 'doc' and 'getDoc' are imported from firestore at the top of your file!
    const schoolRef = doc(db, "schools", activeSchoolId);
    const schoolSnap = await getDoc(schoolRef);
    
    if (schoolSnap.exists() && schoolSnap.data().branding) {
      const branding = schoolSnap.data().branding;
      
      if (branding.primaryColor) {
        // 1. Override the CSS variables globally on the page
        document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
        
        // 2. Directly target the sidebar text as a fallback
        const brandText = document.querySelector('.sidebar .brand h2');
        if (brandText) brandText.style.color = branding.primaryColor;
      }
    }
  } catch (error) {
    console.error("Error loading branding:", error);
  }
}
