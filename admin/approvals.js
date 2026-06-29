import { firestore } from '../js/firebase-config.js';
import { collection, onSnapshot, query, where, doc, updateDoc, setDoc, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

const approvalsTableBody = document.getElementById('approvals-table-body');

// Track loaded payloads
let pendingPayloads = {};

// Fetch Pending Approvals
const approvalsRef = collection(firestore, 'pending_approvals');
const q = query(approvalsRef, where("status", "==", "Pending"));

onSnapshot(q, (snapshot) => {
  if (!approvalsTableBody) return; // Prevent errors if not on the page
  
  approvalsTableBody.innerHTML = '';
  pendingPayloads = {}; // Reset

  if (snapshot.empty) {
    approvalsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: var(--text-secondary);">No pending approvals.</td></tr>`;
    return;
  }
  
  snapshot.forEach(docSnap => {
    const data = docSnap.data();
    pendingPayloads[docSnap.id] = data; // Store payload for later use
    
    const tr = document.createElement('tr');
    
    // Format timestamp
    const submittedAt = data.submittedAt ? new Date(data.submittedAt.toDate()).toLocaleString() : 'Unknown';
    const targetBus = data.targetBusId ? `Bus ID: ${data.targetBusId}` : 'New Bus';
    
    tr.innerHTML = `
      <td><span class="status-badge badge-orange">${data.type}</span></td>
      <td style="font-weight:600;">${targetBus}</td>
      <td>Admin<br/><small style="color:var(--text-secondary)">${submittedAt}</small></td>
      <td><span class="status-badge badge-orange">${data.status}</span></td>
      <td>
        <button class="action-btn approve-btn" data-id="${docSnap.id}" style="color:var(--color-green);">Approve</button>
        <button class="action-btn reject-btn" data-id="${docSnap.id}" style="color:var(--color-red);">Reject</button>
      </td>
    `;
    approvalsTableBody.appendChild(tr);
  });
  
  // Attach listeners
  document.querySelectorAll('.approve-btn').forEach(btn => {
    btn.addEventListener('click', handleApprove);
  });
  
  document.querySelectorAll('.reject-btn').forEach(btn => {
    btn.addEventListener('click', handleReject);
  });
});

async function handleApprove(e) {
  const approvalId = e.target.getAttribute('data-id');
  const payload = pendingPayloads[approvalId];
  if (!payload) return;
  
  if (!confirm("Are you sure you want to approve this payload and write it to the live database?")) return;
  
  const originalBtnText = e.target.textContent;
  e.target.textContent = 'Approving...';
  e.target.disabled = true;
  
  try {
    if (payload.type === 'BUS_UPDATE' && payload.targetBusId) {
      // Update existing bus
      const busRef = doc(firestore, 'buses', payload.targetBusId);
      await updateDoc(busRef, payload.data);
    } else {
      // Create new bus with document ID format bus_{busNumber} so the user app can find it easily
      const newBusId = payload.data.busNumber ? `bus_${payload.data.busNumber.trim()}` : null;
      if (!newBusId) throw new Error("Bus Number is required to create a new bus.");
      const newBusRef = doc(firestore, 'buses', newBusId);
      await setDoc(newBusRef, payload.data);
    }
    
    // Mark as Approved
    await updateDoc(doc(firestore, 'pending_approvals', approvalId), {
      status: 'Approved'
    });
    
    alert('Bus approved successfully and is now live!');
    
  } catch (error) {
    console.error("Error approving payload:", error);
    alert("Failed to approve: " + error.message);
    e.target.textContent = originalBtnText;
    e.target.disabled = false;
  }
}

async function handleReject(e) {
  const approvalId = e.target.getAttribute('data-id');
  
  if (!confirm("Are you sure you want to REJECT this payload?")) return;
  
  const originalBtnText = e.target.textContent;
  e.target.textContent = 'Rejecting...';
  e.target.disabled = true;
  
  try {
    // Mark as Rejected
    await updateDoc(doc(firestore, 'pending_approvals', approvalId), {
      status: 'Rejected'
    });
  } catch (error) {
    console.error("Error rejecting payload:", error);
    alert("Failed to reject: " + error.message);
    e.target.textContent = originalBtnText;
    e.target.disabled = false;
  }
}
