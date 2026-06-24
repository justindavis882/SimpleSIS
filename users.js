import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, collection, doc, setDoc, deleteDoc, onSnapshot, updateDoc, getDoc, getDocs, query, where } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { hideGlobalLoader, showToast } from "./utils.js";

import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Secondary App to prevent Admin logout on creation
const secondaryApp = initializeApp(firebaseConfig, "SecondaryApp");
const secondaryAuth = getAuth(secondaryApp);

const tbody = document.getElementById('users-tbody');
let activeSchoolId = localStorage.getItem('activeSchoolId');
let cachedStudents = []; 

// --- AUTHENTICATION & ROLE CHECK ---
onAuthStateChanged(auth, async (user) => {
  if (!user || !activeSchoolId) {
    window.location.href = 'login.html';
    return;
  }

  try {
    const userProfileRef = doc(db, `schools/${activeSchoolId}/users`, user.uid);
    const userProfileSnap = await getDoc(userProfileRef);

    if (userProfileSnap.exists() && userProfileSnap.data().role === 'admin') {
      if (document.getElementById('display-school-name')) {
        document.getElementById('display-school-name').innerText = `Managing School ID: ${activeSchoolId}`;
        loadSchoolBranding();
        hideGlobalLoader();
      }
      loadUsers();
    } else {
      window.location.href = 'login.html';
    }
  } catch (error) {
    console.error("Auth Error:", error);
  }
});

// --- LOAD USERS (REAL-TIME) ---
function loadUsers() {
  const usersRef = collection(db, `schools/${activeSchoolId}/users`);
  
  onSnapshot(usersRef, (snapshot) => {
    tbody.innerHTML = ''; 
    
    snapshot.forEach((docSnap) => {
      const data = docSnap.data();
      const uid = docSnap.id;
      const isActive = data.isActive;

      let actionButtons = `
        <button class="btn-secondary edit-user-btn" style="width:auto; margin-right: 8px;" data-uid="${uid}">Edit</button>
        <button class="btn-secondary toggle-status-btn" style="width:auto;" data-uid="${uid}" data-active="${isActive}">Toggle Status</button>
        <button class="btn-danger delete-btn" style="margin-left: 8px;" data-uid="${uid}">Delete</button>
      `;

      let roleDisplay = `<span style="text-transform: capitalize;">${data.role}</span>`;
      if (data.role === 'parent') {
        const linkText = data.linkedStudentId ? 'Change Student' : 'Link Student';
        const linkColor = data.linkedStudentId ? '#0f9d58' : 'var(--primary-color)';
        
        actionButtons = `<button class="btn-primary link-student-btn" style="width:auto; margin-right: 8px; background: ${linkColor}; border-color: ${linkColor};" data-uid="${uid}">🔗 ${linkText}</button>` + actionButtons;
        
        if (data.linkedStudentId) {
            roleDisplay += `<br><span style="font-size: 11px; color: #64748b;">Linked to ID: ...${data.linkedStudentId.slice(-4)}</span>`;
        }
      }

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><strong>${data.lastName || ''}, ${data.firstName || ''}</strong></td>
        <td>${data.email}</td>
        <td>${roleDisplay}</td>
        <td><span class="status-badge status-${isActive}">${isActive ? 'Active' : 'Suspended'}</span></td>
        <td>${actionButtons}</td>
      `;
      tbody.appendChild(tr);
    });

    attachTableListeners();
  });
}

// --- CREATE NEW USER ---
const createModal = document.getElementById('user-modal');
const createForm = document.getElementById('user-form');
const createBtn = document.getElementById('submit-user-btn');

document.getElementById('open-create-modal-btn').addEventListener('click', () => createModal.classList.remove('hidden'));
document.getElementById('close-modal-btn').addEventListener('click', () => createModal.classList.add('hidden'));
document.getElementById('cancel-btn').addEventListener('click', () => createModal.classList.add('hidden'));

createForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  createBtn.innerText = "Creating...";
  createBtn.disabled = true;

  const email = document.getElementById('new-email').value.trim();
  const password = document.getElementById('new-password').value;
  const role = document.getElementById('new-role').value;
  const emergencyInfo = document.getElementById('new-emergency-info').value.trim();

  try {
    const userCredential = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const newUid = userCredential.user.uid;
    await signOut(secondaryAuth);

    const payload = {
      firstName: document.getElementById('new-first-name').value.trim(),
      lastName: document.getElementById('new-last-name').value.trim(),
      email: email,
      role: role,
      isActive: true,
      createdAt: new Date()
    };

    if (role === 'student' && emergencyInfo) payload.emergencyContact = emergencyInfo;

    await setDoc(doc(db, `schools/${activeSchoolId}/users`, newUid), payload);
    createModal.classList.add('hidden');
    createForm.reset();
  } catch (error) {
    alert(`Failed to create user: ${error.message}`);
  } finally {
    createBtn.innerText = "Create User";
    createBtn.disabled = false;
  }
});

// --- EDIT USER & PASSWORD RESET ---
const editModal = document.getElementById('edit-user-modal');
const editForm = document.getElementById('edit-user-form');
const submitEditBtn = document.getElementById('submit-edit-btn');

document.getElementById('close-edit-modal-btn').addEventListener('click', () => editModal.classList.add('hidden'));

editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitEditBtn.innerText = "Saving...";
  submitEditBtn.disabled = true;

  const uid = document.getElementById('edit-uid').value;
  const role = document.getElementById('edit-role').value;
  
  const payload = {
    firstName: document.getElementById('edit-first-name').value.trim(),
    lastName: document.getElementById('edit-last-name').value.trim(),
    role: role
  };

  if (role === 'student') payload.emergencyContact = document.getElementById('edit-emergency-info').value.trim();

  try {
    await updateDoc(doc(db, `schools/${activeSchoolId}/users`, uid), payload);
    editModal.classList.add('hidden');
  } catch (error) {
    alert("Failed to update user profile.");
  } finally {
    submitEditBtn.innerText = "Save Changes";
    submitEditBtn.disabled = false;
  }
});

document.getElementById('send-reset-btn').addEventListener('click', async () => {
  const email = document.getElementById('edit-email').value;
  if (confirm(`Send a password reset email to ${email}?`)) {
    try {
      await sendPasswordResetEmail(auth, email);
      alert("Password reset email dispatched successfully!");
    } catch (error) {
      alert("Failed to send email. " + error.message);
    }
  }
});

// --- STUDENT LINKAGE SYSTEM ---
const linkModal = document.getElementById('link-student-modal');
const linkForm = document.getElementById('link-student-form');
const linkStudentSelect = document.getElementById('link-student-select');
const submitLinkBtn = document.getElementById('submit-link-btn');

document.getElementById('close-link-modal-btn').addEventListener('click', () => linkModal.classList.add('hidden'));

async function loadStudentsForDropdown() {
  if (cachedStudents.length === 0) {
    const q = query(collection(db, `schools/${activeSchoolId}/users`), where("role", "==", "student"));
    const snaps = await getDocs(q);
    snaps.forEach(docSnap => cachedStudents.push({ id: docSnap.id, ...docSnap.data() }));
  }
  linkStudentSelect.innerHTML = '<option value="" disabled selected>Choose a student...</option>';
  cachedStudents.forEach(student => {
    linkStudentSelect.innerHTML += `<option value="${student.id}">${student.lastName}, ${student.firstName}</option>`;
  });
}

linkForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  submitLinkBtn.innerText = "Saving...";
  submitLinkBtn.disabled = true;

  try {
    await updateDoc(doc(db, `schools/${activeSchoolId}/users`, document.getElementById('link-parent-uid').value), { 
      linkedStudentId: linkStudentSelect.value 
    });
    linkModal.classList.add('hidden');
    linkForm.reset();
  } catch (error) {
    alert("Failed to link student.");
  } finally {
    submitLinkBtn.innerText = "Save Linkage";
    submitLinkBtn.disabled = false;
  }
});

// --- TABLE ACTION LISTENERS ---
function attachTableListeners() {
  // Status Toggle
  document.querySelectorAll('.toggle-status-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const uid = e.target.getAttribute('data-uid');
      const currentStatus = e.target.getAttribute('data-active') === 'true'; 
      await updateDoc(doc(db, `schools/${activeSchoolId}/users`, uid), { isActive: !currentStatus });
    });
  });

  // Delete User
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      if (confirm(`Remove this user from the school?`)) {
        await deleteDoc(doc(db, `schools/${activeSchoolId}/users`, e.target.getAttribute('data-uid')));
      }
    });
  });

  // Open Edit Modal
  document.querySelectorAll('.edit-user-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const uid = e.target.getAttribute('data-uid');
      const userDoc = await getDoc(doc(db, `schools/${activeSchoolId}/users`, uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        document.getElementById('edit-uid').value = uid;
        document.getElementById('edit-first-name').value = data.firstName || '';
        document.getElementById('edit-last-name').value = data.lastName || '';
        document.getElementById('edit-email').value = data.email || '';
        document.getElementById('edit-role').value = data.role || 'student';
        
        const emergencyGroup = document.getElementById('edit-emergency-group');
        if (data.role === 'student') {
          emergencyGroup.style.display = 'block';
          document.getElementById('edit-emergency-info').value = data.emergencyContact || '';
        } else {
          emergencyGroup.style.display = 'none';
        }
        editModal.classList.remove('hidden');
      }
    });
  });

  // Open Link Modal
  document.querySelectorAll('.link-student-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      document.getElementById('link-parent-uid').value = e.target.getAttribute('data-uid');
      linkModal.classList.remove('hidden');
      await loadStudentsForDropdown();
    });
  });
}

// --- GLOBALS ---
document.getElementById('logout-btn').addEventListener('click', () => {
  signOut(auth).then(() => localStorage.removeItem('activeSchoolId'));
});

async function loadSchoolBranding() {
  try {
    const schoolSnap = await getDoc(doc(db, "schools", activeSchoolId));
    if (schoolSnap.exists() && schoolSnap.data().branding) {
      const branding = schoolSnap.data().branding;
      if (branding.primaryColor) {
        document.documentElement.style.setProperty('--primary-color', branding.primaryColor);
        const brandText = document.querySelector('.sidebar .brand h2');
        if (brandText) brandText.style.color = branding.primaryColor;
      }
      const logoEl = document.getElementById('sidebar-logo');
      if (logoEl && branding.logoUrl) {
        logoEl.src = branding.logoUrl;
        logoEl.classList.remove('hidden');
      }
    }
  } catch (error) { console.error(error); }
}
