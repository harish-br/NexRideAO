import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// =============================================================================
// REPLICATE EXPIRY ENGINE FOR DIRECT ISOLATED UNIT TESTING
// =============================================================================

function getDaysRemaining(expiryDateInput) {
  if (!expiryDateInput || expiryDateInput === '--' || expiryDateInput === 'N/A' || expiryDateInput === 'Permanent') {
    return null;
  }
  let expStr = '';
  if (typeof expiryDateInput === 'string') {
    expStr = expiryDateInput.trim();
  } else if (expiryDateInput instanceof Date) {
    expStr = expiryDateInput.toISOString().split('T')[0];
  } else if (typeof expiryDateInput === 'object' && expiryDateInput.seconds) {
    expStr = new Date(expiryDateInput.seconds * 1000).toISOString().split('T')[0];
  }
  const expMatch = expStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!expMatch) return null;

  const expYear = parseInt(expMatch[1], 10);
  const expMonth = parseInt(expMatch[2], 10) - 1;
  const expDay = parseInt(expMatch[3], 10);
  const targetUtc = Date.UTC(expYear, expMonth, expDay);

  const now = new Date();
  const kolkataStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [currY, currM, currD] = kolkataStr.split('-').map(n => parseInt(n, 10));
  const currentUtc = Date.UTC(currY, currM - 1, currD);

  const diffMs = targetUtc - currentUtc;
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

function getExpiryStatus(expiryDateInput) {
  const days = getDaysRemaining(expiryDateInput);
  if (days === null) {
    return { status: 'Valid', badgeClass: 'badge-green', daysRemaining: null, daysText: 'Permanent' };
  }
  if (days < 0) {
    const absDays = Math.abs(days);
    return {
      status: 'Expired',
      badgeClass: 'badge-red',
      daysRemaining: days,
      daysText: `Expired ${absDays} day${absDays === 1 ? '' : 's'} ago`
    };
  }
  if (days <= 30) {
    return {
      status: 'Expiring Soon',
      badgeClass: 'badge-orange',
      daysRemaining: days,
      daysText: `${days} day${days === 1 ? '' : 's'} remaining`
    };
  }
  return {
    status: 'Valid',
    badgeClass: 'badge-green',
    daysRemaining: days,
    daysText: `${days} days remaining`
  };
}

// =============================================================================
// REPLICATE DRIVER ASSIGNMENT VALIDATION LOGIC FOR UNIT TESTING
// =============================================================================

function validateDriverAssignment(driver, targetBus, documentsCache = []) {
  if (!driver || !targetBus) {
    return { valid: false, error: 'Please select both a valid driver and bus.' };
  }
  if (targetBus.status === 'Maintenance' || targetBus.status === 'Inactive') {
    return { valid: false, error: `Cannot assign driver. Bus ${targetBus.busNumber || targetBus.id} is currently ${targetBus.status}.` };
  }
  if (driver.status && driver.status !== 'Active') {
    return { valid: false, error: `Cannot assign driver. Driver ${driver.name} is currently ${driver.status}. Only Active drivers can be assigned.` };
  }
  const licExpiry = getExpiryStatus(driver.licenseExpiry || driver.licenceExpiry);
  if (licExpiry.status === 'Expired') {
    return { valid: false, error: `Cannot assign driver. Driving licence for ${driver.name} expired on ${driver.licenseExpiry || driver.licenceExpiry || 'N/A'}. Expired drivers cannot be assigned.` };
  }
  if (driver.verificationStatus && driver.verificationStatus !== 'Verified') {
    return { valid: false, error: `Cannot assign driver. Driver ${driver.name} verification status is "${driver.verificationStatus}". Must be Verified.` };
  }
  const driverLicDoc = documentsCache.find(doc => 
    (doc.ownerId === driver.id || doc.ownerName === driver.name) && 
    String(doc.documentType || '').toLowerCase().includes('licen')
  );
  if (driverLicDoc) {
    const docExp = getExpiryStatus(driverLicDoc.expiryDate);
    if (docExp.status === 'Expired') {
      return { valid: false, error: `Cannot assign driver. Driving licence document is expired (${driverLicDoc.expiryDate}).` };
    }
    if (driverLicDoc.verificationStatus === 'Rejected') {
      return { valid: false, error: `Cannot assign driver. Driving licence document was rejected: ${driverLicDoc.rejectionReason || 'Compliance failed'}.` };
    }
  }
  return { valid: true };
}

// =============================================================================
// TEST SUITE: DRIVERS & DOCUMENTS MANAGEMENT MODULE
// =============================================================================

test('DRIVERS & DOCUMENTS: Dynamic Expiry Engine Calculations', async (t) => {
  const now = new Date();
  const kolkataStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  const [currY, currM, currD] = kolkataStr.split('-').map(n => parseInt(n, 10));

  await t.test('1. Calculates exact 0 days for today as Expiring Soon', () => {
    const res = getExpiryStatus(kolkataStr);
    assert.equal(res.daysRemaining, 0);
    assert.equal(res.status, 'Expiring Soon');
    assert.equal(res.badgeClass, 'badge-orange');
    assert.equal(res.daysText, '0 days remaining');
  });

  await t.test('2. Calculates negative days for yesterday as Expired with badge-red', () => {
    const yesterdayUtc = new Date(Date.UTC(currY, currM - 1, currD) - 86400000);
    const yestStr = yesterdayUtc.toISOString().split('T')[0];
    const res = getExpiryStatus(yestStr);
    assert.equal(res.daysRemaining, -1);
    assert.equal(res.status, 'Expired');
    assert.equal(res.badgeClass, 'badge-red');
    assert.equal(res.daysText, 'Expired 1 day ago');
  });

  await t.test('3. Classifies boundary: 30 days as Expiring Soon, 31 days as Valid', () => {
    const in30Utc = new Date(Date.UTC(currY, currM - 1, currD) + (30 * 86400000));
    const in30Str = in30Utc.toISOString().split('T')[0];
    const res30 = getExpiryStatus(in30Str);
    assert.equal(res30.daysRemaining, 30);
    assert.equal(res30.status, 'Expiring Soon');
    assert.equal(res30.badgeClass, 'badge-orange');

    const in31Utc = new Date(Date.UTC(currY, currM - 1, currD) + (31 * 86400000));
    const in31Str = in31Utc.toISOString().split('T')[0];
    const res31 = getExpiryStatus(in31Str);
    assert.equal(res31.daysRemaining, 31);
    assert.equal(res31.status, 'Valid');
    assert.equal(res31.badgeClass, 'badge-green');
  });

  await t.test('4. Handles permanent and null dates gracefully', () => {
    assert.equal(getExpiryStatus(null).status, 'Valid');
    assert.equal(getExpiryStatus('').status, 'Valid');
    assert.equal(getExpiryStatus('Permanent').status, 'Valid');
    assert.equal(getExpiryStatus('--').status, 'Valid');
  });
});

test('DRIVERS: Vehicle Assignment Safety Engine', async (t) => {
  const activeBus = { id: 'bus-01', busNumber: '12', status: 'Active' };
  const maintenanceBus = { id: 'bus-02', busNumber: '14', status: 'Maintenance' };
  const inactiveBus = { id: 'bus-03', busNumber: '16', status: 'Inactive' };

  const validDriver = {
    id: 'drv-01',
    name: 'Ramesh Kumar',
    status: 'Active',
    licenseExpiry: '2028-12-31',
    verificationStatus: 'Verified'
  };

  await t.test('1. Allows assignment when bus is active and driver is valid & verified', () => {
    const res = validateDriverAssignment(validDriver, activeBus);
    assert.equal(res.valid, true);
  });

  await t.test('2. Blocks assignment if bus is under Maintenance or Inactive', () => {
    const resMaint = validateDriverAssignment(validDriver, maintenanceBus);
    assert.equal(resMaint.valid, false);
    assert.match(resMaint.error, /currently Maintenance/);

    const resInact = validateDriverAssignment(validDriver, inactiveBus);
    assert.equal(resInact.valid, false);
    assert.match(resInact.error, /currently Inactive/);
  });

  await t.test('3. Blocks assignment if driver is Inactive or Suspended', () => {
    const inactiveDriver = { ...validDriver, status: 'Inactive' };
    const resInact = validateDriverAssignment(inactiveDriver, activeBus);
    assert.equal(resInact.valid, false);
    assert.match(resInact.error, /Only Active drivers can be assigned/);

    const suspendedDriver = { ...validDriver, status: 'Suspended' };
    const resSusp = validateDriverAssignment(suspendedDriver, activeBus);
    assert.equal(resSusp.valid, false);
    assert.match(resSusp.error, /Only Active drivers can be assigned/);
  });

  await t.test('4. Blocks assignment if driver licence is expired', () => {
    const expiredDriver = { ...validDriver, licenseExpiry: '2020-01-01' };
    const res = validateDriverAssignment(expiredDriver, activeBus);
    assert.equal(res.valid, false);
    assert.match(res.error, /Driving licence for Ramesh Kumar expired/);
  });

  await t.test('5. Blocks assignment if driver is unverified or rejected', () => {
    const pendingDriver = { ...validDriver, verificationStatus: 'Pending' };
    const resPend = validateDriverAssignment(pendingDriver, activeBus);
    assert.equal(resPend.valid, false);
    assert.match(resPend.error, /verification status is "Pending"/);

    const rejectedDriver = { ...validDriver, verificationStatus: 'Rejected' };
    const resRej = validateDriverAssignment(rejectedDriver, activeBus);
    assert.equal(resRej.valid, false);
    assert.match(resRej.error, /verification status is "Rejected"/);
  });

  await t.test('6. Blocks assignment if driver licence document in documents collection is expired or rejected', () => {
    const expiredDoc = {
      id: 'doc-01',
      ownerId: 'drv-01',
      documentType: 'Driving Licence',
      expiryDate: '2021-05-01',
      verificationStatus: 'Verified'
    };
    const resExpDoc = validateDriverAssignment(validDriver, activeBus, [expiredDoc]);
    assert.equal(resExpDoc.valid, false);
    assert.match(resExpDoc.error, /Driving licence document is expired/);

    const rejectedDoc = {
      id: 'doc-02',
      ownerId: 'drv-01',
      documentType: 'Driving Licence',
      expiryDate: '2028-12-31',
      verificationStatus: 'Rejected',
      rejectionReason: 'Blurry copy of front page'
    };
    const resRejDoc = validateDriverAssignment(validDriver, activeBus, [rejectedDoc]);
    assert.equal(resRejDoc.valid, false);
    assert.match(resRejDoc.error, /Driving licence document was rejected: Blurry copy/);
  });
});

test('DOCUMENTS: Category, Status, and Expiry Filtering Logic', async (t) => {
  const docs = [
    { id: 'd1', ownerType: 'driver', expiryDate: '2028-12-31', verificationStatus: 'Verified' },
    { id: 'd2', ownerType: 'driver', expiryDate: '2020-01-01', verificationStatus: 'Verified' },
    { id: 'v1', ownerType: 'vehicle', expiryDate: '2028-12-31', verificationStatus: 'Verified' },
    { id: 'v2', ownerType: 'vehicle', expiryDate: '2020-01-01', verificationStatus: 'Pending' },
    { id: 's1', ownerType: 'student', expiryDate: null, verificationStatus: 'Verified' }
  ];

  await t.test('Filters correctly by owner category tabs', () => {
    const driversOnly = docs.filter(d => d.ownerType === 'driver');
    assert.equal(driversOnly.length, 2);

    const vehiclesOnly = docs.filter(d => d.ownerType === 'vehicle');
    assert.equal(vehiclesOnly.length, 2);

    const studentsOnly = docs.filter(d => d.ownerType === 'student');
    assert.equal(studentsOnly.length, 1);
  });

  await t.test('Filters correctly by computed expiry status', () => {
    const expiredDocs = docs.filter(d => getExpiryStatus(d.expiryDate).status === 'Expired');
    assert.equal(expiredDocs.length, 2);
    assert.deepEqual(expiredDocs.map(d => d.id), ['d2', 'v2']);

    const validDocs = docs.filter(d => getExpiryStatus(d.expiryDate).status === 'Valid');
    assert.equal(validDocs.length, 3);
  });
});

test('PORTAL CODEBASE: Navigation, Modals, Rules & Handlers Integrity', async (t) => {
  const html = fs.readFileSync(path.resolve('admin/index.html'), 'utf8');
  const css = fs.readFileSync(path.resolve('admin/admin.css'), 'utf8');
  const js = fs.readFileSync(path.resolve('admin/admin.js'), 'utf8');
  const rules = fs.readFileSync(path.resolve('firestore.rules'), 'utf8');

  await t.test('1. Navigation includes Drivers with sub-dropdown and Documents', () => {
    assert.match(html, /data-view="drivers-view"/, 'admin/index.html must have Drivers view trigger');
    assert.match(html, /data-drivers-tab="list"/, 'Drivers dropdown must have list subview');
    assert.match(html, /data-drivers-tab="compliance"/, 'Drivers dropdown must have compliance subview');
    assert.match(html, /data-drivers-tab="docs"/, 'Drivers dropdown must have docs subview');
    assert.match(html, /data-view="documents-view"/, 'admin/index.html must have Documents view trigger');
  });

  await t.test('2. Dashboard alert widget exists inside #dashboard-view', () => {
    assert.match(html, /id="dashboard-document-alerts-widget"/, 'Must contain dashboard-document-alerts-widget');
    assert.match(html, /id="dash-doc-alerts-list"/, 'Must contain dash-doc-alerts-list');
  });

  await t.test('3. All required Driver & Document modals are defined in HTML', () => {
    assert.match(html, /id="driver-editor-modal"/, 'Must contain driver-editor-modal');
    assert.match(html, /id="driver-details-modal"/, 'Must contain driver-details-modal');
    assert.match(html, /id="document-upload-modal"/, 'Must contain document-upload-modal');
    assert.match(html, /id="document-viewer-modal"/, 'Must contain document-viewer-modal');
    assert.match(html, /id="document-rejection-modal"/, 'Must contain document-rejection-modal');
  });

  await t.test('4. CSS contains styles for subnav pills, compliance sections, and dropzone', () => {
    assert.match(css, /\.view-subnav-pills/, 'admin.css must define .view-subnav-pills');
    assert.match(css, /\.subnav-pill-btn/, 'admin.css must define .subnav-pill-btn');
    assert.match(css, /\.compliance-section-box/, 'admin.css must define .compliance-section-box');
    assert.match(css, /\.dropzone-area/, 'admin.css must define .dropzone-area');
    assert.match(css, /\.critical-warning-box/, 'admin.css must define .critical-warning-box');
  });

  await t.test('5. Firestore rules include /documents/{documentId} configuration', () => {
    assert.match(rules, /match\s*\/documents\/\{documentId\}/, 'firestore.rules must match /documents/{documentId}');
    assert.match(rules, /allow\s*read:\s*if\s*(isAuthenticated\(\)|request\.auth\s*!=\s*null)/, 'documents read must require authentication');
  });

  await t.test('6. admin.js defines and exposes all required window handlers', () => {
    const requiredHandlers = [
      'window.adminOpenAddDriver',
      'window.adminInspectDriver',
      'window.adminEditDriver',
      'window.adminUploadDriverDoc',
      'window.adminDeleteDriver',
      'window.adminOpenUploadDoc',
      'window.adminViewDocument',
      'window.adminVerifyDocument',
      'window.adminRejectDocumentPrompt',
      'window.adminDeleteDocument'
    ];

    for (const h of requiredHandlers) {
      assert.ok(js.includes(h), `admin.js must expose ${h}`);
    }
  });

  await t.test('7. Realtime engine invokes listenToDrivers and listenToDocuments', () => {
    assert.match(js, /function initRealtimeEngine\(\)[\s\S]*?listenToDrivers\(\);/, 'initRealtimeEngine must call listenToDrivers');
    assert.match(js, /function initRealtimeEngine\(\)[\s\S]*?listenToDocuments\(\);/, 'initRealtimeEngine must call listenToDocuments');
    assert.match(js, /function initRealtimeEngine\(\)[\s\S]*?setupDriversAndDocumentsListeners\(\);/, 'initRealtimeEngine must call setupDriversAndDocumentsListeners');
  });

  await t.test('8. Upload Document button and modal triggers are wired across HTML and JS', () => {
    assert.match(html, /id="upload-doc-btn"[^>]*onclick="window\.adminOpenUploadDoc\(\)"/, 'Upload doc button must have onclick handler');
    assert.match(js, /upload-doc-btn/, 'admin.js must listen to upload-doc-btn');
    assert.match(js, /window\.openDocumentUploadModal\s*=/, 'admin.js must expose openDocumentUploadModal on window');
    assert.match(js, /window\.adminOpenUploadDoc\s*=/, 'admin.js must expose adminOpenUploadDoc on window');
  });

  await t.test('9. Pagination helper renderPaginationButtons is defined and handles button elements', () => {
    assert.match(js, /function renderPaginationButtons\(/, 'admin.js must define renderPaginationButtons helper');
    assert.match(js, /pagination-btn/, 'admin.js must generate pagination-btn elements');
  });

  await t.test('10. Driver vehicle assignment engine getDriverAssignedBusInfo is defined and exposed', () => {
    assert.match(js, /function getDriverAssignedBusInfo\(/, 'admin.js must define getDriverAssignedBusInfo');
    assert.match(js, /window\.getDriverAssignedBusInfo\s*=/, 'admin.js must expose getDriverAssignedBusInfo on window');
  });
});

test('DRIVERS: Vehicle Assignment Cross-Referencing & Resolution Engine', async (t) => {
  const mockBuses = [
    { id: 'bus_01', busNumber: '01', driverName: 'Naveen Kumar', routeName: 'Campus Express 1', status: 'Active' },
    { id: 'bus_12', busNumber: '12', driverName: 'Ramesh K', routeName: 'South City Route', status: 'Active' },
    { id: 'bus_99', busNumber: '99', assignedDriverId: 'DRV-99', driverName: '', routeName: 'North Ring', status: 'Maintenance' }
  ];

  const mockRoutes = [
    { id: 'rt_01', name: 'West Route', assignedDriver: 'Karthik S', assignedBus: '15' }
  ];

  // Isolated replication of getDriverAssignedBusInfo for unit testing
  function testResolveDriverVehicle(driver, buses = mockBuses, routes = mockRoutes) {
    if (!driver) return { hasBus: false, busNumber: '', displayBus: 'Unassigned', busId: '', routeName: '' };
    let rawBus = String(driver.assignedBus || driver.assignedBusNumber || driver.assignedVehicle || driver.busNumber || driver.bus || '').trim();
    let busId = String(driver.assignedBusId || '').trim();
    let routeName = String(driver.assignedRoute || '').trim();

    if (rawBus === 'N/A' || rawBus === '--' || rawBus.toLowerCase() === 'unassigned' || rawBus === 'null' || rawBus === 'undefined') {
      rawBus = '';
    }

    let matchedBus = null;
    if (busId) {
      matchedBus = buses.find(b => b.id === busId || String(b.busNumber).trim() === busId);
    }
    if (!matchedBus && rawBus) {
      const cleanNum = rawBus.replace(/^bus\s*/i, '').trim();
      matchedBus = buses.find(b => String(b.busNumber).trim() === cleanNum || b.id === rawBus);
    }
    const dId = String(driver.id || driver.driverId || '').trim();
    if (!matchedBus && dId) {
      matchedBus = buses.find(b => (b.assignedDriverId && String(b.assignedDriverId).trim() === dId) || (b.driverId && String(b.driverId).trim() === dId));
    }
    const dName = String(driver.name || '').trim().toLowerCase();
    if (!matchedBus && dName && dName !== '--' && dName !== 'driver') {
      matchedBus = buses.find(b => {
        const bDriver = String(b.driverName || b.assignedDriverName || '').trim().toLowerCase();
        return bDriver === dName;
      });
    }
    if (!matchedBus && dName && dName !== '--' && dName !== 'driver') {
      const matchedRoute = routes.find(r => {
        const rDriver = String(r.assignedDriver || r.driverName || '').trim().toLowerCase();
        return rDriver === dName;
      });
      if (matchedRoute) {
        if (!routeName) routeName = matchedRoute.name || '';
        const rBus = matchedRoute.assignedBus || (Array.isArray(matchedRoute.assignedBuses) ? matchedRoute.assignedBuses[0] : null);
        if (rBus) {
          const cleanRBus = String(rBus).replace(/^bus\s*/i, '').trim();
          matchedBus = buses.find(b => String(b.busNumber).trim() === cleanRBus || b.id === rBus);
          if (!matchedBus && !rawBus) rawBus = cleanRBus;
        }
      }
    }

    if (matchedBus) {
      const busNum = String(matchedBus.busNumber || '').trim();
      const finalRoute = matchedBus.routeName || matchedBus.route || routeName || '';
      const cleanDisplay = busNum ? (busNum.toLowerCase().startsWith('bus') ? busNum : `Bus ${busNum}`) : 'Unassigned';
      return {
        hasBus: Boolean(busNum),
        busNumber: busNum,
        displayBus: cleanDisplay,
        busId: matchedBus.id,
        routeName: finalRoute
      };
    }

    if (rawBus) {
      const cleanNum = rawBus.replace(/^bus\s*/i, '').trim();
      const cleanDisplay = cleanNum ? (cleanNum.toLowerCase().startsWith('bus') ? cleanNum : `Bus ${cleanNum}`) : 'Unassigned';
      return {
        hasBus: Boolean(cleanNum),
        busNumber: cleanNum,
        displayBus: cleanDisplay,
        busId: busId || '',
        routeName: routeName || ''
      };
    }

    return { hasBus: false, busNumber: '', displayBus: 'Unassigned', busId: '', routeName: routeName || '' };
  }

  await t.test('1. Resolves vehicle assigned via driver.assignedBusNumber', () => {
    const driver = { id: 'DRV-10', name: 'Vimal', assignedBusNumber: '12' };
    const res = testResolveDriverVehicle(driver);
    assert.equal(res.hasBus, true);
    assert.equal(res.busNumber, '12');
    assert.equal(res.displayBus, 'Bus 12');
    assert.equal(res.routeName, 'South City Route');
  });

  await t.test('2. Resolves vehicle assigned via driver.assignedBusId', () => {
    const driver = { id: 'DRV-11', name: 'Murugan', assignedBusId: 'bus_01' };
    const res = testResolveDriverVehicle(driver);
    assert.equal(res.hasBus, true);
    assert.equal(res.busNumber, '01');
    assert.equal(res.displayBus, 'Bus 01');
    assert.equal(res.routeName, 'Campus Express 1');
  });

  await t.test('3. Resolves vehicle by matching driverName on bus record (case-insensitive)', () => {
    const driver = { id: 'DRV-12', name: 'naveen kumar' }; // Lowercase, matching 'Naveen Kumar'
    const res = testResolveDriverVehicle(driver);
    assert.equal(res.hasBus, true);
    assert.equal(res.busNumber, '01');
    assert.equal(res.displayBus, 'Bus 01');
    assert.equal(res.routeName, 'Campus Express 1');
  });

  await t.test('4. Resolves vehicle by matching assignedDriverId on bus record', () => {
    const driver = { id: 'DRV-99', name: 'Special Ops' };
    const res = testResolveDriverVehicle(driver);
    assert.equal(res.hasBus, true);
    assert.equal(res.busNumber, '99');
    assert.equal(res.displayBus, 'Bus 99');
  });

  await t.test('5. Resolves vehicle assigned via Route driver assignment', () => {
    const driver = { id: 'DRV-15', name: 'Karthik S' };
    const res = testResolveDriverVehicle(driver);
    assert.equal(res.hasBus, true);
    assert.equal(res.busNumber, '15');
    assert.equal(res.displayBus, 'Bus 15');
    assert.equal(res.routeName, 'West Route');
  });

  await t.test('6. Prevents duplicate "Bus Bus" label formatting', () => {
    const driver = { id: 'DRV-20', name: 'Anand', assignedBus: 'Bus 20' };
    const res = testResolveDriverVehicle(driver);
    assert.equal(res.hasBus, true);
    assert.equal(res.displayBus, 'Bus 20');
  });

  await t.test('7. Handles unassigned, N/A, and empty drivers cleanly', () => {
    const driverUnassigned = { id: 'DRV-00', name: 'New Driver', assignedBus: 'Unassigned' };
    const res1 = testResolveDriverVehicle(driverUnassigned);
    assert.equal(res1.hasBus, false);
    assert.equal(res1.displayBus, 'Unassigned');

    const driverNA = { id: 'DRV-00B', name: 'Other Driver', assignedBus: '--' };
    const res2 = testResolveDriverVehicle(driverNA);
    assert.equal(res2.hasBus, false);
    assert.equal(res2.displayBus, 'Unassigned');

    const resNull = testResolveDriverVehicle(null);
    assert.equal(resNull.hasBus, false);
    assert.equal(resNull.displayBus, 'Unassigned');
  });
});

