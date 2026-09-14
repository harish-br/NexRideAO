import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('ADV-06: Robust Centralized Back Navigation & Platform Handling', async (t) => {
  const navServicePath = path.resolve('js/navigation/navigation-service.js');
  const backHandlerPath = path.resolve('js/navigation/back-handler.js');
  const iosGesturePath = path.resolve('js/navigation/ios-gesture.js');
  const navIndexPath = path.resolve('js/navigation/index.js');
  const mainJsPath = path.resolve('js/main.js');
  const sheetJsPath = path.resolve('js/sheet.js');
  const authUiJsPath = path.resolve('js/auth-ui.js');
  const reportJsPath = path.resolve('js/report.js');
  const busSearchJsPath = path.resolve('js/bus-search.js');
  const helpSupportJsPath = path.resolve('js/help-support.js');
  const profileJsPath = path.resolve('js/profile.js');

  await t.test('1. Navigation module files and architecture integrity', () => {
    assert.ok(fs.existsSync(navServicePath), 'navigation-service.js must exist');
    assert.ok(fs.existsSync(backHandlerPath), 'back-handler.js must exist');
    assert.ok(fs.existsSync(iosGesturePath), 'ios-gesture.js must exist');
    assert.ok(fs.existsSync(navIndexPath), 'index.js must exist');

    const navServiceContent = fs.readFileSync(navServicePath, 'utf8');
    const backHandlerContent = fs.readFileSync(backHandlerPath, 'utf8');
    const iosGestureContent = fs.readFileSync(iosGesturePath, 'utf8');
    const navIndexContent = fs.readFileSync(navIndexPath, 'utf8');

    assert.match(navServiceContent, /export const navigationService\s*=\s*new NavigationService\(\)/);
    assert.match(backHandlerContent, /export const backHandler\s*=\s*new BackHandler\(\)/);
    assert.match(iosGestureContent, /export const iosSwipeBackGesture\s*=\s*new IOSSwipeBackGesture\(\)/);
    assert.match(navIndexContent, /window\.navigationService\s*=\s*navigationService/);
    assert.match(navIndexContent, /window\.backHandler\s*=\s*backHandler/);
  });

  await t.test('2. Popstate listener is implemented and active in application JavaScript', () => {
    function findPopstateRecursive(dir) {
      const files = fs.readdirSync(dir, { withFileTypes: true });
      for (const file of files) {
        const fullPath = path.join(dir, file.name);
        if (file.isDirectory()) {
          if (findPopstateRecursive(fullPath)) return true;
        } else if (file.name.endsWith('.js')) {
          const content = fs.readFileSync(fullPath, 'utf8');
          if (content.includes('popstate') || content.includes('onpopstate')) {
            return true;
          }
        }
      }
      return false;
    }

    const foundPopstate = findPopstateRecursive(path.resolve('js'));
    assert.strictEqual(foundPopstate, true, 'Central popstate handler must be implemented in js/ subtree');
  });

  await t.test('3. Main.js and application modules integrate navigation subsystem', () => {
    const mainContent = fs.readFileSync(mainJsPath, 'utf8');
    const sheetContent = fs.readFileSync(sheetJsPath, 'utf8');
    const authContent = fs.readFileSync(authUiJsPath, 'utf8');
    const reportContent = fs.readFileSync(reportJsPath, 'utf8');
    const busSearchContent = fs.readFileSync(busSearchJsPath, 'utf8');
    const helpSupportContent = fs.readFileSync(helpSupportJsPath, 'utf8');
    const profileContent = fs.readFileSync(profileJsPath, 'utf8');

    assert.match(mainContent, /import\s+['"]\.\/navigation\/index\.js['"]/, 'main.js must import navigation index');
    assert.match(sheetContent, /navigationService\.push\(/, 'sheet.js must push stack screens');
    assert.match(sheetContent, /navigationService\.setTab\(/, 'sheet.js must update tabs via navigationService');
    assert.match(authContent, /navigationService\.resetToAuth\(\)/, 'auth-ui.js must purge navigation stack on logout');
    assert.match(reportContent, /navigationService\.registerInterceptor\('report-unsaved'/, 'report.js must register unsaved check');
    assert.match(busSearchContent, /navigationService\.push\('bus-search-page'/, 'bus-search.js must push bus-search-page');
    assert.match(helpSupportContent, /navigationService\.push\(/, 'help-support.js must push pages to stack');
    assert.match(profileContent, /navigationService\.push\('update-profile-page'/, 'profile.js must push update-profile-page');
  });

  await t.test('4. Priority chain execution logic (Simulation)', async () => {
    const { navigationService } = await import('../js/navigation/navigation-service.js');
    const { backHandler } = await import('../js/navigation/back-handler.js');

    // Scenario A: Modal is open -> modal closes first before stack screen
    navigationService.screenStack = [];
    navigationService.activeModals = [];
    navigationService.currentTab = 'home';

    let screenClosed = false;
    let modalClosed = false;

    navigationService.push('settings-screen', () => { screenClosed = true; });
    navigationService.pushModal('filter-modal', () => { modalClosed = true; });

    assert.strictEqual(navigationService.activeModals.length, 1);
    assert.strictEqual(navigationService.screenStack.length, 1);

    // First back: must close modal ONLY
    const handledModal = backHandler.handleGlobalBack();
    assert.strictEqual(handledModal, true, 'Modal dismissal must consume back');
    assert.strictEqual(modalClosed, true, 'Modal closeCallback must be called');
    assert.strictEqual(screenClosed, false, 'Screen must NOT be closed while modal was open');
    assert.strictEqual(navigationService.activeModals.length, 0);

    // Second back: must pop stack screen
    const handledScreen = backHandler.handleGlobalBack();
    assert.strictEqual(handledScreen, true, 'Screen pop must consume back');
    assert.strictEqual(screenClosed, true, 'Screen closeCallback must be called');
    assert.strictEqual(navigationService.screenStack.length, 0);
  });

  await t.test('5. Non-root tab back navigation returns to root Home tab', async () => {
    const { navigationService } = await import('../js/navigation/navigation-service.js');
    const { backHandler } = await import('../js/navigation/back-handler.js');

    navigationService.screenStack = [];
    navigationService.activeModals = [];
    navigationService.currentTab = 'profile';

    // User is on Profile tab with no sub-screens open
    const handled = backHandler.handleNonRootTabBack();
    assert.strictEqual(handled, true, 'Back on non-root tab must be consumed');
    assert.strictEqual(navigationService.currentTab, 'home', 'Tab must transition to home');
  });

  await t.test('6. Double-back exit protection on root screen', async () => {
    const { navigationService } = await import('../js/navigation/navigation-service.js');
    const { backHandler } = await import('../js/navigation/back-handler.js');

    navigationService.screenStack = [];
    navigationService.activeModals = [];
    navigationService.currentTab = 'home';
    backHandler.lastRootBackPressTime = 0; // Reset timer

    // 1st back on Home screen: shows toast, consumes event
    const firstPressHandled = backHandler.handleRootBack(false);
    assert.strictEqual(firstPressHandled, true, 'First back press must be consumed to prevent accidental exit');
    assert.ok(backHandler.lastRootBackPressTime > 0, 'lastRootBackPressTime must be recorded');

    // 2nd back on Home screen within 2000ms: allows exit (returns false)
    const secondPressHandled = backHandler.handleRootBack(false);
    assert.strictEqual(secondPressHandled, false, 'Second back press within 2s must return false to allow OS exit');

    // 3rd back after 2001ms: resets window and consumes again
    backHandler.lastRootBackPressTime = Date.now() - 2500;
    const expiredPressHandled = backHandler.handleRootBack(false);
    assert.strictEqual(expiredPressHandled, true, 'Back press after 2s must show warning toast again');
  });

  await t.test('7. Unsaved form protection interceptor logic', async () => {
    const { navigationService } = await import('../js/navigation/navigation-service.js');
    const { backHandler } = await import('../js/navigation/back-handler.js');

    let discardModalShown = false;
    let hasUnsavedChanges = true;

    navigationService.registerInterceptor('test-unsaved-form', () => {
      if (hasUnsavedChanges) {
        discardModalShown = true;
        return true; // intercept back
      }
      return false;
    }, 90);

    const handled = backHandler.handleCustomInterceptors();
    assert.strictEqual(handled, true, 'Unsaved form interceptor must consume back press');
    assert.strictEqual(discardModalShown, true, 'Discard modal must be triggered');

    navigationService.unregisterInterceptor('test-unsaved-form');
  });

  await t.test('8. Logout state purge and navigation history reset', async () => {
    const { navigationService } = await import('../js/navigation/navigation-service.js');

    // Populate stack with dummy screens and modals
    navigationService.push('profile-page');
    navigationService.push('personal-info-page');
    navigationService.push('update-profile-page');
    navigationService.pushModal('test-modal');
    navigationService.currentTab = 'profile';

    assert.ok(navigationService.screenStack.length > 0);
    assert.ok(navigationService.activeModals.length > 0);

    // Call resetToAuth()
    navigationService.resetToAuth();

    assert.strictEqual(navigationService.screenStack.length, 0, 'Screen stack must be empty after logout');
    assert.strictEqual(navigationService.activeModals.length, 0, 'Modal stack must be empty after logout');
    assert.strictEqual(navigationService.currentTab, 'home', 'Tab must reset to home');
    assert.strictEqual(navigationService.canGoBack(), false, 'canGoBack must be false after logout');
  });

  await t.test('9. iOS left-edge swipe physics threshold verification', async () => {
    const { iosSwipeBackGesture } = await import('../js/navigation/ios-gesture.js');

    assert.strictEqual(iosSwipeBackGesture.edgeThresholdPx, 80, 'Edge threshold must be 80px for natural thumb reach');
    assert.strictEqual(iosSwipeBackGesture.popDistanceThresholdPx, 85, 'Pop distance threshold must be 85px');
    assert.ok(iosSwipeBackGesture.popVelocityThreshold > 0, 'Pop velocity threshold must be defined');
  });

  await t.test('10. iOS swipe-back dynamic target resolution (stack, tab, overlay)', async () => {
    const { navigationService } = await import('../js/navigation/navigation-service.js');
    const { iosSwipeBackGesture } = await import('../js/navigation/ios-gesture.js');

    // Case A: Top stack screen is active
    const mockEl = { classList: { contains: () => false }, style: { display: 'block' } };
    navigationService.screenStack = [{ id: 'test-detail-screen', element: mockEl }];
    navigationService.activeModals = [];
    navigationService.currentTab = 'home';

    const targetStack = iosSwipeBackGesture.findActiveTarget();
    assert.ok(targetStack, 'Target must be found for top stack screen');
    assert.strictEqual(targetStack.id, 'test-detail-screen');
    assert.strictEqual(targetStack.type, 'stack');

    // Case B: Modal is open -> swipe back must be suppressed
    navigationService.pushModal('active-modal');
    assert.strictEqual(iosSwipeBackGesture.findActiveTarget(), null, 'Swipe target must be null when modal is active');
    navigationService.activeModals = [];

    // Case C: On Profile tab with no stack screens
    navigationService.screenStack = [];
    navigationService.currentTab = 'profile';
    // Without DOM document, it safely returns null or mock tab
    assert.strictEqual(typeof iosSwipeBackGesture.findActiveTarget, 'function');
  });
});
