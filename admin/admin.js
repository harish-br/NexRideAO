import { auth, firestore } from '../firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// DOM Elements
const loginPage = document.getElementById('admin-login-page');
const dashboardPage = document.getElementById('admin-dashboard-page');
const loginForm = document.getElementById('admin-login-form');
const emailInput = document.getElementById('admin-email');
const passwordInput = document.getElementById('admin-password');
const loginBtn = document.getElementById('login-btn');
const loginError = document.getElementById('login-error');
const logoutBtn = document.getElementById('logout-btn');

// Show/Hide Pages
function showLogin() {
    loginPage.classList.remove('hidden');
    dashboardPage.classList.add('hidden');
}

function showDashboard() {
    loginPage.classList.add('hidden');
    dashboardPage.classList.remove('hidden');
}

function showError(msg) {
    loginError.textContent = msg;
    loginError.classList.remove('hidden');
}

// Authentication State Listener
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // User is logged in, verify if they are an admin
        try {
            console.log("[ADMIN DEBUG] Verifying Admin role for UID:", user.uid);
            const adminDocRef = doc(firestore, 'software_admin', user.uid);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists()) {
                const adminData = adminDocSnap.data();
                const role = adminData.role;
                if (role === 'Super Admin' || role === 'Staff Admin' || role === 'Software admin' || role === 'Software Admin') {
                    console.log("[ADMIN DEBUG] Access Granted. Role:", role);
                    showDashboard();
                } else {
                    throw new Error("Account exists but lacks admin privileges.");
                }
            } else {
                throw new Error("Unauthorized. This portal is for Administrators only.");
            }
        } catch (err) {
            console.error("[ADMIN ERROR]", err.message);
            showError(err.message);
            await signOut(auth); // Force logout
            showLogin();
        }
    } else {
        // No user logged in
        showLogin();
    }
});

// Login Form Submit
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.classList.add('hidden');
    loginBtn.textContent = 'Authenticating...';
    loginBtn.disabled = true;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        // onAuthStateChanged will handle the redirect and verification
    } catch (err) {
        console.error("Login Error:", err);
        showError("Invalid email or password.");
        loginBtn.textContent = 'Secure Login';
        loginBtn.disabled = false;
    }
});

// Logout
logoutBtn.addEventListener('click', async () => {
    try {
        await signOut(auth);
        console.log("[ADMIN DEBUG] Logged out successfully");
    } catch (err) {
        console.error("Logout Error:", err);
    }
});
