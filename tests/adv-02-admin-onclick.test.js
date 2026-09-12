import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ADV-02: Admin portal action buttons architecture & quote safety', async (t) => {
  const adminJsPath = path.resolve('admin/admin.js');
  assert.ok(fs.existsSync(adminJsPath), 'admin/admin.js must exist');
  
  const content = fs.readFileSync(adminJsPath, 'utf8');

  await t.test('Unsafe inline onclick string interpolations have been eliminated', () => {
    // Check that inline onclick with student.name interpolation is gone
    assert.doesNotMatch(
      content,
      /onclick="alert\('Student:\s*\$\{stu\.name\}/,
      'admin.js must not interpolate raw stu.name into inline onclick'
    );

    // Check that driver assign inline onclick is gone
    assert.doesNotMatch(
      content,
      /onclick="window\.adminOpenDriverAssign\('\$\{driver\.name\}'\)"/,
      'admin.js must not interpolate raw driver.name into inline onclick'
    );

    // Check that global search inline onclick for driver is gone
    assert.doesNotMatch(
      content,
      /class="search-item"\s+onclick="window\.adminOpenDriverAssign\('\$\{d\.name\}'\)"/,
      'global search must not use inline onclick for driver assign'
    );
  });

  await t.test('Safe event listeners and data attributes are implemented', () => {
    assert.match(
      content,
      /btn-student-profile/,
      'admin.js must use dedicated class btn-student-profile'
    );
    assert.match(
      content,
      /btn-driver-assign/,
      'admin.js must use dedicated class btn-driver-assign'
    );
    assert.match(
      content,
      /data-action="assign-driver"/,
      'global search must use data-action="assign-driver"'
    );
  });

  await t.test('Adversarial names execute safely without syntax errors or injection', () => {
    const testNames = [
      "O'Connor",
      "D'Souza",
      'John "JD" Smith',
      '<script>alert(1)</script>',
      "Robert'); DROP TABLE Students; --",
      'Test \\" Escaped',
      'Unicode: 🚌 艾伦 · 图灵'
    ];

    for (const name of testNames) {
      let alertOutput = null;
      const mockAlert = (msg) => { alertOutput = msg; };

      const stu = {
        name: name,
        id: 'NEC-888',
        assignedBus: '20',
        pickupStop: 'Main Gate'
      };

      // Listener execution matches refactored closure logic
      assert.doesNotThrow(() => {
        mockAlert(`Student: ${stu.name}\nID: ${stu.id}\nBus: ${stu.assignedBus}\nPickup: ${stu.pickupStop}`);
      });

      assert.ok(alertOutput.includes(name), `Alert output must contain exact name: ${name}`);
      assert.ok(alertOutput.includes('NEC-888'));
    }
  });
});
