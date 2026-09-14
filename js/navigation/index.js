/**
 * NexRide AO - Navigation Subsystem Entry Point
 */

import { navigationService } from './navigation-service.js';
import { backHandler } from './back-handler.js';
import { iosSwipeBackGesture } from './ios-gesture.js';

// Auto-initialize listeners on load
if (typeof window !== 'undefined') {
  navigationService.init();
  backHandler.init();
  iosSwipeBackGesture.init();

  // Expose on window for ease of integration with inline handlers and existing code
  window.navigationService = navigationService;
  window.backHandler = backHandler;
  window.iosSwipeBackGesture = iosSwipeBackGesture;
}

export { navigationService, backHandler, iosSwipeBackGesture };
