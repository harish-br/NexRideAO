const fs = require('fs');
let js = fs.readFileSync('admin/admin.js', 'utf8');

// Update imports
js = js.replace(/import { doc, getDoc, collection, onSnapshot }/, "import { doc, getDoc, collection, onSnapshot, query, where, limit, orderBy }");

// Append new stats logic
const newLogic = `
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
                const type = data.type === 'BUS_UPDATE' ? 'Update' : 'New Bus';
                const status = data.status || 'Unknown';
                const timeStr = data.submittedAt ? new Date(data.submittedAt.toDate()).toLocaleTimeString() : 'Just now';
                
                const div = document.createElement('div');
                div.style.marginBottom = '8px';
                div.style.fontSize = '14px';
                
                let color = 'var(--text-primary)';
                if (status === 'Approved') color = 'var(--color-green)';
                if (status === 'Rejected') color = 'var(--color-red)';
                if (status === 'Pending') color = 'var(--color-orange)';
                
                div.innerHTML = \`
                    <div style="display:flex; justify-content:space-between;">
                        <span><strong>\${type}</strong> (\${data.targetBusId || 'New'})</span>
                        <span style="color:\${color}">\${status}</span>
                    </div>
                    <div style="color: var(--text-secondary); font-size: 12px;">\${timeStr}</div>
                \`;
                recentUpdatesList.appendChild(div);
            });
        });
    }
}
`;

js = js + newLogic;

// Also call initSystemStatus in showDashboard
js = js.replace('initDashboardStats();', 'initDashboardStats();\n    initSystemStatus();');

fs.writeFileSync('admin/admin.js', js);
console.log("admin.js updated");
