import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';

/**
 * Creates an audit log in the 'auditLogs' Firestore collection.
 * 
 * @param {Object} params
 * @param {string} params.action - e.g., 'CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'EXPORT'
 * @param {string} params.module - e.g., 'Bus Management', 'Authentication', 'Audit Logs'
 * @param {string} params.entityType - e.g., 'bus', 'student', 'driver', 'notification'
 * @param {string} params.entityId - ID of the entity affected
 * @param {string} params.entityName - Display name of the entity affected
 * @param {string} params.description - Human readable description
 * @param {'info'|'warning'|'critical'} [params.severity='info'] - Severity level
 * @param {'success'|'failed'} [params.status='success'] - Status of the action
 * @param {Object} [params.changes] - { before: Object, after: Object }
 */
export async function createAuditLog({
  action,
  module,
  entityType,
  entityId = '',
  entityName = '',
  description,
  severity = 'info',
  status = 'success',
  changes = { before: null, after: null }
}) {
  try {
    const user = auth.currentUser;
    const actor = user ? {
      uid: user.uid,
      name: user.displayName || 'Administrator',
      email: user.email || '',
      role: 'admin' // By default, only admins use this dashboard
    } : {
      uid: 'system',
      name: 'System',
      email: '',
      role: 'system'
    };

    const metadata = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      timestampStr: new Date().toISOString()
    };

    // Note: To capture IP address reliably, it requires a cloud function or backend.
    // For client-side, we capture basic browser metadata.

    const logData = {
      timestamp: serverTimestamp(),
      createdAt: serverTimestamp(), // duplicate for easier ordering fallback
      actor,
      action,
      module,
      entityType,
      entityId,
      entityName,
      description,
      severity,
      status,
      changes,
      metadata
    };

    await addDoc(collection(db, 'auditLogs'), logData);
  } catch (error) {
    console.warn('[Audit Logger] Failed to write audit log:', error);
    // We don't throw to avoid breaking the main UI flow if audit logging fails
  }
}
