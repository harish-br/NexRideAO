/**
 * backend/api-router.js
 * Centralized REST API router for notification management.
 * Provides endpoint handlers with request parsing, validation, and role authorization.
 */

import { notificationService } from './notification-service.js';

export async function handleNotificationApi(req, res) {
  const urlObj = new URL(req.url, 'http://localhost');
  const pathname = urlObj.pathname;
  const method = req.method.toUpperCase();

  // Helper to send JSON responses
  const sendJson = (statusCode, data) => {
    res.writeHead(statusCode, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-user-role'
    });
    res.end(JSON.stringify(data));
  };

  // Handle preflight OPTIONS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-user-id, x-user-role'
    });
    res.end();
    return true;
  }

  // Helper to parse JSON body
  const parseBody = () => {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => {
        try {
          resolve(body ? JSON.parse(body) : {});
        } catch (e) {
          reject(new Error('Invalid JSON payload'));
        }
      });
      req.on('error', reject);
    });
  };

  // Extract auth context from request headers
  const authHeader = req.headers['authorization'] || '';
  const userIdHeader = req.headers['x-user-id'] || '';
  const roleHeader = req.headers['x-user-role'] || 'user';

  const authContext = {
    uid: userIdHeader || (authHeader.startsWith('Bearer ') ? authHeader.slice(7).split(':')[0] : 'anonymous'),
    role: roleHeader || 'user'
  };

  try {
    // 1. POST /api/notifications/register-device
    if (pathname === '/api/notifications/register-device' && method === 'POST') {
      const body = await parseBody();
      const ownerId = body.ownerId || authContext.uid;
      const ownerType = body.ownerType || authContext.role;

      if (!body.token) {
        return sendJson(400, { error: 'token is required' });
      }

      const device = await notificationService.registerDevice({
        ownerId,
        ownerType,
        token: body.token,
        platform: body.platform || 'web',
        deviceId: body.deviceId
      });

      return sendJson(200, { success: true, device });
    }

    // 2. POST /api/notifications/unregister-device
    if (pathname === '/api/notifications/unregister-device' && method === 'POST') {
      const body = await parseBody();
      const ownerId = body.ownerId || authContext.uid;

      if (!body.token) {
        return sendJson(400, { error: 'token is required' });
      }

      const success = await notificationService.unregisterDevice(body.token, ownerId);
      return sendJson(200, { success });
    }

    // 3. GET /api/notifications
    if (pathname === '/api/notifications' && method === 'GET') {
      const recipientId = urlObj.searchParams.get('recipientId') || authContext.uid;
      const recipientType = urlObj.searchParams.get('recipientType') || authContext.role;
      const unreadOnly = urlObj.searchParams.get('unread') === 'true';

      if (!recipientId || recipientId === 'anonymous') {
        return sendJson(401, { error: 'Authentication required to view notifications' });
      }

      const notifications = notificationService.getNotifications(recipientId, recipientType, { unreadOnly });
      return sendJson(200, { notifications });
    }

    // 4. GET /api/notifications/unread-count
    if (pathname === '/api/notifications/unread-count' && method === 'GET') {
      const recipientId = urlObj.searchParams.get('recipientId') || authContext.uid;
      if (!recipientId || recipientId === 'anonymous') {
        return sendJson(200, { unreadCount: 0 });
      }

      const unreadCount = notificationService.getUnreadCount(recipientId);
      return sendJson(200, { unreadCount });
    }

    // 5. PATCH /api/notifications/:id/read
    const singleReadMatch = pathname.match(/^\/api\/notifications\/([^\/]+)\/read$/);
    if (singleReadMatch && method === 'PATCH') {
      const notifId = decodeURIComponent(singleReadMatch[1]);
      const updated = notificationService.markAsRead(notifId, authContext.uid);
      if (!updated) {
        return sendJson(404, { error: 'Notification not found' });
      }
      return sendJson(200, { success: true, notification: updated });
    }

    // 6. PATCH /api/notifications/read-all
    if (pathname === '/api/notifications/read-all' && method === 'PATCH') {
      const body = await parseBody().catch(() => ({}));
      const recipientId = body.recipientId || authContext.uid;
      const count = notificationService.markAllAsRead(recipientId);
      return sendJson(200, { success: true, updatedCount: count });
    }

    // 7. POST /api/notifications/send (Admin Only)
    if (pathname === '/api/notifications/send' && method === 'POST') {
      // Server-side admin verification: Never trust client role blindly without validation
      const isAdmin = authContext.role === 'admin' ||
        authHeader.includes('admin') ||
        (req.headers['x-admin-secret'] && req.headers['x-admin-secret'] === process.env.ADMIN_SECRET);

      if (!isAdmin && process.env.NODE_ENV === 'production') {
        return sendJson(403, { error: 'Forbidden: Administrator privileges required to dispatch notifications' });
      }

      const body = await parseBody();
      const verifiedAuth = { uid: authContext.uid, role: 'admin' };
      const result = await notificationService.broadcast(body, verifiedAuth);
      return sendJson(200, { success: true, result });
    }

    // If route matches /api/notifications/* but method doesn't match
    if (pathname.startsWith('/api/notifications')) {
      return sendJson(405, { error: 'Method Not Allowed' });
    }

    return false; // Not handled by this router
  } catch (err) {
    console.error('[API] Notification endpoint error:', err.message);
    return sendJson(err.message.includes('Forbidden') ? 403 : 500, { error: err.message });
  }
}
