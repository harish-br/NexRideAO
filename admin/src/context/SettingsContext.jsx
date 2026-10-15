import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { auth, db } from '../firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { createAuditLog } from '../services/auditLogger';

export const DEFAULT_APP_PREFS = {
  timeFormat: '12h',
  dateFormat: 'DD/MM/YYYY',
  rowsPerPage: '20',
  autoRefresh: false,
};

export const DEFAULT_NOTIF_PREFS = {
  busAlerts:         true,
  maintenanceAlerts: true,
  driverAlerts:      true,
  criticalAlerts:    true,
  auditAlerts:       true,
};

const SettingsContext = createContext(null);

export function SettingsProvider({ children, user: propUser }) {
  const [currentUser, setCurrentUser] = useState(() => propUser || auth.currentUser);

  useEffect(() => {
    if (propUser !== undefined) {
      setCurrentUser(propUser);
      return;
    }
    const unsub = onAuthStateChanged(auth, (u) => setCurrentUser(u));
    return () => unsub();
  }, [propUser]);

  const effectiveUid = currentUser?.uid || auth.currentUser?.uid || 'guest';
  const appKey = `nexride_app_prefs_${effectiveUid}`;
  const notifKey = `nexride_notif_prefs_${effectiveUid}`;

  // 1. Initial State from user-specific cache
  const [appPrefs, setAppPrefsState] = useState(() => {
    try {
      const cached = localStorage.getItem(appKey) || localStorage.getItem('nexride_app_prefs');
      if (cached) return { ...DEFAULT_APP_PREFS, ...JSON.parse(cached) };
    } catch (e) {}
    return DEFAULT_APP_PREFS;
  });

  const [notifPrefs, setNotifPrefsState] = useState(() => {
    try {
      const cached = localStorage.getItem(notifKey) || localStorage.getItem('nexride_notif_prefs');
      if (cached) return { ...DEFAULT_NOTIF_PREFS, ...JSON.parse(cached) };
    } catch (e) {}
    return DEFAULT_NOTIF_PREFS;
  });

  // 2. Sync from cloud whenever effective user changes
  useEffect(() => {
    let isMounted = true;
    if (!effectiveUid || effectiveUid === 'guest') return;

    // Load from local cache for this specific user immediately
    try {
      const cachedApp = localStorage.getItem(appKey);
      if (cachedApp) setAppPrefsState({ ...DEFAULT_APP_PREFS, ...JSON.parse(cachedApp) });
      const cachedNotif = localStorage.getItem(notifKey);
      if (cachedNotif) setNotifPrefsState({ ...DEFAULT_NOTIF_PREFS, ...JSON.parse(cachedNotif) });
    } catch (e) {}

    async function loadCloudSettings() {
      // Load Application Preferences
      try {
        const sysSnap = await getDoc(doc(db, 'systemConfig', `app_prefs_${effectiveUid}`));
        if (sysSnap.exists()) {
          const d = { ...DEFAULT_APP_PREFS, ...sysSnap.data() };
          if (isMounted) setAppPrefsState(d);
          try {
            localStorage.setItem(appKey, JSON.stringify(d));
          } catch (e) {}
        } else {
          // Fallback check user subcollection
          const userSnap = await getDoc(doc(db, 'users', effectiveUid, 'settings', 'application'));
          if (userSnap.exists()) {
            const d = { ...DEFAULT_APP_PREFS, ...userSnap.data() };
            if (isMounted) setAppPrefsState(d);
            try {
              localStorage.setItem(appKey, JSON.stringify(d));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Could not load user app prefs from Firestore:', err.message);
      }

      // Load Notification Preferences
      try {
        const sysNotifSnap = await getDoc(doc(db, 'systemConfig', `notif_prefs_${effectiveUid}`));
        if (sysNotifSnap.exists()) {
          const d = { ...DEFAULT_NOTIF_PREFS, ...sysNotifSnap.data() };
          if (isMounted) setNotifPrefsState(d);
          try {
            localStorage.setItem(notifKey, JSON.stringify(d));
          } catch (e) {}
        } else {
          const userNotifSnap = await getDoc(doc(db, 'users', effectiveUid, 'settings', 'notifications'));
          if (userNotifSnap.exists()) {
            const d = { ...DEFAULT_NOTIF_PREFS, ...userNotifSnap.data() };
            if (isMounted) setNotifPrefsState(d);
            try {
              localStorage.setItem(notifKey, JSON.stringify(d));
            } catch (e) {}
          }
        }
      } catch (err) {
        console.warn('Could not load user notif prefs from Firestore:', err.message);
      }
    }

    loadCloudSettings();
    return () => { isMounted = false; };
  }, [effectiveUid, appKey, notifKey]);

  // 3. Update App Preferences
  const updateAppPrefs = useCallback(async (newPrefs) => {
    const updated = typeof newPrefs === 'function' ? newPrefs(appPrefs) : newPrefs;
    setAppPrefsState(updated);

    // Persist to user-specific localStorage
    try {
      localStorage.setItem(appKey, JSON.stringify(updated));
      localStorage.setItem('nexride_app_prefs', JSON.stringify(updated));
      localStorage.setItem('nexride_system_settings', JSON.stringify(updated));
    } catch (e) {}

    // Persist to Firestore
    if (effectiveUid && effectiveUid !== 'guest') {
      try {
        await setDoc(doc(db, 'systemConfig', `app_prefs_${effectiveUid}`), {
          ...updated,
          userId: effectiveUid,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn('systemConfig app prefs save notice:', err.message);
      }

      try {
        await setDoc(doc(db, 'users', effectiveUid, 'settings', 'application'), {
          ...updated,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {}
    }

    try {
      await createAuditLog({
        action: 'UPDATE',
        module: 'Settings',
        entityType: 'application_preference',
        description: 'Updated application preferences',
        severity: 'info'
      });
    } catch (e) {}

    return updated;
  }, [appPrefs, appKey, effectiveUid]);

  // 4. Update Notification Preferences
  const updateNotifPrefs = useCallback(async (newPrefs) => {
    const updated = typeof newPrefs === 'function' ? newPrefs(notifPrefs) : newPrefs;
    setNotifPrefsState(updated);

    try {
      localStorage.setItem(notifKey, JSON.stringify(updated));
      localStorage.setItem('nexride_notif_prefs', JSON.stringify(updated));
    } catch (e) {}

    if (effectiveUid && effectiveUid !== 'guest') {
      try {
        await setDoc(doc(db, 'systemConfig', `notif_prefs_${effectiveUid}`), {
          ...updated,
          userId: effectiveUid,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {
        console.warn('systemConfig notif prefs save notice:', err.message);
      }

      try {
        await setDoc(doc(db, 'users', effectiveUid, 'settings', 'notifications'), {
          ...updated,
          updatedAt: serverTimestamp()
        }, { merge: true });
      } catch (err) {}
    }

    return updated;
  }, [notifPrefs, notifKey, effectiveUid]);

  // 5. User-tailored Formatters
  const formatDate = useCallback((val) => {
    if (!val) return '—';
    try {
      const d = val.toDate ? val.toDate() : new Date(val);
      if (isNaN(d.getTime())) return String(val);

      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();

      if (appPrefs.dateFormat === 'MM/DD/YYYY') {
        return `${month}/${day}/${year}`;
      }
      // default: DD/MM/YYYY
      return `${day}/${month}/${year}`;
    } catch (e) {
      return String(val);
    }
  }, [appPrefs.dateFormat]);

  const formatTime = useCallback((val, { seconds = false } = {}) => {
    if (!val) return '—';
    try {
      const d = val.toDate ? val.toDate() : new Date(val);
      if (isNaN(d.getTime())) return String(val);

      const is24h = appPrefs.timeFormat === '24h';
      return d.toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        ...(seconds ? { second: '2-digit' } : {}),
        hour12: !is24h
      });
    } catch (e) {
      return String(val);
    }
  }, [appPrefs.timeFormat]);

  const formatDateTime = useCallback((val, { seconds = false } = {}) => {
    if (!val) return '—';
    const dateStr = formatDate(val);
    const timeStr = formatTime(val, { seconds });
    return `${dateStr} ${timeStr}`;
  }, [formatDate, formatTime]);

  const rowsPerPage = useMemo(() => {
    const parsed = parseInt(appPrefs.rowsPerPage, 10);
    return isNaN(parsed) || parsed <= 0 ? 20 : parsed;
  }, [appPrefs.rowsPerPage]);

  const autoRefresh = Boolean(appPrefs.autoRefresh);

  const value = useMemo(() => ({
    user: currentUser,
    effectiveUid,
    appPrefs,
    notifPrefs,
    rowsPerPage,
    autoRefresh,
    timeFormat: appPrefs.timeFormat,
    dateFormat: appPrefs.dateFormat,
    formatDate,
    formatTime,
    formatDateTime,
    updateAppPrefs,
    updateNotifPrefs,
  }), [
    currentUser,
    effectiveUid,
    appPrefs,
    notifPrefs,
    rowsPerPage,
    autoRefresh,
    formatDate,
    formatTime,
    formatDateTime,
    updateAppPrefs,
    updateNotifPrefs,
  ]);

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    // Graceful fallback outside provider
    return {
      user: auth.currentUser,
      effectiveUid: auth.currentUser?.uid || 'guest',
      appPrefs: DEFAULT_APP_PREFS,
      notifPrefs: DEFAULT_NOTIF_PREFS,
      rowsPerPage: 20,
      autoRefresh: false,
      timeFormat: '12h',
      dateFormat: 'DD/MM/YYYY',
      formatDate: (d) => (d ? new Date(d.toDate ? d.toDate() : d).toLocaleDateString() : '—'),
      formatTime: (d) => (d ? new Date(d.toDate ? d.toDate() : d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true }) : '—'),
      formatDateTime: (d) => (d ? new Date(d.toDate ? d.toDate() : d).toLocaleString() : '—'),
      updateAppPrefs: async () => {},
      updateNotifPrefs: async () => {},
    };
  }
  return ctx;
}
