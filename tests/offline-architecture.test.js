import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('OFFLINE-FIRST ARCHITECTURE: Core Infrastructure & Resilience Verification', async (t) => {
  const dbJsPath = path.resolve('js/offline/db.js');
  const connectivityJsPath = path.resolve('js/offline/connectivity.js');
  const syncManagerJsPath = path.resolve('js/offline/sync-manager.js');
  const repositoryJsPath = path.resolve('js/offline/repository.js');
  const bannerJsPath = path.resolve('js/offline/banner.js');
  const bannerCssPath = path.resolve('css/offline-banner.css');
  const swJsPath = path.resolve('public/sw.js');

  assert.ok(fs.existsSync(dbJsPath), 'js/offline/db.js must exist');
  assert.ok(fs.existsSync(connectivityJsPath), 'js/offline/connectivity.js must exist');
  assert.ok(fs.existsSync(syncManagerJsPath), 'js/offline/sync-manager.js must exist');
  assert.ok(fs.existsSync(repositoryJsPath), 'js/offline/repository.js must exist');
  assert.ok(fs.existsSync(bannerJsPath), 'js/offline/banner.js must exist');
  assert.ok(fs.existsSync(bannerCssPath), 'css/offline-banner.css must exist');
  assert.ok(fs.existsSync(swJsPath), 'public/sw.js must exist');

  const dbJsContent = fs.readFileSync(dbJsPath, 'utf8');
  const connectivityContent = fs.readFileSync(connectivityJsPath, 'utf8');
  const syncContent = fs.readFileSync(syncManagerJsPath, 'utf8');
  const repoContent = fs.readFileSync(repositoryJsPath, 'utf8');
  const bannerContent = fs.readFileSync(bannerJsPath, 'utf8');
  const bannerCssContent = fs.readFileSync(bannerCssPath, 'utf8');
  const swContent = fs.readFileSync(swJsPath, 'utf8');

  await t.test('1. IndexedDB storage layer exports cache and outbox primitives', () => {
    assert.match(dbJsContent, /export function openOfflineDB/, 'Must export openOfflineDB');
    assert.match(dbJsContent, /export async function cacheGet/, 'Must export cacheGet');
    assert.match(dbJsContent, /export async function cacheSet/, 'Must export cacheSet');
    assert.match(dbJsContent, /export async function outboxAdd/, 'Must export outboxAdd');
    assert.match(dbJsContent, /export async function outboxGetPending/, 'Must export outboxGetPending');
    assert.match(dbJsContent, /export async function outboxUpdate/, 'Must export outboxUpdate');
    assert.match(dbJsContent, /export async function outboxRemove/, 'Must export outboxRemove');
  });

  await t.test('2. Cache entries contain required metadata (data, cachedAt, version)', () => {
    assert.match(dbJsContent, /cachedAt:\s*Date\.now\(\)/, 'Cache items must include timestamp');
    assert.match(dbJsContent, /version/, 'Cache items must include version');
    assert.match(dbJsContent, /key[,:]/, 'Cache items must store key');
  });

  await t.test('3. ConnectivityService does not blindly trust navigator.onLine and probes reachability', () => {
    assert.match(connectivityContent, /class ConnectivityService/, 'Must define ConnectivityService');
    assert.match(connectivityContent, /async checkReachability/, 'Must provide active reachability check');
    assert.match(connectivityContent, /subscribe\(/, 'Must provide pub/sub subscription mechanism');
    assert.match(connectivityContent, /lastSuccessfulSync/, 'Must track lastSuccessfulSync');
    assert.match(connectivityContent, /isServerReachable/, 'Must track true server reachability');
  });

  await t.test('4. SyncManager enforces idempotency and exponential backoff retry', () => {
    assert.match(syncContent, /class SyncManager/, 'Must define SyncManager');
    assert.match(syncContent, /syncInProgress/, 'Must have concurrency guard to prevent overlapping syncs');
    assert.match(syncContent, /processOfflineQueue/, 'Must provide processOfflineQueue method');
    assert.match(syncContent, /Math\.pow\(2,\s*nextRetry\)/, 'Must implement exponential backoff');
    assert.match(syncContent, /maxRetries\s*=\s*\d+/, 'Must limit maximum retries');
    assert.match(syncContent, /setDoc\(doc\(firestore,\s*['"]reports['"],\s*reportId\)/, 'Must write using client UUID doc ID for idempotency');
  });

  await t.test('5. Repository implements Stale-While-Revalidate pattern', () => {
    assert.match(repoContent, /class NexRideRepository/, 'Must define NexRideRepository');
    assert.match(repoContent, /getWithSWR/, 'Must provide SWR fetch method');
    assert.match(repoContent, /cacheGet\(key\)/, 'Must read from local cache first');
    assert.match(repoContent, /cacheSet\(key,\s*freshData\)/, 'Must update cache upon successful server fetch');
    assert.match(repoContent, /isFromCache/, 'Must flag whether data originated from local cache');
    assert.match(repoContent, /outboxAdd\(/, 'Must queue mutations to outbox when offline');
  });

  await t.test('6. UI notification banner matches design mockups', () => {
    // Check styles
    assert.match(bannerCssContent, /#nexride-offline-banner/, 'Must define #nexride-offline-banner element');
    assert.match(bannerCssContent, /\.banner-offline/, 'Must style offline banner');
    assert.match(bannerCssContent, /\.banner-online/, 'Must style online banner');
    assert.match(bannerCssContent, /border-radius:\s*0\s*0\s*20px\s*20px/, 'Must have rounded bottom corners');
    assert.match(bannerCssContent, /#F6BE48|#F5BA42/, 'Must use golden amber color for offline state');
    assert.match(bannerCssContent, /#22C55E|#16A34A/, 'Must use vibrant green for back online state');

    // Check controller
    assert.match(bannerContent, /No Internet Connection/, 'Must support "No Internet Connection" message');
    assert.match(bannerContent, /Still no internet connection/, 'Must support "Still no internet connection" retry message');
    assert.match(bannerContent, /Back Online/, 'Must support "Back Online" message');
    assert.match(bannerContent, /Refresh/, 'Must include Refresh action button');
  });

  await t.test('7. Service Worker caches static App Shell and bypasses Firebase API calls', () => {
    assert.match(swContent, /const STATIC_ASSETS =/, 'Must declare static assets list');
    assert.match(swContent, /'\/index\.html'/, 'Must cache index.html');
    assert.match(swContent, /'\/css\/style\.css'/, 'Must cache style.css');
    assert.match(swContent, /'\/css\/offline-banner\.css'/, 'Must cache offline-banner.css');
    assert.match(swContent, /firestore\.googleapis\.com/, 'Must bypass Firestore API calls');
    assert.match(swContent, /identitytoolkit\.googleapis\.com/, 'Must bypass Firebase Auth API calls');
  });

  await t.test('8. Returns header color to default after user is online', () => {
    // Check styles: banner-default provides clean white / default header styling
    assert.match(bannerCssContent, /\.banner-default/, 'Must style default header color on banner');
    assert.match(bannerCssContent, /#nexride-offline-banner[\s\S]*background-color:\s*#FFFFFF/, 'Default header background must be #FFFFFF');

    // Check controller: resets theme color and restores default header
    assert.match(bannerContent, /showDefaultHeaderAndDismiss/, 'Must provide showDefaultHeaderAndDismiss method');
    assert.match(bannerContent, /resetHeaderToDefault/, 'Must provide resetHeaderToDefault method');
    assert.match(bannerContent, /resetThemeColorToDefault/, 'Must restore browser theme-color to default');
    assert.match(bannerContent, /banner-default/, 'Must apply banner-default before dismissal');
  });
});
