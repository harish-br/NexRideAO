import React from 'react';
import documentIcon from '../../assets/svg/document-text.svg';
import timeIcon    from '../../assets/svg/record-circle.svg';
import userIcon    from '../../assets/svg/profile-2user.svg';
import alertIcon   from '../../assets/svg/notification.svg';

const CARDS = (stats) => [
  { label: 'Total Events',    value: stats.total,    icon: documentIcon },
  { label: "Today's Events",  value: stats.today,    icon: timeIcon     },
  { label: 'Admin Actions',   value: stats.admin,    icon: userIcon     },
  { label: 'Critical Events', value: stats.critical, icon: alertIcon    },
];

export default function AuditLogSummary({ stats }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '16px',
      marginBottom: '20px',
    }}>
      {CARDS(stats).map(card => (
        <div
          key={card.label}
          style={{
            background: '#fff',
            border: '1px solid #E7EAF0',
            borderRadius: '14px',
            padding: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '14px',
            boxShadow: '0 1px 3px rgba(16,24,40,0.04)',
          }}
        >
          <div style={{
            width: '38px', height: '38px', flexShrink: 0,
            background: '#F6F8FB',
            borderRadius: '10px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img src={card.icon} alt="" style={{ width: '18px', height: '18px', opacity: 0.55 }} />
          </div>
          <div>
            <div style={{ fontSize: '12px', color: '#667085', fontWeight: '500', marginBottom: '4px' }}>
              {card.label}
            </div>
            <div style={{ fontSize: '26px', fontWeight: '700', color: '#111827', lineHeight: 1, letterSpacing: '-0.5px' }}>
              {card.value}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
