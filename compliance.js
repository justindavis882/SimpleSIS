import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, getDocs, collection, query, where, updateDoc, orderBy } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { hideGlobalLoader } from "./utils.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DOM Elements
const studentSelect = document.getElementById('req-student-select');
const reqPeh = document.getElementById('req-peh');
const reqLan = document.getElementById('req-lan');
const saveReqBtn = document.getElementById('save-req-btn');
const approvalsTbody = document.getElementById('approvals-tbody');

let activeSchoolId = localStorage.getItem('activeSchoolId');
let studentsCache = {};

// --- AUTH & LOAD ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const profileSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, user.uid));
      const role = profileSnap.data().role;
      if (role === 'admin' || role === 'teacher') {
        await loadStudents();
        loadPendingApprovals();
        hideGlobalLoader();
      } else { window.location.href = 'login.html'; }
    } catch (e) { window.location.href = 'login.html'; }
  } else { window.location.href = 'login.html'; }
});

// --- SET STUDENT REQUIREMENTS ---
async function loadStudents() {
  const q = query(collection(db, `schools/${activeSchoolId}/users`), where("role", "==", "student"));
  const snaps = await getDocs(q);
  
  studentSelect.innerHTML = '<option value="" disabled selected>Choose a student...</option>';
  snaps.forEach(d => {
    studentsCache[d.id] = d.data();
    studentSelect.innerHTML += `<option value="${d.id}">${d.data().lastName}, ${d.data().firstName}</option>`;
  });
}

studentSelect.addEventListener('change', () => {
  const student = studentsCache[studentSelect.value];
  const reqs = student.complianceRequirements || {};
  
  reqPeh.value = reqs.PEH101 !== undefined ? reqs.PEH101 : 0;
  reqLan.value = reqs.LAN101 !== undefined ? reqs.LAN101 : 0;
  
  reqPeh.disabled = false;
  reqLan.disabled = false;
  saveReqBtn.disabled = false;
});

saveReqBtn.addEventListener('click', async () => {
  saveReqBtn.innerText = "Saving...";
  try {
    await updateDoc(doc(db, `schools/${activeSchoolId}/users`, studentSelect.value), {
      "complianceRequirements.PEH101": parseFloat(reqPeh.value),
      "complianceRequirements.LAN101": parseFloat(reqLan.value)
    });
    // Update local cache
    studentsCache[studentSelect.value].complianceRequirements = { PEH101: parseFloat(reqPeh.value), LAN101: parseFloat(reqLan.value) };
    saveReqBtn.innerText = "✓ Saved";
    setTimeout(() => saveReqBtn.innerText = "Save Requirements", 2000);
  } catch (e) { alert("Failed to save."); }
});

// --- PENDING APPROVALS QUEUE ---
async function loadPendingApprovals() {
  const q = query(collection(db, `schools/${activeSchoolId}/compliance_hours`), where("status", "==", "pending"), orderBy("timestamp", "asc"));
  const snaps = await getDocs(q);
  
  approvalsTbody.innerHTML = '';
  
  if (snaps.empty) {
    approvalsTbody.innerHTML = '<tr><td colspan="2" style="padding: 24px; text-align: center; color: #0f9d58;">You are all caught up! No pending logs.</td></tr>';
    return;
  }

  for (const docSnap of snaps.docs) {
    const data = docSnap.data();
    const studentName = studentsCache[data.studentId] ? `${studentsCache[data.studentId].firstName} ${studentsCache[data.studentId].lastName}` : "Unknown Student";

    approvalsTbody.innerHTML += `
      <tr>
        <td style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0;">
          <strong style="color: #0f172a; font-size: 15px;">${studentName}</strong> <span style="color: var(--primary-color); font-size: 13px; font-weight: bold; margin-left: 8px;">${data.courseCode} &bull; ${data.hoursLog} hrs</span>
          <p style="color: #475569; font-size: 13px; margin-top: 6px; background: #f1f5f9; padding: 8px; border-radius: 4px; border-left: 3px solid #cbd5e1;">"${data.taskDescription}"</p>
          <span style="font-size: 11px; color: #94a3b8; display: block; margin-top: 6px;">Logged on: ${data.dateCompleted}</span>
        </td>
        <td style="padding: 16px 24px; border-bottom: 1px solid #e2e8f0; text-align: right; vertical-align: middle;">
          <button class="btn-primary action-btn" data-id="${docSnap.id}" data-action="approved" style="background: #0f9d58; padding: 6px 12px; width: auto;">Approve</button>
          <button class="btn-secondary action-btn" data-id="${docSnap.id}" data-action="rejected" style="color: #d93025; border-color: #d93025; padding: 6px 12px; width: auto; margin-left: 8px;">Reject</button>
        </td>
      </tr>
    `;
  }

  // Attach Listeners
  document.querySelectorAll('.action-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = e.target.getAttribute('data-id');
      const action = e.target.getAttribute('data-action');
      
      try {
        await updateDoc(doc(db, `schools/${activeSchoolId}/compliance_hours`, id), { status: action });
        loadPendingApprovals(); // Refresh queue
      } catch (err) { alert("Failed to process action."); }
    });
  });
}

document.getElementById('logout-btn').addEventListener('click', () => { signOut(auth).then(() => { localStorage.removeItem('activeSchoolId'); }); });