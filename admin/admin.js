import { auth, firestore } from '../js/firebase-config.js';
import { signInWithEmailAndPassword, signOut, onAuthStateChanged, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc, collection, onSnapshot, query, where, limit, orderBy } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

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
    initDashboardStats();
    initSystemStatus();
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
        await setPersistence(auth, browserLocalPersistence);
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

// Update Dashboard Stats Dynamically
const statPlaces = document.getElementById('stat-places');
const statRoutes = document.getElementById('stat-routes');
const statTrips = document.getElementById('stat-trips');
const statActive = document.getElementById('stat-active');
const statInactive = document.getElementById('stat-inactive');

function initDashboardStats() {
    const busesRef = collection(firestore, 'buses');
    onSnapshot(busesRef, (snapshot) => {
        let activeCount = 0;
        let inactiveCount = 0;
        const uniqueRoutes = new Set();
        const uniquePlaces = new Set();

        snapshot.forEach(docSnap => {
            const data = docSnap.data();
            
            // Status counts
            const status = (data.status || '').toLowerCase();
            if (status === 'active') {
                activeCount++;
            } else {
                inactiveCount++; // Inactive or Maintenance
            }

            // Route counting
            if (data.route) {
                uniqueRoutes.add(data.route.trim().toLowerCase());
            }

            // Places (Stops) counting
            if (data.stops && Array.isArray(data.stops)) {
                data.stops.forEach(stop => {
                    if (stop.stopName) {
                        uniquePlaces.add(stop.stopName.trim().toLowerCase());
                    }
                });
            }
        });

        if (statTrips) statTrips.textContent = snapshot.size;
        if (statActive) statActive.textContent = activeCount;
        if (statInactive) statInactive.textContent = inactiveCount;
        if (statRoutes) statRoutes.textContent = uniqueRoutes.size;
        if (statPlaces) statPlaces.textContent = uniquePlaces.size;
    });
}

// System Status & Recent Updates Logic
const sysLatency = document.getElementById('sys-latency');
const sysConnection = document.getElementById('sys-connection');
const sysQueue = document.getElementById('sys-queue');
const recentUpdatesList = document.getElementById('recent-updates-list');

function initSystemStatus() {
    // 1. Measure Latency & Connection
    async function measureLatency() {
        if (!sysLatency || !sysConnection) return;
        const start = performance.now();
        try {
            // Fetch a random tiny document to test speed
            await getDoc(doc(firestore, 'software_admin', auth.currentUser.uid));
            const end = performance.now();
            const ms = Math.round(end - start);
            
            sysLatency.textContent = ms + ' ms';
            sysConnection.textContent = 'Stable / Online';
            
            // Adjust colors based on latency
            if (ms < 200) {
                sysLatency.className = 'status-badge badge-green';
                sysConnection.className = 'status-badge badge-green';
            } else if (ms < 1000) {
                sysLatency.className = 'status-badge badge-orange';
                sysConnection.className = 'status-badge badge-orange';
            } else {
                sysLatency.className = 'status-badge badge-red';
                sysConnection.className = 'status-badge badge-red';
            }
        } catch (e) {
            sysLatency.textContent = 'Timeout';
            sysConnection.textContent = 'Disconnected';
            sysLatency.className = 'status-badge badge-red';
            sysConnection.className = 'status-badge badge-red';
        }
    }
    
    // Measure immediately and every 10 seconds
    measureLatency();
    setInterval(measureLatency, 10000);

    // 2. Pending Approvals Queue
    if (sysQueue) {
        const queueQuery = query(collection(firestore, 'pending_approvals'), where('status', '==', 'Pending'));
        onSnapshot(queueQuery, (snapshot) => {
            sysQueue.textContent = snapshot.size + ' requests';
            if (snapshot.size === 0) {
                sysQueue.className = 'status-badge badge-green';
            } else {
                sysQueue.className = 'status-badge badge-orange';
            }
        });
    }

    // 3. Recent Activity (Approvals history)
    if (recentUpdatesList) {
        const activityQuery = query(collection(firestore, 'pending_approvals'), orderBy('submittedAt', 'desc'), limit(5));
        onSnapshot(activityQuery, (snapshot) => {
            recentUpdatesList.innerHTML = '';
            if (snapshot.empty) {
                recentUpdatesList.innerHTML = '<div style="color: var(--text-secondary); font-size: 14px;">No recent activity found.</div>';
                return;
            }
            
            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                
                let typeTitle = 'SUBMIT BUS REQUEST';
                let description = 'Submitted new bus request';
                
                if (data.type === 'BUS_UPDATE') {
                    typeTitle = 'UPDATE BUS REQUEST';
                    description = 'Submitted bus update for ' + (data.data && data.data.route ? data.data.route : 'unknown route');
                } else if (data.type === 'BUS_CREATE') {
                    typeTitle = 'NEW BUS REQUEST';
                    description = 'Submitted new bus for ' + (data.data && data.data.route ? data.data.route : 'unknown route');
                }

                if (data.status === 'Approved') {
                    typeTitle = 'APPROVE BUS REQUEST';
                    description = 'Approved bus request for ' + (data.data && data.data.route ? data.data.route : 'unknown route');
                } else if (data.status === 'Rejected') {
                    typeTitle = 'REJECT BUS REQUEST';
                    description = 'Rejected bus request for ' + (data.data && data.data.route ? data.data.route : 'unknown route');
                }

                const email = data.submittedByEmail || 'admin';
                const timeStr = data.submittedAt ? new Date(data.submittedAt.toDate()).toLocaleString() : 'Just now';
                
                const div = document.createElement('div');
                div.style.marginBottom = '20px';
                div.style.position = 'relative';
                div.style.paddingLeft = '20px';
                
                div.innerHTML = `
                    <div style="position: absolute; left: 0; top: 4px; width: 8px; height: 8px; background-color: #000;"></div>
                    <div style="font-weight: 600; font-size: 13px; letter-spacing: 0.5px; text-transform: uppercase; color: #111;">${typeTitle}</div>
                    <div style="font-size: 14px; color: #444; margin: 4px 0;">${description}</div>
                    <div style="font-size: 12px; color: #888;">${timeStr} &bull; by ${email}</div>
                `;
                recentUpdatesList.appendChild(div);
            });

        });
    }
}
