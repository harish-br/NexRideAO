/**
 * js/notifications/notification-types.js
 * Centralized notification types, route mappings, and payload definitions for NexRide.
 */

export const NOTIFICATION_TYPES = {
  // --- USER NOTIFICATION TYPES ---
  BUS_ARRIVING: 'BUS_ARRIVING',
  BUS_DELAYED: 'BUS_DELAYED',
  ROUTE_UPDATED: 'ROUTE_UPDATED',
  EPASS_RENEWED: 'EPASS_RENEWED',
  EPASS_EXPIRING: 'EPASS_EXPIRING',
  REPORT_STATUS_CHANGED: 'REPORT_STATUS_CHANGED',
  ADMIN_RESPONSE: 'ADMIN_RESPONSE',
  SOS_ALERT: 'SOS_ALERT',
  GENERAL_ANNOUNCEMENT: 'GENERAL_ANNOUNCEMENT',
  SYSTEM_ALERT: 'SYSTEM_ALERT',

  // --- ADMIN NOTIFICATION TYPES ---
  NEW_USER_REPORT: 'NEW_USER_REPORT',
  SOS_TRIGGERED: 'SOS_TRIGGERED',
  BUS_TELEMETRY_ALERT: 'BUS_TELEMETRY_ALERT',
  DRIVER_VERIFICATION_REQUIRED: 'DRIVER_VERIFICATION_REQUIRED',
  APPROVAL_REQUESTED: 'APPROVAL_REQUESTED',
  ADMIN_BROADCAST: 'ADMIN_BROADCAST'
};

/**
 * Whitelist of valid client deep-link targets to prevent arbitrary redirect attacks.
 */
export const NOTIFICATION_ROUTES = {
  // User screens
  [NOTIFICATION_TYPES.BUS_ARRIVING]: '/#live',
  [NOTIFICATION_TYPES.BUS_DELAYED]: '/#live',
  [NOTIFICATION_TYPES.ROUTE_UPDATED]: '/#live',
  [NOTIFICATION_TYPES.EPASS_RENEWED]: '/#epass',
  [NOTIFICATION_TYPES.EPASS_EXPIRING]: '/#epass',
  [NOTIFICATION_TYPES.REPORT_STATUS_CHANGED]: '/#reports',
  [NOTIFICATION_TYPES.ADMIN_RESPONSE]: '/#reports',
  [NOTIFICATION_TYPES.SOS_ALERT]: '/#notifications',
  [NOTIFICATION_TYPES.GENERAL_ANNOUNCEMENT]: '/#notifications',
  [NOTIFICATION_TYPES.SYSTEM_ALERT]: '/#notifications',

  // Admin screens
  [NOTIFICATION_TYPES.NEW_USER_REPORT]: '/admin/#reports',
  [NOTIFICATION_TYPES.SOS_TRIGGERED]: '/admin/#reports',
  [NOTIFICATION_TYPES.BUS_TELEMETRY_ALERT]: '/admin/#buses',
  [NOTIFICATION_TYPES.DRIVER_VERIFICATION_REQUIRED]: '/admin/#settings',
  [NOTIFICATION_TYPES.APPROVAL_REQUESTED]: '/admin/#routes',
  [NOTIFICATION_TYPES.ADMIN_BROADCAST]: '/admin/#dashboard'
};

/**
 * Returns safe destination URL for a notification type and optional entity ID.
 */
export function resolveNotificationRoute(type, entityId = '') {
  const baseRoute = NOTIFICATION_ROUTES[type] || '/#notifications';
  if (entityId) {
    return `${baseRoute}?id=${encodeURIComponent(entityId)}`;
  }
  return baseRoute;
}

/**
 * Validates that notification payloads do not contain sensitive fields.
 */
export function validateNotificationPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Notification payload must be an object');
  }

  const forbiddenKeys = ['password', 'token', 'accessToken', 'refreshToken', 'privateKey', 'secret', 'creditCard'];
  const checkForbidden = (obj) => {
    if (!obj || typeof obj !== 'object') return;
    for (const key of Object.keys(obj)) {
      if (forbiddenKeys.some(f => key.toLowerCase().includes(f.toLowerCase()))) {
        throw new Error(`Security Violation: Payload contains forbidden sensitive field "${key}"`);
      }
      if (typeof obj[key] === 'object') {
        checkForbidden(obj[key]);
      }
    }
  };

  checkForbidden(payload);

  if (!payload.title || typeof payload.title !== 'string') {
    throw new Error('Notification title is required and must be a string');
  }
  if (!payload.body || typeof payload.body !== 'string') {
    throw new Error('Notification body is required and must be a string');
  }

  return true;
}
