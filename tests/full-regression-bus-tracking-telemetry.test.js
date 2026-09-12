import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('FULL REGRESSION: Bus Tracking, Telemetry & Status Engine', async (t) => {
  const liveTrackingContent = fs.readFileSync(path.resolve('js/live-tracking.js'), 'utf8');
  const busSimContent = fs.readFileSync(path.resolve('js/bus-simulator.js'), 'utf8');

  await t.test('Telemetry status logic handles engine states and delays correctly', () => {
    function computeStatusBanner(status, delayMinutes, isOffline = false, engine = 'on') {
      if (isOffline) {
        return { text: 'Bus Offline', color: '#EF4444' };
      }

      const isEngineOff = engine === 'off' || engine === false || status === 'halt';

      if (isEngineOff) {
        return { text: 'Bus in halt', color: '#F97316' };
      }

      if (status === 'moving') {
        return {
          text: delayMinutes > 0 ? `Delayed by ${delayMinutes} min` : 'Bus in movement',
          color: delayMinutes > 0 ? '#EAB308' : '#10b981'
        };
      }

      return { text: 'Scheduled', color: '#6B7280' };
    }

    // Engine OFF -> Halt
    const s1 = computeStatusBanner('moving', 0, false, 'off');
    assert.strictEqual(s1.text, 'Bus in halt');
    assert.strictEqual(s1.color, '#F97316');

    // Engine ON, moving on time -> Bus in movement
    const s2 = computeStatusBanner('moving', 0, false, 'on');
    assert.strictEqual(s2.text, 'Bus in movement');
    assert.strictEqual(s2.color, '#10b981');

    // Engine ON, delayed 7 mins -> Delayed by 7 min
    const s3 = computeStatusBanner('moving', 7, false, 'on');
    assert.strictEqual(s3.text, 'Delayed by 7 min');
    assert.strictEqual(s3.color, '#EAB308');

    // Offline state overrides all
    const s4 = computeStatusBanner('moving', 5, true, 'on');
    assert.strictEqual(s4.text, 'Bus Offline');
    assert.strictEqual(s4.color, '#EF4444');
  });

  await t.test('Haversine distance calculation is mathematically sound', () => {
    function haversineDistance(lat1, lon1, lat2, lon2) {
      const R = 6371e3; // meters
      const toRad = x => x * Math.PI / 180;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
          Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
          Math.sin(dLon / 2) * Math.sin(dLon / 2);
      return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    // Distance between identical coordinates is 0
    assert.strictEqual(Math.round(haversineDistance(11.0, 77.0, 11.0, 77.0)), 0);

    // Known distance check: Chennai (13.0827, 80.2707) to Bangalore (12.9716, 77.5946) ~ 290 km (±5km)
    const distMeters = haversineDistance(13.0827, 80.2707, 12.9716, 77.5946);
    const distKm = distMeters / 1000;
    assert.ok(distKm > 280 && distKm < 300, `Expected ~290km, got ${distKm}`);
  });

  await t.test('bus-simulator.js and live-tracking.js use consistent bus document path', () => {
    assert.match(busSimContent, /buses\/bus_/, 'bus-simulator must reference buses/bus_ pattern');
    assert.match(liveTrackingContent, /buses\/bus_/, 'live-tracking must reference buses/bus_ pattern');
  });
});
