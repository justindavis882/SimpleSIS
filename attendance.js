import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, getDocs, query, where, orderBy } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

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
const dateInput = document.getElementById('attendance-date');
const refreshBtn = document.getElementById('refresh-btn');
const tbody = document.getElementById('attendance-tbody');

// Stat Tiles
const countPresent = document.getElementById('count-present');
const countAbsent = document.getElementById('count-absent');
const countTardy = document.getElementById('count-tardy');

let activeSchoolId = localStorage.getItem('activeSchoolId');

// Data Caches (To save database reads and speed up rendering)
let usersCache = {};
let coursesCache = {};

// --- AUTHENTICATION CHECK ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
      const userProfileSnap = await getDoc(userProfileRef);

      if (userProfileSnap.exists() && userProfileSnap.data().role === 'admin') {
        schoolNameEl.innerText = `Managing School ID: ${activeSchoolId}`;
        
        // Set today's date as default and build the caches
        const today = new Date().toISOString().split('T')[0];
        dateInput.value = today;
        
        await buildCaches();
        fetchAttendance(today);
      } else {
        alert("Security Violation: Admins only.");
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

// --- BUILD DATA CACHES ---
// We pull all users and courses once so we don't have to query the database 
// for every single row of the attendance table.
async function buildCaches() {
  try {
    const usersSnap = await getDocs(collection(db, `schools/${activeSchoolId}/users`));
    usersSnap.forEach(doc => {
      usersCache[doc.id] = `${doc.data().lastName}, ${doc.data().firstName}`;
    });

    const coursesSnap = await getDocs(collection(db, `schools/${activeSchoolId}/courses`));
    coursesSnap.forEach(doc => {
      coursesCache[doc.id] = doc.data().courseCode;
    });
  } catch (error) {
    console.error("Error building caches:", error);
  }
}

// --- FETCH ATTENDANCE BY DATE ---
async function fetchAttendance(selectedDate) {
  tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading data...</td></tr>';
  
  let pCount = 0; let aCount = 0; let tCount = 0;

  try {
    const q = query(
      collection(db, `schools/${activeSchoolId}/attendance`),
      where("dateString", "==", selectedDate)
    );
    
    const querySnapshot = await getDocs(q);
    
    if (querySnapshot.empty) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#64748b;">No attendance records found for this date.</td></tr>';
      updateTiles(0, 0, 0);
      return;
    }

    tbody.innerHTML = ''; // Clear table

    querySnapshot.forEach((docSnap) => {
      const data = docSnap.data();
      
      // Update Counters
      if (data.status === 'present') pCount++;
      if (data.status === 'absent') aCount++;
      if (data.status === 'tardy') tCount++;

      // Map IDs to Names using our cache
      const studentName = usersCache[data.studentId] || "Unknown Student";
      const courseName = coursesCache[data.courseId] || "Unknown Course";
      const teacherName = usersCache[data.teacherId] || "Unknown";

      // Format Timestamp
      const timeString = data.timestamp ? data.timestamp.toDate().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : '--';

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${studentName}</strong></td>
        <td>${courseName}</td>
        <td><span class="status-badge status-${data.status}">${data.status}</span></td>
        <td>${teacherName}</td>
        <td style="color: #64748b;">${timeString}</td>
      `;
      tbody.appendChild(tr);
    });

    updateTiles(pCount, aCount, tCount);

  } catch (error) {
    console.error("Error fetching attendance:", error);
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:red;">Error loading data. Check console.</td></tr>';
  }
}

function updateTiles(p, a, t) {
  countPresent.innerText = p;
  countAbsent.innerText = a;
  countTardy.innerText = t;
}

// --- EVENT LISTENERS ---
dateInput.addEventListener('change', (e) => {
  fetchAttendance(e.target.value);
});

refreshBtn.addEventListener('click', () => {
  fetchAttendance(dateInput.value);
});

logoutBtn.addEventListener('click', () => {
  signOut(auth).then(() => {
    localStorage.removeItem('activeSchoolId');
  });
});
