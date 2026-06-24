import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, getDoc, collection, addDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";
import { hideGlobalLoader } from "./utils.js";
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let activeSchoolId = localStorage.getItem('activeSchoolId');

// --- ADDED: AUTHENTICATION & GATEKEEPER ---
onAuthStateChanged(auth, async (user) => {
  if (user && activeSchoolId) {
    try {
      const profileSnap = await getDoc(doc(db, `schools/${activeSchoolId}/users`, user.uid));
      if (profileSnap.exists() && (profileSnap.data().role === 'admin' || profileSnap.data().role === 'teacher')) {
        hideGlobalLoader(); // Reveal the UI!
      } else {
        window.location.href = 'login.html';
      }
    } catch (e) {
      window.location.href = 'login.html';
    }
  } else {
    window.location.href = 'login.html';
  }
});

// Logout Listener
document.getElementById('logout-btn').addEventListener('click', () => {
  signOut(auth).then(() => { localStorage.removeItem('activeSchoolId'); window.location.href = 'login.html'; });
});

// Hardcoded for testing. You will want to pull this dynamically from your Courses dropdown later.
const targetCourseId = "TEST_COURSE_ID"; 
const targetModuleId = "TEST_MODULE_ID"; 

// DOM Elements
const typeSelect = document.getElementById('item-type');
const form = document.getElementById('lms-form');

const fieldRichText = document.getElementById('field-rich-text');
const fieldQuiz = document.getElementById('field-quiz');
const fieldPromptOnly = document.getElementById('field-prompt-only');

// Handle UI Swapping
typeSelect.addEventListener('change', (e) => {
  fieldRichText.classList.remove('active');
  fieldQuiz.classList.remove('active');
  fieldPromptOnly.classList.remove('active');

  const type = e.target.value;
  if (type === 'rich_text') fieldRichText.classList.add('active');
  else if (type === 'single_select' || type === 'multi_select') fieldQuiz.classList.add('active');
  else if (type === 'text_response' || type === 'link_submission') fieldPromptOnly.classList.add('active');
});

// Save to Firestore
form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const submitBtn = document.getElementById('save-item-btn');
  submitBtn.innerText = "Saving...";
  submitBtn.disabled = true;

  const type = typeSelect.value;
  
  let payload = {
    title: document.getElementById('item-title').value.trim(),
    type: type,
    maxPoints: parseFloat(document.getElementById('item-points').value) || 0,
    timestamp: serverTimestamp()
  };

  if (type === 'rich_text') {
    payload.content = document.getElementById('content-rich-text').value;
  } else if (type === 'single_select' || type === 'multi_select') {
    payload.prompt = document.getElementById('content-quiz-prompt').value.trim();
    payload.options = document.getElementById('content-quiz-options').value.split(',').map(s => s.trim());
    payload.correctAnswers = document.getElementById('content-quiz-correct').value.split(',').map(s => s.trim());
  } else if (type === 'text_response' || type === 'link_submission') {
    payload.prompt = document.getElementById('content-prompt').value.trim();
  }

  try {
    const itemsRef = collection(db, `schools/${activeSchoolId}/courses/${targetCourseId}/modules/${targetModuleId}/items`);
    await addDoc(itemsRef, payload);
    alert("Item saved successfully!");
    form.reset();
    typeSelect.dispatchEvent(new Event('change'));
  } catch (error) {
    console.error("Error saving LMS item:", error);
    alert("Failed to save.");
  } finally {
    submitBtn.innerText = "Save LMS Item";
    submitBtn.disabled = false;
  }
});
