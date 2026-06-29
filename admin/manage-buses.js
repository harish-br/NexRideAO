import { firestore, auth } from '../js/firebase-config.js';
import { collection, onSnapshot, addDoc, updateDoc, doc, getDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// Navigation Elements
const addBusBtn = document.getElementById('add-bus-btn');
const busEditorModal = document.getElementById('bus-editor-modal');
const busEditorForm = document.getElementById('bus-editor-form');
const closeModalBtn = document.getElementById('close-modal-btn');
const cancelModalBtn = document.getElementById('cancel-modal-btn');
const saveBusBtn = document.getElementById('save-bus-btn');
const stopsContainer = document.getElementById('stops-container');
const addStopBtn = document.getElementById('add-stop-btn');
const busesTableBody = document.getElementById('buses-table-body');

// Modal Logic
async function openModal(editId = null) {
  busEditorForm.reset();
  stopsContainer.innerHTML = ''; // clear stops
  stopCount = 0; // reset stop counter
  document.getElementById('bus-edit-id').value = editId || '';
  document.getElementById('bus-modal-title').textContent = editId ? 'Edit Bus Control Center' : 'Add New Bus Control Center';
  
  // Reset tabs to first tab
  document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
  document.querySelector('[data-tab="tab-overview"]').classList.add('active');
  document.getElementById('tab-overview').classList.remove('hidden');

  busEditorModal.classList.remove('hidden');

  if (editId) {
    try {
      const docRef = doc(firestore, 'buses', editId);
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        const data = docSnap.data();
        document.getElementById('modal-bus-no').value = data.busNumber || '';
        document.getElementById('modal-bus-reg').value = data.registrationNumber || '';
        document.getElementById('modal-bus-capacity').value = data.capacity || '';
        document.getElementById('modal-bus-status').value = data.status || 'Active';
        
        document.getElementById('modal-driver-name').value = data.driverName || '';
        document.getElementById('modal-driver-contact').value = data.driverContact || '';
        document.getElementById('modal-driver-emergency').value = data.driverEmergency || '';
        document.getElementById('modal-driver-license').value = data.driverLicense || '';
        
        document.getElementById('modal-route-name').value = data.route || '';
        
        if (data.schedules) {
            document.getElementById('modal-sch-morning-dep').value = data.schedules.morningDeparture || '';
            document.getElementById('modal-sch-morning-arr').value = data.schedules.morningArrival || '';
            document.getElementById('modal-sch-evening-dep').value = data.schedules.eveningDeparture || '';
            document.getElementById('modal-sch-evening-arr').value = data.schedules.eveningArrival || '';
        }
        
        if (data.alerts) {
            document.getElementById('modal-alert-type').value = data.alerts.type || '';
            document.getElementById('modal-alert-msg').value = data.alerts.message || '';
        }
        
        if (data.stops && Array.isArray(data.stops)) {
            data.stops.forEach(stop => {
                const el = createStopElement();
                el.querySelector('.stop-name').value = stop.stopName || '';
                el.querySelector('.stop-arrival').value = stop.arrivalTime || '';
                el.querySelector('.stop-departure').value = stop.departureTime || '';
                if (stop.latitude) el.querySelector('.stop-lat').value = stop.latitude;
                if (stop.longitude) el.querySelector('.stop-lng').value = stop.longitude;
                stopsContainer.appendChild(el);
            });
        }
      }
    } catch (err) {
      console.error("Error fetching bus:", err);
      alert("Failed to load bus data.");
    }
  }
}

function closeModal() {
  busEditorModal.classList.add('hidden');
}

addBusBtn.addEventListener('click', () => openModal(null));
closeModalBtn.addEventListener('click', closeModal);
cancelModalBtn.addEventListener('click', closeModal);

// Tab Switching Logic
document.querySelectorAll('.tab-item').forEach(tab => {
  tab.addEventListener('click', () => {
    // Remove active class from all tabs and hide panels
    document.querySelectorAll('.tab-item').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    
    // Add active class to clicked tab and show corresponding panel
    tab.classList.add('active');
    const targetPanel = document.getElementById(tab.getAttribute('data-tab'));
    if (targetPanel) {
      targetPanel.classList.remove('hidden');
    }
  });
});

// Dropdown Menu Logic
document.addEventListener('click', (e) => {
  // Close all open dropdowns if clicking outside
  if (!e.target.matches('.action-menu-btn')) {
    document.querySelectorAll('.action-menu').forEach(menu => menu.classList.remove('show'));
  } else {
    // Toggle the clicked menu
    const menu = e.target.closest('.action-menu');
    // Close others
    document.querySelectorAll('.action-menu').forEach(m => {
      if (m !== menu) m.classList.remove('show');
    });
    if (menu) menu.classList.toggle('show');
  }
});

// Dynamic Stops Logic
let stopCount = 0;

function createStopElement() {
  stopCount++;
  const stopDiv = document.createElement('div');
  stopDiv.className = 'stop-item';
  stopDiv.innerHTML = `
    <div style="font-weight: 600; font-size: 14px; color: var(--text-secondary);">#${stopCount}</div>
    <input type="text" placeholder="Stop Name (e.g. Rana Nagar)" class="stop-name" />
    <input type="time" placeholder="Arrival" class="stop-arrival" required />
    <input type="time" placeholder="Departure" class="stop-departure" required />
    <input type="number" step="any" placeholder="Latitude" class="stop-lat" />
    <input type="number" step="any" placeholder="Longitude" class="stop-lng" />
    <button type="button" class="remove-stop-btn">&times; Remove</button>
  `;
  
  stopDiv.querySelector('.remove-stop-btn').addEventListener('click', () => {
    stopDiv.remove();
  });
  
  return stopDiv;
}

addStopBtn.addEventListener('click', () => {
  stopsContainer.appendChild(createStopElement());
});

// Fetch Buses and Render Table
const busesRef = collection(firestore, 'buses');
onSnapshot(busesRef, (snapshot) => {
  busesTableBody.innerHTML = ''; // clear existing
  if (snapshot.empty) {
    busesTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: var(--text-secondary);">No buses found. Click Add New Bus to create one.</td></tr>`;
    return;
  }
  
  snapshot.forEach(doc => {
    const data = doc.data();
    const tr = document.createElement('tr');
    
    // Status badge class
    let badgeClass = 'badge-gray';
    let status = data.status || 'Inactive';
    if (status.toLowerCase() === 'active') badgeClass = 'badge-green';
    else if (status.toLowerCase() === 'maintenance') badgeClass = 'badge-red';
    
    tr.innerHTML = `
      <td style="font-weight:600;">${data.busNumber || '-'}</td>
      <td>${data.route || '-'}</td>
      <td>${data.driverName || '-'}</td>
      <td>${data.capacity || '-'}</td>
      <td><span class="status-badge ${badgeClass}">${status}</span></td>
      <td>
        <button class="action-btn view-edit-btn" data-id="${doc.id}">Edit</button>
        <div class="action-menu">
          <button class="action-menu-btn">⋮</button>
          <div class="action-menu-content">
            <a href="#" class="duplicate-btn">Duplicate</a>
            <a href="#" class="archive-btn">Archive</a>
            <a href="#" class="history-btn">View History</a>
            <a href="#" class="delete-btn" style="color:var(--color-red);">Delete</a>
          </div>
        </div>
      </td>
    `;
    busesTableBody.appendChild(tr);
  });
  
  // Attach edit listeners
  document.querySelectorAll('.view-edit-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const busId = e.target.getAttribute('data-id');
      openModal(busId);
      // NOTE: Here we would typically fetch the doc and populate the form
    });
  });
});

// Submit Bus for Approval
saveBusBtn.addEventListener('click', async () => {
  const busNo = document.getElementById('modal-bus-no').value;
  if (!busNo) {
    alert("Please enter the Bus Number.");
    return;
  }

  
  saveBusBtn.textContent = 'Submitting...';
  saveBusBtn.disabled = true;
  
  try {
    // Gather Stops
    const stops = [];
    const stopElements = stopsContainer.querySelectorAll('.stop-item');
    stopElements.forEach((el, index) => {
      stops.push({
        order: index + 1,
        stopName: el.querySelector('.stop-name').value,
        arrivalTime: el.querySelector('.stop-arrival').value,
        departureTime: el.querySelector('.stop-departure').value,
        latitude: el.querySelector('.stop-lat').value ? parseFloat(el.querySelector('.stop-lat').value) : null,
        longitude: el.querySelector('.stop-lng').value ? parseFloat(el.querySelector('.stop-lng').value) : null
      });
    });
    
    // Build Payload
    const targetBusId = document.getElementById('bus-edit-id').value || null;
    
    const payload = {
      type: targetBusId ? 'BUS_UPDATE' : 'BUS_CREATE',
      targetBusId: targetBusId,
      status: 'Pending',
      submittedAt: serverTimestamp(),
      submittedByEmail: auth.currentUser ? auth.currentUser.email : 'admin',
      data: {
        busNumber: document.getElementById('modal-bus-no').value,
        registrationNumber: document.getElementById('modal-bus-reg').value,
        capacity: document.getElementById('modal-bus-capacity').value,
        status: document.getElementById('modal-bus-status').value,
        driverName: document.getElementById('modal-driver-name').value,
        driverContact: document.getElementById('modal-driver-contact').value,
        driverEmergency: document.getElementById('modal-driver-emergency').value,
        driverLicense: document.getElementById('modal-driver-license').value,
        route: document.getElementById('modal-route-name').value,
        stops: stops,
        schedules: {
          morningDeparture: document.getElementById('modal-sch-morning-dep').value,
          morningArrival: document.getElementById('modal-sch-morning-arr').value,
          eveningDeparture: document.getElementById('modal-sch-evening-dep').value,
          eveningArrival: document.getElementById('modal-sch-evening-arr').value
        },
        alerts: {
          type: document.getElementById('modal-alert-type').value,
          message: document.getElementById('modal-alert-msg').value
        }
      }
    };
    
    // Write to Pending Approvals instead of Buses collection
    await addDoc(collection(firestore, 'pending_approvals'), payload);
    
    alert('Bus update submitted successfully! It is now pending approval by a Super Admin.');
    closeModal();
    
  } catch (error) {
    console.error("Error submitting for approval:", error);
    alert('Failed to submit: ' + error.message);
  } finally {
    saveBusBtn.textContent = 'Submit for Approval';
    saveBusBtn.disabled = false;
  }
});
