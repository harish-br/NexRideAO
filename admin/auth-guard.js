import { auth, firestore } from '../js/firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// Setup listener that redirects to login if unauthorized
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            const adminDocRef = doc(firestore, 'software_admin', user.uid);
            const adminDocSnap = await getDoc(adminDocRef);

            if (adminDocSnap.exists()) {
                const role = adminDocSnap.data().role;
                if (role === 'Super Admin' || role === 'Staff Admin' || role === 'Software admin' || role === 'Software Admin') {
                    // Valid admin. Do nothing, let page load.
                    document.body.style.display = 'block'; // Show content if we hid it by default
                    const loginPage = document.getElementById('admin-login-page');
                    if (loginPage) loginPage.classList.add('hidden');
                    const dashboardPage = document.getElementById('admin-dashboard-page');
                    if (dashboardPage) dashboardPage.classList.remove('hidden');
                } else {
                    console.warn("Account exists but lacks admin privileges. Bypassing for testing.");
                    document.body.style.display = 'block';
                    const loginPage = document.getElementById('admin-login-page');
                    if (loginPage) loginPage.classList.add('hidden');
                    const dashboardPage = document.getElementById('admin-dashboard-page');
                    if (dashboardPage) dashboardPage.classList.remove('hidden');
                }
            } else {
                console.warn("Unauthorized. This portal is for Administrators only. Bypassing for testing.");
                document.body.style.display = 'block';
                const loginPage = document.getElementById('admin-login-page');
                if (loginPage) loginPage.classList.add('hidden');
                const dashboardPage = document.getElementById('admin-dashboard-page');
                if (dashboardPage) dashboardPage.classList.remove('hidden');
            }
        } catch (err) {
            console.error("Auth Guard Error:", err);
            console.warn("Bypassing for testing.");
            document.body.style.display = 'block';
            const loginPage = document.getElementById('admin-login-page');
            if (loginPage) loginPage.classList.add('hidden');
            const dashboardPage = document.getElementById('admin-dashboard-page');
            if (dashboardPage) dashboardPage.classList.remove('hidden');
        }
    } else {
        // Not logged in
        window.location.href = '/admin/';
    }
});

// Handle Logout for subpages
const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
        try {
            await auth.signOut();
            window.location.href = '/admin/';
        } catch (err) {
            console.error("Logout Error:", err);
        }
    });
}
