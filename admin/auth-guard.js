import { auth, firestore } from '../firebase-config.js';
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
                } else {
                    throw new Error("Not an admin");
                }
            } else {
                throw new Error("Not an admin");
            }
        } catch (err) {
            console.error("Auth Guard:", err);
            window.location.href = '/admin/';
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
