import React, { useState, useEffect, useCallback } from 'react';
import { auth, db } from '../firebase';
import {
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
} from 'firebase/auth';
import ProfileIcon      from '../assets/svg/profile-2user.svg?react';
import SecurityIcon     from '../assets/svg/tag-user.svg?react';
import NotifIcon        from '../assets/svg/notification.svg?react';
import AppIcon          from '../assets/svg/setting.svg?react';
import LegalIcon        from '../assets/svg/book.svg?react';
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { createAuditLog } from '../services/auditLogger';

// ─── Shared primitives ────────────────────────────────────────────────────────

const T = {
  border: '1px solid #E4E7EC',
  radius: { sm: '8px', md: '10px', lg: '14px' },
  color: {
    primary: '#0044CC',
    text: '#111827',
    secondary: '#667085',
    bg: '#F6F8FB',
    surface: '#FFFFFF',
    danger: '#F04438',
    success: '#12B76A',
    warning: '#F79009',
    border: '#E4E7EC',
  },
};

function Row({ label, description, children, last }) {
  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      padding: '16px 0',
      borderBottom: last ? 'none' : T.border,
      gap: '24px',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '14.5px', fontWeight: '500', color: T.color.text }}>{label}</div>
        {description && (
          <div style={{ fontSize: '13px', color: T.color.secondary, marginTop: '3px', lineHeight: '1.4' }}>{description}</div>
        )}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function SectionTitle({ children }) {
  return (
    <h3 style={{
      fontSize: '13px', fontWeight: '700', color: T.color.secondary,
      textTransform: 'uppercase', letterSpacing: '0.8px',
      margin: '0 0 6px 0',
    }}>
      {children}
    </h3>
  );
}

function SectionCard({ title, description, children }) {
  return (
    <div style={{
      background: T.color.surface,
      border: T.border,
      borderRadius: T.radius.lg,
      padding: '0 24px',
      marginBottom: '20px',
      boxShadow: '0 1px 3px rgba(16, 24, 40, 0.04)',
    }}>
      {(title || description) && (
        <div style={{ padding: '20px 0 16px 0', borderBottom: T.border }}>
          {title && <div style={{ fontSize: '16px', fontWeight: '600', color: T.color.text, letterSpacing: '-0.2px' }}>{title}</div>}
          {description && <div style={{ fontSize: '13.5px', color: T.color.secondary, marginTop: '3px', lineHeight: '1.4' }}>{description}</div>}
        </div>
      )}
      <div style={{ paddingBottom: '4px' }}>{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, disabled }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => !disabled && onChange(!checked)}
      disabled={disabled}
      style={{
        width: '42px', height: '24px', borderRadius: '100px',
        background: checked ? T.color.primary : '#D0D5DD',
        border: 'none', cursor: disabled ? 'not-allowed' : 'pointer',
        position: 'relative', transition: 'background 0.15s',
        padding: 0, flexShrink: 0,
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span style={{
        position: 'absolute', top: '3px',
        left: checked ? '21px' : '3px',
        width: '18px', height: '18px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.15s',
        boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
      }} />
    </button>
  );
}

function Btn({ onClick, children, variant = 'secondary', disabled, type = 'button', small }) {
  const isPrimary = variant === 'primary';
  const isDanger  = variant === 'danger';
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: small ? '7px 14px' : '9px 18px',
        borderRadius: T.radius.md,
        border: isPrimary || isDanger ? 'none' : T.border,
        background: isPrimary ? T.color.primary : isDanger ? T.color.danger : T.color.surface,
        color: isPrimary || isDanger ? '#fff' : T.color.text,
        fontSize: '13px', fontWeight: '500',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
        transition: 'opacity 0.15s, background 0.15s',
      }}
      onMouseEnter={e => { if (!disabled && (isPrimary || isDanger)) e.currentTarget.style.opacity = '0.88'; }}
      onMouseLeave={e => { if (!disabled && (isPrimary || isDanger)) e.currentTarget.style.opacity = '1'; }}
    >
      {children}
    </button>
  );
}

function InputField({ label, type = 'text', value, onChange, placeholder, autoComplete }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
      {label && <label style={{ fontSize: '12px', fontWeight: '500', color: T.color.secondary }}>{label}</label>}
      <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        autoComplete={autoComplete}
        style={{
          height: '40px', padding: '0 12px',
          borderRadius: T.radius.md, border: T.border,
          background: T.color.surface, fontSize: '13px',
          color: T.color.text, outline: 'none',
          transition: 'border-color 0.15s',
          boxSizing: 'border-box', width: '100%',
        }}
        onFocus={e => { e.target.style.borderColor = T.color.primary; }}
        onBlur={e  => { e.target.style.borderColor = T.color.border; }}
      />
    </div>
  );
}

function StatusDot({ ok, label }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: ok ? T.color.success : T.color.danger }}>
      <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: ok ? T.color.success : T.color.danger, display: 'inline-block' }} />
      {label}
    </span>
  );
}

function Toast({ msg, type }) {
  if (!msg) return null;
  const color = type === 'error' ? T.color.danger : T.color.success;
  return (
    <div style={{
      position: 'fixed', bottom: '24px', right: '24px', zIndex: 3000,
      background: '#fff', border: T.border,
      borderLeft: `3px solid ${color}`,
      borderRadius: T.radius.md, padding: '12px 16px',
      boxShadow: '0 4px 12px rgba(16,24,40,0.10)',
      fontSize: '13px', color: T.color.text, fontWeight: '500',
      animation: 'settingsToastIn 0.2s ease',
      maxWidth: '320px',
    }}>
      {msg}
    </div>
  );
}

// ─── Legal Viewer ─────────────────────────────────────────────────────────────

const TERMS_CONTENT = [
  { heading: null, text: 'This mobile application/platform i.e. NexRide (the "App") is owned and operated by NexRide (the "Platform"). By accessing or using this App, You agree to be bound by these Terms and Conditions ("Terms"). If You do not agree to these Terms, please refrain from using this App.' },
  { heading: null, text: 'This document is an electronic record generated by a computer system and does not require physical or digital signatures.' },
  { heading: null, text: 'NexRide provides technology-based software services enabling Users ("Users") to access transportation-related services including live bus tracking, route discovery, stop information, ETA updates, and travel assistance ("Services"). These Terms govern the relationship between You and NexRide regarding the use of the App and Services.' },
  { heading: '1. Registration and Account', items: [
    '1.1 Certain features of the App may require account registration using accurate and updated information.',
    '1.2 Users are responsible for maintaining the confidentiality of their login credentials and all activities performed through their account.',
    '1.3 NexRide reserves the right to suspend or terminate accounts containing false, misleading, or unauthorized information.',
  ]},
  { heading: '2. Services', items: [
    '2.1 The App enables Users to view live bus locations, routes, stop details, and estimated arrival times.',
    '2.2 NexRide makes reasonable efforts to ensure accurate real-time information; however, data accuracy may be affected by GPS limitations, network interruptions, traffic conditions, or operational delays.',
    '2.3 Service availability may vary depending on location, operator availability, and technical conditions.',
  ]},
  { heading: '3. User Obligations', items: [
    '3.1 Users shall use the App only for lawful and authorized purposes.',
    '3.2 Users shall not attempt to disrupt, damage, reverse engineer, or gain unauthorized access to the App or its systems.',
    '3.3 Misuse of the platform may result in restricted access or account termination.',
  ]},
  { heading: '4. Limitation of Liability', items: [
    '4.1 NexRide shall not be liable for delays, route changes, missed buses, traffic disruptions, or service interruptions caused by third-party operators or external factors.',
    '4.2 NexRide functions as a technology platform and does not directly operate transport vehicles unless otherwise stated.',
  ]},
  { heading: '5. Privacy and Data', items: [
    '5.1 NexRide may collect necessary data including location and travel-related information to improve service quality and user experience.',
    '5.2 User data shall be handled in accordance with applicable privacy and data protection standards.',
  ]},
  { heading: '6. Modification of Services', items: [
    '6.1 NexRide reserves the right to modify, suspend, or discontinue any service or feature without prior notice.',
  ]},
  { heading: '7. Acceptance', text: 'By continuing to use NexRide, You acknowledge that You have read, understood, and agreed to these Terms and Conditions.' },
];

const PRIVACY_CONTENT = [
  { heading: null, text: 'This Privacy Policy describes how NexRide (the "App", "Platform", "We", "Us", or "Our") collects, uses, stores, and protects the information of users ("You" or "Users") while accessing or using our services. By using NexRide, You agree to the collection and use of information in accordance with this Privacy Policy.' },
  { heading: null, text: 'This document is an electronic record generated by a computer system and does not require any physical or digital signature.' },
  { heading: null, text: 'NexRide is committed to protecting user privacy and ensuring that personal information is handled securely and responsibly.' },
  { heading: '1. Information We Collect', items: [
    '1.1 NexRide may collect personal information including, but not limited to, name, mobile number, email address, and account-related details during registration or usage of the App.',
    '1.2 We may collect location-related information, including real-time GPS data, to provide live tracking, route assistance, ETA calculations, and other location-based services.',
    '1.3 We may automatically collect device-related information such as device model, operating system, IP address, app version, and usage analytics for service improvement.',
  ]},
  { heading: '2. Use of Information', items: [
    '2.1 Information collected is used to provide, maintain, and improve NexRide services.',
    '2.2 User data may be used to enable live bus tracking, route planning, service optimization, and better travel assistance.',
    '2.3 Information may also be used to enhance platform security, detect misuse, and improve user experience.',
  ]},
  { heading: '3. Data Sharing', items: [
    '3.1 NexRide does not sell, rent, or trade personal information to third parties.',
    '3.2 Information may be shared with trusted service providers or partners only when necessary for service delivery, technical support, or legal compliance.',
    '3.3 We may disclose information if required by law, regulation, or lawful government request.',
  ]},
  { heading: '4. Data Security', items: [
    '4.1 NexRide implements reasonable technical and organizational measures to protect user data against unauthorized access, misuse, alteration, or disclosure.',
    '4.2 While we strive to protect all information, no digital system can guarantee absolute security.',
  ]},
  { heading: '5. Location Data', items: [
    '5.1 Certain NexRide features require access to device location to provide accurate real-time services.',
    '5.2 Users may disable location permissions at any time; however, some features may not function properly without location access.',
  ]},
  { heading: '6. Data Retention', items: [
    '6.1 User information shall be retained only for as long as necessary to provide services, comply with legal obligations, or resolve disputes.',
    '6.2 Unnecessary or outdated data may be deleted or anonymized periodically.',
  ]},
  { heading: '7. User Rights', items: [
    '7.1 Users may request access, correction, or deletion of their personal information, subject to applicable laws and service requirements.',
    '7.2 Users may contact NexRide for privacy-related concerns or requests.',
  ]},
  { heading: '8. Changes to Privacy Policy', items: [
    '8.1 NexRide reserves the right to modify or update this Privacy Policy at any time.',
    '8.2 Continued use of the App after updates constitutes acceptance of the revised Privacy Policy.',
  ]},
  { heading: '9. Acceptance', text: 'By accessing or using NexRide, You acknowledge that You have read, understood, and agreed to this Privacy Policy.' },
];

function LegalViewer({ title, content, onBack }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', maxWidth: '820px' }}>
      <button
        onClick={onBack}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '6px',
          background: 'none', border: 'none', cursor: 'pointer',
          color: T.color.secondary, fontSize: '13px', padding: '0',
          marginBottom: '20px', fontWeight: '500',
        }}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6">
          <path d="M9 11L5 7l4-4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back to Settings
      </button>

      <div style={{ overflowY: 'auto', paddingBottom: '32px' }}>
        <h2 style={{ margin: '0 0 6px 0', fontSize: '22px', fontWeight: '700', color: T.color.text }}>{title}</h2>
        <p style={{ margin: '0 0 24px 0', fontSize: '13px', color: T.color.secondary }}>NexRide · Last updated 2024</p>
        <hr style={{ border: 'none', borderTop: T.border, margin: '0 0 24px 0' }} />

        {content.map((block, i) => (
          <div key={i} style={{ marginBottom: '20px' }}>
            {block.heading && (
              <h3 style={{ fontSize: '14px', fontWeight: '700', color: T.color.text, margin: '0 0 8px 0', textTransform: 'uppercase', letterSpacing: '0.3px' }}>
                {block.heading}
              </h3>
            )}
            {block.text && (
              <p style={{ fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: '0 0 6px 0' }}>{block.text}</p>
            )}
            {block.items && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {block.items.map((item, j) => (
                  <p key={j} style={{ fontSize: '14px', color: '#374151', lineHeight: '1.7', margin: 0 }}>{item}</p>
                ))}
              </div>
            )}
            {i < content.length - 1 && block.heading && (
              <hr style={{ border: 'none', borderTop: T.border, margin: '16px 0 0 0' }} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Navigation items ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { id: 'profile',       label: 'Profile',       Icon: ProfileIcon  },
  { id: 'security',      label: 'Security',      Icon: SecurityIcon },
  { id: 'notifications', label: 'Notifications', Icon: NotifIcon    },
  { id: 'application',   label: 'Application',   Icon: AppIcon      },
  { id: 'legal',         label: 'Legal',         Icon: LegalIcon    },
];

// ─── Section: Profile ─────────────────────────────────────────────────────────

function ProfileSection({ user }) {
  const name  = user?.displayName || 'Administrator';
  const email = user?.email       || '—';
  const uid   = user?.uid         || '—';

  return (
    <div>
      <SectionCard title="Profile Information" description="Your authenticated administrator account details.">
        <Row label="Display Name" last={false}>
          <span style={{ fontSize: '14px', color: T.color.text, fontWeight: '500' }}>{name}</span>
        </Row>
        <Row label="Email Address" last={false}>
          <span style={{ fontSize: '14px', color: T.color.text }}>{email}</span>
        </Row>
        <Row label="Role" last={false}>
          <span style={{
            background: '#EAF1FF', color: T.color.primary,
            padding: '3px 10px', borderRadius: '100px',
            fontSize: '12px', fontWeight: '600',
          }}>Administrator</span>
        </Row>
        <Row label="Account Status" last={false}>
          <StatusDot ok={true} label="Active" />
        </Row>
        <Row label="Account ID" last={true}>
          <span style={{ fontSize: '12px', fontFamily: 'monospace', color: T.color.secondary }}>{uid}</span>
        </Row>
      </SectionCard>

      <SectionCard title="Avatar">
        <Row label="Profile Avatar" description="Your avatar icon used across the NexRide AO admin portal." last={true}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '12px',
            background: '#EAF1FF', display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <ProfileIcon width={22} height={22} style={{ color: T.color.primary, display: 'block' }} />
          </div>
        </Row>
      </SectionCard>
    </div>
  );
}

// ─── Section: Security ────────────────────────────────────────────────────────

function SecuritySection() {
  const [showPwForm, setShowPwForm]     = useState(false);
  const [currentPw, setCurrentPw]       = useState('');
  const [newPw, setNewPw]               = useState('');
  const [confirmPw, setConfirmPw]       = useState('');
  const [pwError, setPwError]           = useState('');
  const [pwSaving, setPwSaving]         = useState(false);
  const [pwSuccess, setPwSuccess]       = useState(false);

  const handleChangePassword = async (e) => {
    e.preventDefault();
    setPwError('');
    if (newPw.length < 6)    { setPwError('New password must be at least 6 characters.'); return; }
    if (newPw !== confirmPw) { setPwError('Passwords do not match.'); return; }

    setPwSaving(true);
    try {
      const user       = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, currentPw);
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPw);
      await createAuditLog({ action: 'UPDATE', module: 'Settings', entityType: 'password', description: 'Admin changed their password', severity: 'warning' });
      setPwSuccess(true);
      setCurrentPw(''); setNewPw(''); setConfirmPw('');
      setTimeout(() => { setPwSuccess(false); setShowPwForm(false); }, 2000);
    } catch (err) {
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwError('Current password is incorrect.');
      } else {
        setPwError(`Failed to update password: ${err.message}`);
      }
    } finally {
      setPwSaving(false);
    }
  };

  const handleSignOut = async () => {
    if (!window.confirm('Sign out from this session?')) return;
    await createAuditLog({ action: 'LOGOUT', module: 'Authentication', entityType: 'session', description: 'Admin signed out', severity: 'info' });
    await signOut(auth);
  };

  return (
    <div>
      <SectionCard title="Password" description="Manage your administrator password.">
        {!showPwForm ? (
          <Row label="Change Password" description="Update the password for your admin account." last={true}>
            <Btn onClick={() => setShowPwForm(true)} small>Change</Btn>
          </Row>
        ) : (
          <div style={{ padding: '16px 0' }}>
            <form onSubmit={handleChangePassword} style={{ display: 'flex', flexDirection: 'column', gap: '14px', maxWidth: '360px' }}>
              <InputField label="Current Password" type="password" value={currentPw} onChange={e => setCurrentPw(e.target.value)} autoComplete="current-password" />
              <InputField label="New Password"     type="password" value={newPw}     onChange={e => setNewPw(e.target.value)}     autoComplete="new-password" />
              <InputField label="Confirm Password" type="password" value={confirmPw} onChange={e => setConfirmPw(e.target.value)} autoComplete="new-password" />

              {pwError && (
                <div style={{ fontSize: '13px', color: T.color.danger, padding: '8px 12px', background: '#FEF3F2', borderRadius: T.radius.sm, border: '1px solid #FECDCA' }}>
                  {pwError}
                </div>
              )}
              {pwSuccess && (
                <div style={{ fontSize: '13px', color: T.color.success, padding: '8px 12px', background: '#ECFDF3', borderRadius: T.radius.sm }}>
                  ✓ Password updated successfully.
                </div>
              )}

              <div style={{ display: 'flex', gap: '10px' }}>
                <Btn type="submit" variant="primary" disabled={pwSaving} small>
                  {pwSaving ? 'Saving…' : 'Update Password'}
                </Btn>
                <Btn onClick={() => { setShowPwForm(false); setPwError(''); }} small>Cancel</Btn>
              </div>
            </form>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Session">
        <Row label="Sign Out" description="Sign out from the current administrative session." last={true}>
          <Btn onClick={handleSignOut} variant="danger" small>Sign Out</Btn>
        </Row>
      </SectionCard>
    </div>
  );
}

// ─── Section: Notifications ───────────────────────────────────────────────────

const DEFAULT_NOTIF_PREFS = {
  busAlerts:       true,
  maintenanceAlerts: true,
  driverAlerts:    true,
  criticalAlerts:  true,
  auditAlerts:     true,
};

function NotificationsSection({ uid, addToast }) {
  const [prefs, setPrefs]     = useState(DEFAULT_NOTIF_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState('');

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    getDoc(doc(db, 'users', uid, 'settings', 'notifications'))
      .then(snap => {
        if (snap.exists()) setPrefs({ ...DEFAULT_NOTIF_PREFS, ...snap.data() });
      })
      .catch(err => console.warn('Could not load notification prefs:', err))
      .finally(() => setLoading(false));
  }, [uid]);

  const toggle = async (key) => {
    if (key === 'criticalAlerts') return; // required
    const updated = { ...prefs, [key]: !prefs[key] };
    setPrefs(updated);
    setSaving(key);
    try {
      await setDoc(doc(db, 'users', uid, 'settings', 'notifications'), { ...updated, updatedAt: serverTimestamp() }, { merge: true });
      await createAuditLog({ action: 'UPDATE', module: 'Settings', entityType: 'notification_preference', entityId: key, description: `Notification preference "${key}" set to ${updated[key]}`, severity: 'info' });
    } catch (err) {
      setPrefs(prefs); // rollback
      addToast('Failed to save preference.', 'error');
    } finally {
      setSaving('');
    }
  };

  if (loading) return <div style={{ padding: '24px 0', color: T.color.secondary, fontSize: '13px' }}>Loading preferences…</div>;

  const rows = [
    { key: 'busAlerts',         label: 'Bus Alerts',           description: 'Alerts related to bus operations and status changes.' },
    { key: 'maintenanceAlerts', label: 'Maintenance Alerts',   description: 'Scheduled and unscheduled vehicle maintenance notifications.' },
    { key: 'driverAlerts',      label: 'Driver & Vehicle Alerts', description: 'Notifications about driver and vehicle assignment changes.' },
    { key: 'criticalAlerts',    label: 'Critical System Alerts', description: 'System-critical alerts. Required — cannot be disabled.', required: true },
    { key: 'auditAlerts',       label: 'Audit Activity Alerts', description: 'Notifications about administrative audit events.' },
  ];

  return (
    <SectionCard title="Notification Preferences" description="Control which system notifications you receive as an administrator.">
      {rows.map((r, i) => (
        <Row key={r.key} label={r.label} description={r.description} last={i === rows.length - 1}>
          {r.required
            ? <span style={{ fontSize: '11px', fontWeight: '600', color: T.color.secondary, background: T.color.bg, padding: '3px 10px', borderRadius: '100px', border: T.border }}>Required</span>
            : <Toggle checked={prefs[r.key]} onChange={() => toggle(r.key)} disabled={!!saving} />
          }
        </Row>
      ))}
    </SectionCard>
  );
}

// ─── Section: Application ─────────────────────────────────────────────────────

const DEFAULT_APP_PREFS = {
  timeFormat: '12h',
  dateFormat: 'DD/MM/YYYY',
  rowsPerPage: '20',
  autoRefresh: false,
};

function ApplicationSection({ uid, addToast }) {
  const [prefs, setPrefs]     = useState(DEFAULT_APP_PREFS);
  const [saved, setSaved]     = useState(DEFAULT_APP_PREFS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const isDirty = JSON.stringify(prefs) !== JSON.stringify(saved);

  useEffect(() => {
    if (!uid) { setLoading(false); return; }
    getDoc(doc(db, 'users', uid, 'settings', 'application'))
      .then(snap => {
        if (snap.exists()) {
          const d = { ...DEFAULT_APP_PREFS, ...snap.data() };
          setPrefs(d); setSaved(d);
        }
      })
      .catch(err => console.warn('Could not load app prefs:', err))
      .finally(() => setLoading(false));
  }, [uid]);

  const set = (key, val) => setPrefs(p => ({ ...p, [key]: val }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'users', uid, 'settings', 'application'), { ...prefs, updatedAt: serverTimestamp() }, { merge: true });
      await createAuditLog({ action: 'UPDATE', module: 'Settings', entityType: 'application_preference', description: 'Updated application preferences', severity: 'info' });
      setSaved(prefs);
      addToast('Preferences saved.');
    } catch (err) {
      addToast('Failed to save preferences.', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ padding: '24px 0', color: T.color.secondary, fontSize: '13px' }}>Loading preferences…</div>;

  const RadioGroup = ({ label, description, name, options, value, onChange }) => (
    <Row label={label} description={description} last={false}>
      <div style={{ display: 'flex', gap: '12px' }}>
        {options.map(o => (
          <label
            key={o.value}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: value === o.value ? '600' : '400',
              color: value === o.value ? T.color.text : T.color.secondary,
              padding: '6px 12px',
              borderRadius: T.radius.sm,
              background: value === o.value ? '#F0F5FF' : 'transparent',
              border: value === o.value ? '1px solid #C7D7FE' : '1px solid transparent',
              transition: 'all 0.15s',
            }}
          >
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
              style={{ accentColor: T.color.primary, width: '15px', height: '15px', margin: 0, cursor: 'pointer' }}
            />
            {o.label}
          </label>
        ))}
      </div>
    </Row>
  );

  return (
    <div>
      <SectionCard title="Application Preferences" description="Customize how the NexRide AO dashboard behaves.">
        <RadioGroup
          label="Time Format"
          name="timeFormat"
          value={prefs.timeFormat}
          onChange={v => set('timeFormat', v)}
          options={[{ value: '12h', label: '12-hour' }, { value: '24h', label: '24-hour' }]}
        />
        <RadioGroup
          label="Date Format"
          name="dateFormat"
          value={prefs.dateFormat}
          onChange={v => set('dateFormat', v)}
          options={[{ value: 'DD/MM/YYYY', label: 'DD/MM/YYYY' }, { value: 'MM/DD/YYYY', label: 'MM/DD/YYYY' }]}
        />
        <Row label="Rows Per Page" description="Default number of rows to show in data tables." last={false}>
          <select
            value={prefs.rowsPerPage}
            onChange={e => set('rowsPerPage', e.target.value)}
            style={{
              height: '38px', padding: '0 12px', borderRadius: T.radius.sm,
              border: T.border, fontSize: '14px', color: T.color.text,
              background: T.color.surface, cursor: 'pointer', outline: 'none',
              fontWeight: '500', minWidth: '110px',
            }}
          >
            {['10','20','50','100'].map(n => <option key={n} value={n}>{n} rows</option>)}
          </select>
        </Row>
        <Row label="Auto-Refresh Data" description="Automatically refresh dashboard data in the background." last={true}>
          <Toggle checked={prefs.autoRefresh} onChange={v => set('autoRefresh', v)} />
        </Row>
      </SectionCard>

      {isDirty && (
        <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
          <Btn variant="primary" onClick={handleSave} disabled={saving} small>
            {saving ? 'Saving…' : 'Save Changes'}
          </Btn>
          <Btn onClick={() => setPrefs(saved)} disabled={saving} small>Discard</Btn>
        </div>
      )}
    </div>
  );
}

// ─── Section: System ──────────────────────────────────────────────────────────


// ─── Section: Legal ───────────────────────────────────────────────────────────

function LegalSection({ onViewLegal }) {
  return (
    <SectionCard title="Legal Documents" description="Review the official NexRide terms, policies, and agreements.">
      <Row label="Terms and Conditions" description="Review the terms governing use of NexRide and the NexRide AO platform." last={false}>
        <Btn onClick={() => onViewLegal('terms')} small>View →</Btn>
      </Row>
      <Row label="Privacy Policy" description="Review how NexRide handles and protects user and administrative data." last={true}>
        <Btn onClick={() => onViewLegal('privacy')} small>View →</Btn>
      </Row>
    </SectionCard>
  );
}

// ─── Main Settings Page ───────────────────────────────────────────────────────

export default function Settings() {
  const [activeSection, setActiveSection] = useState('profile');
  const [legalView, setLegalView]         = useState(null); // 'terms' | 'privacy' | null
  const [toast, setToast]                 = useState({ msg: '', type: 'success' });
  const user = auth.currentUser;

  const addToast = useCallback((msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: 'success' }), 3500);
  }, []);

  const handleViewLegal = (which) => setLegalView(which);
  const handleBackFromLegal = () => setLegalView(null);

  const renderContent = () => {
    if (legalView === 'terms')   return <LegalViewer title="Terms and Conditions" content={TERMS_CONTENT}   onBack={handleBackFromLegal} />;
    if (legalView === 'privacy') return <LegalViewer title="Privacy Policy"       content={PRIVACY_CONTENT} onBack={handleBackFromLegal} />;

    switch (activeSection) {
      case 'profile':       return <ProfileSection user={user} />;
      case 'security':      return <SecuritySection />;
      case 'notifications': return <NotificationsSection uid={user?.uid} addToast={addToast} />;
      case 'application':   return <ApplicationSection uid={user?.uid} addToast={addToast} />;

      case 'legal':         return <LegalSection onViewLegal={handleViewLegal} />;
      default:              return null;
    }
  };

  return (
    <>
      <style>{`
        @keyframes settingsToastIn {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @media (prefers-reduced-motion: reduce) {
          *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
        }
      `}</style>

      <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>

        {/* Page Header */}
        <div className="header" style={{ flexShrink: 0, marginBottom: '20px' }}>
          <div>
            <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: T.color.text, letterSpacing: '-0.4px' }}>Settings</h1>
            <p style={{ margin: '4px 0 0 0', fontSize: '13px', color: T.color.secondary }}>
              Manage your NexRide AO account, preferences, security, and legal information.
            </p>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, display: 'flex', gap: '24px', minHeight: 0, overflowY: 'auto' }}>

          {/* Left Navigation */}
          {!legalView && (
            <div style={{
              width: '240px', flexShrink: 0,
              background: T.color.surface,
              border: T.border,
              borderRadius: T.radius.lg,
              padding: '10px',
              alignSelf: 'flex-start',
              boxShadow: '0 1px 3px rgba(16, 24, 40, 0.04)',
            }}>
              <div style={{
                fontSize: '11.5px',
                fontWeight: '700',
                color: T.color.secondary,
                textTransform: 'uppercase',
                letterSpacing: '0.8px',
                padding: '8px 12px 10px 12px',
              }}>
                Settings
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {NAV_ITEMS.map(item => {
                  const isActive = activeSection === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => setActiveSection(item.id)}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: '11px 14px',
                        borderRadius: '10px',
                        border: 'none',
                        background: isActive ? '#EAF1FF' : 'transparent',
                        color: isActive ? T.color.primary : '#475467',
                        fontSize: '14.5px',
                        fontWeight: isActive ? '600' : '500',
                        cursor: 'pointer',
                        textAlign: 'left',
                        transition: 'background 0.15s, color 0.15s',
                        boxSizing: 'border-box',
                      }}
                      onMouseEnter={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = '#F8FAFC';
                          e.currentTarget.style.color = '#1D2939';
                        }
                      }}
                      onMouseLeave={e => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#475467';
                        }
                      }}
                    >
                      <item.Icon
                        width={20}
                        height={20}
                        style={{
                          display: 'block',
                          flexShrink: 0,
                          color: isActive ? T.color.primary : '#64748B',
                          transition: 'color 0.15s',
                        }}
                      />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Right Content */}
          <div style={{ flex: 1, minWidth: 0, paddingBottom: '24px' }}>
            {!legalView && (
              <div style={{ marginBottom: '20px' }}>
                <SectionTitle>{NAV_ITEMS.find(n => n.id === activeSection)?.label}</SectionTitle>
              </div>
            )}
            {renderContent()}
          </div>
        </div>
      </div>

      <Toast msg={toast.msg} type={toast.type} />
    </>
  );
}
