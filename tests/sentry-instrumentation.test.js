import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('SENTRY INSTRUMENTATION: Sentry Browser SDK Integration Verification', async (t) => {
  const instrumentJsPath = path.resolve('js/instrument.js');
  const mainJsPath = path.resolve('js/main.js');
  const adminJsPath = path.resolve('admin/admin.js');
  const packageJsonPath = path.resolve('package.json');

  assert.ok(fs.existsSync(instrumentJsPath), 'js/instrument.js must exist');
  assert.ok(fs.existsSync(mainJsPath), 'js/main.js must exist');
  assert.ok(fs.existsSync(adminJsPath), 'admin/admin.js must exist');

  const instrumentContent = fs.readFileSync(instrumentJsPath, 'utf8');
  const mainContent = fs.readFileSync(mainJsPath, 'utf8');
  const adminContent = fs.readFileSync(adminJsPath, 'utf8');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  await t.test('@sentry/browser is installed in dependencies', () => {
    assert.ok(
      packageJson.dependencies['@sentry/browser'],
      '@sentry/browser must be present in dependencies'
    );
  });

  await t.test('js/instrument.js configures Sentry with error monitoring, tracing, and replay', () => {
    assert.match(
      instrumentContent,
      /import\s+\*\s+as\s+Sentry\s+from\s+['"]@sentry\/browser['"]/,
      'Must import @sentry/browser'
    );
    assert.match(
      instrumentContent,
      /Sentry\.browserTracingIntegration\(\)/,
      'Must configure browserTracingIntegration'
    );
    assert.match(
      instrumentContent,
      /Sentry\.replayIntegration\(/,
      'Must configure replayIntegration'
    );
    assert.match(
      instrumentContent,
      /VITE_SENTRY_DSN/,
      'Must use VITE_SENTRY_DSN environment variable'
    );
  });

  await t.test('js/instrument.js is imported as the very first module in main.js and admin.js', () => {
    const mainLines = mainContent.split('\n').filter(l => l.trim().length > 0);
    assert.match(
      mainLines[0],
      /import\s+['"]\.\/instrument\.js['"]/,
      'main.js must import ./instrument.js as first active line'
    );

    const adminLines = adminContent.split('\n').filter(l => l.trim().length > 0 && !l.startsWith('//'));
    assert.match(
      adminLines[0],
      /import\s+['"]\.\.\/js\/instrument\.js['"]/,
      'admin.js must import ../js/instrument.js as first active statement'
    );
  });
});
