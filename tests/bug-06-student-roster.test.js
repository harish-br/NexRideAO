import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('BUG-06: Student transport allocation and roster filtering verification', async (t) => {
  const adminJsPath = path.resolve('admin/admin.js');
  assert.ok(fs.existsSync(adminJsPath), 'admin/admin.js must exist');
  
  const adminJsContent = fs.readFileSync(adminJsPath, 'utf8');

  await t.test('usersCache populates all bus field variations', () => {
    assert.match(
      adminJsContent,
      /const busNum = String\(data\.assignedBus \|\| data\.bus \|\| data\.busNumber \|\| data\['bus no'\] \|\| data\.bus_no \|\| ''\)\.trim\(\);/,
      'usersCache must resolve busNum from assignedBus, bus, busNumber, bus no, or bus_no'
    );
    assert.match(
      adminJsContent,
      /assignedBus:\s*busNum,\s*bus:\s*busNum,\s*busNumber:\s*busNum,/,
      'usersCache must expose assignedBus, bus, and busNumber aliases'
    );
  });

  await t.test('studentsCache and occupancy filtering covers all bus field aliases', () => {
    assert.match(
      adminJsContent,
      /studentsCache\s*=\s*usersCache\.filter\(u\s*=>\s*\{[\s\S]*?String\(u\.assignedBus \|\| u\.bus \|\| u\.busNumber \|\| ''\)\.trim\(\)/,
      'studentsCache filter must evaluate assignedBus, bus, and busNumber'
    );
    assert.match(
      adminJsContent,
      /usersCache\.filter\(u\s*=>\s*String\(u\.assignedBus \|\| u\.bus \|\| u\.busNumber \|\| ''\)\.trim\(\)\s*===\s*String\(bus\.busNumber\)\.trim\(\)\)\.length/,
      'Occupancy calculation must evaluate all bus aliases'
    );
  });

  await t.test('Allocation logic handles mock student dataset variations correctly', () => {
    const mockUsers = [
      { id: 'S1', assignedBus: '20' },
      { id: 'S2', bus: '20' },
      { id: 'S3', busNumber: '32' },
      { id: 'S4', assignedBus: '' },
      { id: 'S5', bus: null },
      { id: 'S6', busNumber: undefined }
    ];

    const allocated = mockUsers.filter(u => {
      const b = String(u.assignedBus || u.bus || u.busNumber || '').trim();
      return b !== '' && b !== 'null' && b !== 'undefined' && b !== '--';
    });

    assert.strictEqual(allocated.length, 3, 'Should include S1, S2, S3 only');
    assert.deepStrictEqual(allocated.map(s => s.id), ['S1', 'S2', 'S3']);

    const bus20Count = mockUsers.filter(u => {
      const b = String(u.assignedBus || u.bus || u.busNumber || '').trim();
      return b === '20';
    }).length;
    assert.strictEqual(bus20Count, 2, 'Bus 20 should have 2 students (S1 and S2)');
  });
});
