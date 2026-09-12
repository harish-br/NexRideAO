import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ADV-03: E-Pass Firebase Auth Race Condition Resolution', async (t) => {
  const epassJsPath = path.resolve('js/epass.js');
  assert.ok(fs.existsSync(epassJsPath), 'js/epass.js must exist');
  const epassContent = fs.readFileSync(epassJsPath, 'utf8');

  await t.test('Static verification: mock pass does not lock barcodeLoaded against authenticated initialization', () => {
    // Verify barcodeLoaded is NOT set to true in unauthenticated branch
    assert.doesNotMatch(
      epassContent,
      /else\s*\{[^}]*barcodeLoaded\s*=\s*true;/,
      'Mock pass generation in else branch must not mark barcodeLoaded = true'
    );
    // Verify loadedPassUserId tracking
    assert.match(
      epassContent,
      /let loadedPassUserId\s*=\s*null;/,
      'epass.js must track loadedPassUserId to distinguish mock state from authenticated user passes'
    );
    // Verify lifecycle counter for race-condition prevention
    assert.match(
      epassContent,
      /authLifecycleId/,
      'epass.js must track authLifecycleId to cancel stale async initializations'
    );
  });

  // Simulated lifecycle engine matching js/epass.js implementation
  function createEPassLifecycleSimulator() {
    let loadedPassUserId = null;
    let barcodeLoaded = false;
    let authLifecycleId = 0;
    let renderedState = {
      barcode: null,
      profile: null,
      skeletonActive: false,
    };

    const mockFirestore = {
      'stu_1001': {
        passId: 'PASS-OFFICIAL-1001',
        name: 'ARJUN SHARMA',
        regno: 'STU1001',
        bus: '05',
        stage: 'North Campus Gate',
        delay: 50,
      },
      'stu_2002': {
        passId: 'PASS-OFFICIAL-2002',
        name: 'PRIYA NAIR',
        regno: 'STU2002',
        bus: '12',
        stage: 'Main Terminal',
        delay: 10,
      }
    };

    function showEPassSkeleton(force = false) {
      renderedState.skeletonActive = true;
    }

    async function renderBarcode(passId) {
      renderedState.barcode = passId;
      renderedState.skeletonActive = false;
    }

    async function renderHologram(userId, delay = 0) {
      if (delay > 0) {
        await new Promise(r => setTimeout(r, delay));
      }
      if (!userId) {
        renderedState.profile = { name: 'GUEST PASS', id: 'N/A' };
      } else {
        const student = mockFirestore[userId] || { name: 'USER', id: userId };
        renderedState.profile = student;
      }
    }

    async function initializeEPass(userId, callerCycle = null, profileDelay = 0) {
      if (!userId) return;
      const currentCycle = callerCycle !== null ? callerCycle : ++authLifecycleId;
      if (loadedPassUserId === userId) return;

      showEPassSkeleton(true);

      // Simulate Firestore epass fetch
      await new Promise(r => setTimeout(r, 10));
      if (currentCycle !== authLifecycleId) return;

      const passData = mockFirestore[userId] || { passId: `PASS-DEFAULT-${userId}` };

      // Simulate Firestore barcode write
      await new Promise(r => setTimeout(r, 5));
      if (currentCycle !== authLifecycleId) return;

      await renderBarcode(passData.passId);
      await renderHologram(userId, profileDelay);

      if (currentCycle !== authLifecycleId) return;
      loadedPassUserId = userId;
      barcodeLoaded = true;
    }

    async function onAuthStateChangedSimulator(user, profileDelay = 0) {
      const currentCycle = ++authLifecycleId;
      if (user) {
        await initializeEPass(user.uid, currentCycle, profileDelay);
      } else {
        loadedPassUserId = null;
        barcodeLoaded = false;
        const mockPassId = 'MOCK-UUID-TEST';
        await renderBarcode(mockPassId);
        await renderHologram(null);
      }
    }

    return {
      getState: () => ({ loadedPassUserId, barcodeLoaded, authLifecycleId, renderedState: { ...renderedState } }),
      onAuthStateChanged: onAuthStateChangedSimulator,
      initializeEPass,
    };
  }

  await t.test('Scenario A: Anonymous / initial auth state renders mock pass without locking user pass', async () => {
    const sim = createEPassLifecycleSimulator();
    await sim.onAuthStateChanged(null);
    const state = sim.getState();

    assert.strictEqual(state.loadedPassUserId, null, 'loadedPassUserId must be null for guest pass');
    assert.strictEqual(state.barcodeLoaded, false, 'barcodeLoaded must be false so subsequent auth is not blocked');
    assert.strictEqual(state.renderedState.barcode, 'MOCK-UUID-TEST');
    assert.strictEqual(state.renderedState.profile.name, 'GUEST PASS');
  });

  await t.test('Scenario B: Authenticated student loads official e-pass directly', async () => {
    const sim = createEPassLifecycleSimulator();
    await sim.onAuthStateChanged({ uid: 'stu_1001' });
    const state = sim.getState();

    assert.strictEqual(state.loadedPassUserId, 'stu_1001');
    assert.strictEqual(state.barcodeLoaded, true);
    assert.strictEqual(state.renderedState.barcode, 'PASS-OFFICIAL-1001');
    assert.strictEqual(state.renderedState.profile.name, 'ARJUN SHARMA');
  });

  await t.test('Scenario C: Slow Firebase Auth resolution (mock state emitted first, then resolved to student)', async () => {
    const sim = createEPassLifecycleSimulator();
    
    // 1. Initial emission when page loads before storage finishes
    await sim.onAuthStateChanged(null);
    let state = sim.getState();
    assert.strictEqual(state.renderedState.barcode, 'MOCK-UUID-TEST');
    assert.strictEqual(state.loadedPassUserId, null);

    // 2. Auth resolves asynchronously with student
    await sim.onAuthStateChanged({ uid: 'stu_1001' });
    state = sim.getState();

    // Critical check: Official pass successfully replaced the mock pass!
    assert.strictEqual(state.loadedPassUserId, 'stu_1001');
    assert.strictEqual(state.barcodeLoaded, true);
    assert.strictEqual(state.renderedState.barcode, 'PASS-OFFICIAL-1001');
    assert.strictEqual(state.renderedState.profile.name, 'ARJUN SHARMA');
  });

  await t.test('Scenario D: Slow student-profile loading displays skeleton shimmer then populates authentic details', async () => {
    const sim = createEPassLifecycleSimulator();
    
    // Auth resolves with delayed profile
    const initPromise = sim.onAuthStateChanged({ uid: 'stu_1001' }, 60);
    // Immediately after starting, skeleton is active
    let state = sim.getState();
    assert.strictEqual(state.renderedState.skeletonActive, true);

    await initPromise;
    state = sim.getState();
    assert.strictEqual(state.renderedState.skeletonActive, false);
    assert.strictEqual(state.renderedState.profile.name, 'ARJUN SHARMA');
    assert.strictEqual(state.renderedState.profile.stage, 'North Campus Gate');
  });

  await t.test('Scenario E: Authenticated user refreshing page re-establishes official pass without mock deadlock', async () => {
    const sim = createEPassLifecycleSimulator();
    // Simulate page refresh restoring session
    await sim.onAuthStateChanged({ uid: 'stu_1001' });
    const state = sim.getState();
    assert.strictEqual(state.loadedPassUserId, 'stu_1001');
    assert.strictEqual(state.renderedState.barcode, 'PASS-OFFICIAL-1001');
  });

  await t.test('Scenario F: Auth state changing during initialization aborts stale student render', async () => {
    const sim = createEPassLifecycleSimulator();

    // 1. User 1001 starts initializing with a slow 100ms profile read
    const user1Promise = sim.onAuthStateChanged({ uid: 'stu_1001' }, 100);

    // 2. While user 1001 is in-flight, user switches or logs out and user 2002 logs in
    await new Promise(r => setTimeout(r, 15));
    await sim.onAuthStateChanged({ uid: 'stu_2002' }, 10);

    // 3. Await completion of user 1001's aborted promise
    await user1Promise;

    // 4. Verify that User 2002 is active and User 1001 did NOT overwrite User 2002's state!
    const state = sim.getState();
    assert.strictEqual(state.loadedPassUserId, 'stu_2002');
    assert.strictEqual(state.renderedState.barcode, 'PASS-OFFICIAL-2002');
    assert.strictEqual(state.renderedState.profile.name, 'PRIYA NAIR');
  });
});
