import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ADVERSARIAL QA: Automated Vulnerability & Edge Case Proof-of-Concepts', async (t) => {
  const busSearchContent = fs.readFileSync(path.resolve('js/bus-search.js'), 'utf8');
  const adminJsContent = fs.readFileSync(path.resolve('admin/admin.js'), 'utf8');
  const epassContent = fs.readFileSync(path.resolve('js/epass.js'), 'utf8');
  const liveTrackingContent = fs.readFileSync(path.resolve('js/live-tracking.js'), 'utf8');
  const reportContent = fs.readFileSync(path.resolve('js/report.js'), 'utf8');

  await t.test('ADV-01: bus-search.js highlightText crashes on regex special characters', () => {
    // Current unescaped implementation in bus-search.js line 535:
    function vulnerableHighlightText(text, query) {
      if (!query) return text;
      const regex = new RegExp(`(${query})`, "gi");
      return text.replace(regex, `<span class="bs-highlight">$1</span>`);
    }

    // Normal search passes
    assert.strictEqual(vulnerableHighlightText('Route 20', '20'), 'Route <span class="bs-highlight">20</span>');

    // Adversarial inputs throw SyntaxError
    const specialChars = ['(', '[', '*', '+', '?', '\\', '(()'];
    for (const char of specialChars) {
      assert.throws(() => {
        vulnerableHighlightText('Stop 1 (Main Gate)', char);
      }, /SyntaxError: Invalid regular expression/);
    }
  });

  await t.test('ADV-02: admin.js inline onclick string concatenation breaks on single quotes', () => {
    // Simulated row generation from admin.js line 2094
    function renderStudentAction(stu) {
      return `<button class="btn-action-icon" onclick="alert('Student: ${stu.name}\\nID: ${stu.id}\\nBus: ${stu.assignedBus}\\nPickup: ${stu.pickupStop}')">Profile</button>`;
    }

    const studentWithQuote = {
      name: "O'Connor",
      id: "NEC-101",
      assignedBus: "20",
      pickupStop: "Main Gate"
    };

    const renderedHtml = renderStudentAction(studentWithQuote);

    // Notice unescaped quote breaks the JS alert call:
    // onclick="alert('Student: O'Connor\n...')"
    const onclickAttr = renderedHtml.match(/onclick="([^"]*)"/)[1];
    
    // Attempting to parse the onclick string with Function or eval fails due to syntax error
    assert.throws(() => {
      new Function(onclickAttr);
    }, /SyntaxError/);
  });

  await t.test('ADV-03: epass.js race condition locks student into mock pass upon late auth initialization', () => {
    let barcodeLoaded = false;
    let currentPassId = null;

    // 1. Initial onAuthStateChanged fires with null (auth verifying in background)
    function onAuthInitial(user) {
      if (!user) {
        currentPassId = 'MOCK-PASS-123';
        barcodeLoaded = true; // Flips flag before user profile loads!
      }
    }

    // 2. User credentials arrive from IndexedDB
    function onAuthResolved(user) {
      if (user) {
        if (barcodeLoaded) return; // Silent abort!
        currentPassId = 'REAL-USER-PASS-' + user.uid;
      }
    }

    onAuthInitial(null);
    assert.strictEqual(barcodeLoaded, true);
    assert.strictEqual(currentPassId, 'MOCK-PASS-123');

    onAuthResolved({ uid: 'student_999' });
    // Bug confirmed: Real user pass was rejected because barcodeLoaded was already true
    assert.strictEqual(currentPassId, 'MOCK-PASS-123');
    assert.notStrictEqual(currentPassId, 'REAL-USER-PASS-student_999');
  });

  await t.test('ADV-04: live-tracking.js time window calculation throws on non-colon format or missing arrival time', () => {
    const checkWindow = (dep, arr, currentMinutes) => {
      if (!dep || !arr) return false;
      const [dh, dm] = dep.split(':').map(Number);
      const [ah, am] = arr.split(':').map(Number);
      const startM = dh * 60 + dm;
      const endM = ah * 60 + am;
      return currentMinutes >= startM && currentMinutes <= endM;
    };

    // Adversarial non-string or malformed inputs throw TypeError
    assert.throws(() => {
      checkWindow(800, 900, 500); // Numbers instead of strings
    }, /TypeError: dep\.split is not a function/);

    // AM/PM strings cause NaN minutes
    const [h, m] = '08:00 AM'.split(':').map(Number);
    assert.strictEqual(isNaN(m), true); // Number('00 AM') is NaN
  });

  await t.test('ADV-05: report.js unescaped extraFields interpolation injects raw HTML into DOM', () => {
    const maliciousExtraFields = {
      driverNotes: '<img src="x" onerror="alert(1)">'
    };

    // Simulated rendering from report.js line 1969
    const rows = [];
    Object.entries(maliciousExtraFields).forEach(([k, v]) => {
      rows.push(`<span style="color:#64748B; text-transform:capitalize;">${k.replace(/([A-Z])/g, ' $1')}:</span><span style="font-weight:600; color:#1E293B;">${v}</span>`);
    });

    const outputHtml = rows.join('');
    assert.ok(outputHtml.includes('<img src="x" onerror="alert(1)">'), 'Raw script/HTML tag was not escaped');
  });

  await t.test('ADV-06: popstate handler is absent from application JavaScript', () => {
    const jsDir = path.resolve('js');
    const jsFiles = fs.readdirSync(jsDir).filter(f => f.endsWith('.js'));
    let foundPopstate = false;

    for (const f of jsFiles) {
      const content = fs.readFileSync(path.join(jsDir, f), 'utf8');
      if (content.includes('popstate') || content.includes('onpopstate')) {
        foundPopstate = true;
        break;
      }
    }

    assert.strictEqual(foundPopstate, false, 'No popstate listener is implemented for hardware back button navigation');
  });
});
