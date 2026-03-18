// 1. Import Firebase Modules (Using the CDN for vanilla HTML/JS)
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-app.js";
import { getAuth, createUserWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.10.0/firebase-firestore.js";

// 2. Initialize Firebase (Replace with your actual config object)
import { firebaseConfig } from "./config.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// 3. DOM Elements & State
const step1Form = document.getElementById('step1-form');
const step2Form = document.getElementById('step2-form');
const stepDescription = document.getElementById('step-description');
const spinner = document.getElementById('loading-spinner');

const setupState = {
  schoolId: '',
  adminEmail: '',
  adminPassword: ''
};

// Handle Step 1: Verification
step1Form.addEventListener('submit', async (e) => {
  e.preventDefault();
  spinner.classList.remove('hidden');
  
  setupState.schoolId = document.getElementById('school-id').value.trim();
  setupState.adminEmail = document.getElementById('admin-email').value.trim();
  setupState.adminPassword = document.getElementById('admin-password').value;

  try {
    // Check if the School ID exists in our manual records
    const schoolRef = doc(db, "schools", setupState.schoolId);
    const schoolSnap = await getDoc(schoolRef);

    if (schoolSnap.exists() && schoolSnap.data().systemStatus === "pending") {
      // Transition to Step 2
      step1Form.classList.add('hidden');
      step2Form.classList.remove('hidden');
      stepDescription.innerText = "School ID Verified. Set up your school's profile.";
    } else {
      alert("Invalid School ID or this school has already been set up.");
    }
  } catch (error) {
    console.error("Error verifying ID:", error);
    alert("Database connection error. Check console.");
  } finally {
    spinner.classList.add('hidden');
  }
});

// Handle Step 2: Finalizing Setup
step2Form.addEventListener('submit', async (e) => {
  e.preventDefault();
  spinner.classList.remove('hidden');
  
  const schoolName = document.getElementById('school-name').value.trim();
  const currentTerm = document.getElementById('current-term').value;

  try {
    // 1. Create the Admin User in Firebase Authentication
    const userCredential = await createUserWithEmailAndPassword(auth, setupState.adminEmail, setupState.adminPassword);
    const adminUid = userCredential.user.uid;

    // 2. Update the Root School Document
    const schoolRef = doc(db, "schools", setupState.schoolId);
    await setDoc(schoolRef, {
      name: schoolName,
      systemStatus: "active",
      adminContact: setupState.adminEmail,
      termSettings: {
        currentTerm: currentTerm,
        gradingPeriods: ["Q1", "Q2", "Q3", "Q4"]
      },
      updatedAt: new Date()
    }, { merge: true }); // Merge keeps any manual data you already placed there

    // 3. Create the Admin's User Profile in the Subcollection
    const adminProfileRef = doc(db, `schools/${setupState.schoolId}/users`, adminUid);
    await setDoc(adminProfileRef, {
      firstName: "System",
      lastName: "Admin",
      email: setupState.adminEmail,
      role: "admin",
      isActive: true,
      createdAt: new Date()
    });

    step2Form.classList.add('hidden');
    stepDescription.innerText = "Setup Complete! Redirecting to dashboard...";
    
    // Redirect to the main app dashboard
    setTimeout(() => {
        localStorage.setItem('activeSchoolId', setupState.schoolId);
        window.location.href = 'dashboard.html';
    }, 1500);

  } catch (error) {
    console.error("Setup failed:", error);
    alert(`Setup failed: ${error.message}`);
  } finally {
    spinner.classList.add('hidden');
  }
});
