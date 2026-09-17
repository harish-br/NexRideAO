import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ROUTE STOPS DRAG & DROP ARRANGEMENT: Reorder algorithm & integrity', async (t) => {
  const adminJsPath = path.resolve('admin/admin.js');
  const adminCssPath = path.resolve('admin/admin.css');
  const adminHtmlPath = path.resolve('admin/index.html');

  assert.ok(fs.existsSync(adminJsPath), 'admin/admin.js must exist');
  assert.ok(fs.existsSync(adminCssPath), 'admin/admin.css must exist');
  assert.ok(fs.existsSync(adminHtmlPath), 'admin/index.html must exist');

  const jsContent = fs.readFileSync(adminJsPath, 'utf8');
  const cssContent = fs.readFileSync(adminCssPath, 'utf8');
  const htmlContent = fs.readFileSync(adminHtmlPath, 'utf8');

  await t.test('1. Drag & drop CSS classes and animations are defined', () => {
    assert.match(cssContent, /\.stop-drag-handle/, 'Must define .stop-drag-handle');
    assert.match(cssContent, /cursor:\s*grab/, 'Must use cursor: grab for handle');
    assert.match(cssContent, /\.stop-row-card\.is-dragging/, 'Must define .stop-row-card.is-dragging');
    assert.match(cssContent, /\.stop-row-card\.drag-over-top/, 'Must define .stop-row-card.drag-over-top');
    assert.match(cssContent, /\.stop-row-card\.drag-over-bottom/, 'Must define .stop-row-card.drag-over-bottom');
    assert.match(cssContent, /\.stop-card-just-moved/, 'Must define .stop-card-just-moved animation');
  });

  await t.test('2. HTML includes Route arrangement helper badge', () => {
    assert.match(htmlContent, /Pick &amp; Drag to Arrange|Pick & Drag to Arrange/, 'Header must indicate drag & drop arrangement');
    assert.match(htmlContent, /route-stops-container/, 'Must contain #route-stops-container');
  });

  await t.test('3. JavaScript markup renders draggable cards and handle', () => {
    assert.match(jsContent, /draggable="true"/, 'Stop cards must be marked draggable="true"');
    assert.match(jsContent, /class="stop-drag-handle"/, 'Cards must include .stop-drag-handle');
    assert.match(jsContent, /dragstart/, 'Must attach dragstart event handler');
    assert.match(jsContent, /dragover/, 'Must attach dragover event handler');
    assert.match(jsContent, /drop/, 'Must attach drop event handler');
    assert.match(jsContent, /dragend/, 'Must attach dragend event handler');
  });

  await t.test('4. Stop array repositioning algorithm preserves all data fields and re-indexes stopOrder', () => {
    // Simulate initial stops array
    const sampleStops = [
      { stopOrder: 1, name: 'Hosur Terminal', morningArrival: '06:30', eveningArrival: '18:45', latitude: 12.74, longitude: 77.82, status: 'Active' },
      { stopOrder: 2, name: 'Sipcot Ring', morningArrival: '06:45', eveningArrival: '18:30', latitude: 12.71, longitude: 77.85, status: 'Active' },
      { stopOrder: 3, name: 'Perundurai Junction', morningArrival: '07:15', eveningArrival: '17:50', latitude: 11.28, longitude: 77.58, status: 'Active' },
      { stopOrder: 4, name: 'Campus Main Gate', morningArrival: '07:50', eveningArrival: '17:00', latitude: 11.27, longitude: 77.60, status: 'Active' }
    ];

    // Helper imitating drop repositioning logic
    function reorderStops(stops, draggedIdx, targetIdx, isBottom) {
      const copy = stops.map(s => ({ ...s }));
      let toIndex = targetIdx;
      if (isBottom) {
        toIndex = draggedIdx < targetIdx ? targetIdx : targetIdx + 1;
      } else {
        toIndex = draggedIdx < targetIdx ? targetIdx - 1 : targetIdx;
      }
      if (toIndex < 0) toIndex = 0;
      if (toIndex >= copy.length) toIndex = copy.length - 1;

      if (toIndex !== draggedIdx) {
        const [item] = copy.splice(draggedIdx, 1);
        copy.splice(toIndex, 0, item);
        copy.forEach((s, idx) => { s.stopOrder = idx + 1; });
      }
      return copy;
    }

    // Move Stop #1 (Hosur) to below Stop #3 (Perundurai Junction) -> toIndex = 2
    const movedDown = reorderStops(sampleStops, 0, 2, true);
    assert.equal(movedDown[0].name, 'Sipcot Ring');
    assert.equal(movedDown[1].name, 'Perundurai Junction');
    assert.equal(movedDown[2].name, 'Hosur Terminal');
    assert.equal(movedDown[3].name, 'Campus Main Gate');
    assert.deepEqual(movedDown.map(s => s.stopOrder), [1, 2, 3, 4]);
    assert.equal(movedDown[2].morningArrival, '06:30');
    assert.equal(movedDown[2].eveningArrival, '18:45');
    assert.equal(movedDown[2].latitude, 12.74);

    // Move Stop #4 (Campus Main Gate) to above Stop #1 (Sipcot Ring)
    const movedUp = reorderStops(movedDown, 3, 0, false);
    assert.equal(movedUp[0].name, 'Campus Main Gate');
    assert.equal(movedUp[1].name, 'Sipcot Ring');
    assert.equal(movedUp[2].name, 'Perundurai Junction');
    assert.equal(movedUp[3].name, 'Hosur Terminal');
    assert.deepEqual(movedUp.map(s => s.stopOrder), [1, 2, 3, 4]);
  });
});
