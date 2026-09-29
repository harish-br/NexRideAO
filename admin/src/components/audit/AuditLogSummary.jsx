import React from 'react';
import documentIcon from '../../assets/svg/document-text.svg';
import timeIcon from '../../assets/svg/record-circle.svg';
import alertIcon from '../../assets/svg/notification.svg';
import userIcon from '../../assets/svg/profile-2user.svg';

export default function AuditLogSummary({ stats }) {
  const cards = [
    { label: 'Total Events', value: stats.total, icon: documentIcon, color: '#3B82F6' },
    { label: 'Today', value: stats.today, icon: timeIcon, color: '#10B981' },
    { label: 'Admin Actions', value: stats.admin, icon: userIcon, color: '#8B5CF6' },
    { label: 'Critical Events', value: stats.critical, icon: alertIcon, color: '#EF4444' }
  ];

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
      {cards.map((card, i) => (
        <div key={i} style={{ 
          background: 'rgba(255, 255, 255, 0.7)', backdropFilter: 'blur(10px)',
          border: '1px solid rgba(255, 255, 255, 0.8)', padding: '20px', 
          borderRadius: '16px', display: 'flex', alignItems: 'center', gap: '16px',
          boxShadow: '0 4px 6px -1px rgba(0,0,0,0.05)'
        }}>
          <div style={{ background: `${card.color}15`, padding: '12px', borderRadius: '12px', color: card.color, display: 'flex' }}>
            <img src={card.icon} alt="" style={{ width: '24px', height: '24px', filter: card.color === '#3B82F6' ? 'invert(47%) sepia(87%) saturate(2853%) hue-rotate(204deg) brightness(97%) contrast(92%)' : card.color === '#10B981' ? 'invert(58%) sepia(85%) saturate(366%) hue-rotate(113deg) brightness(94%) contrast(89%)' : card.color === '#8B5CF6' ? 'invert(41%) sepia(91%) saturate(2878%) hue-rotate(244deg) brightness(98%) contrast(94%)' : 'invert(37%) sepia(89%) saturate(1600%) hue-rotate(338deg) brightness(92%) contrast(100%)' }} />
          </div>
          <div>
            <div style={{ fontSize: '13px', color: '#6B7280', fontWeight: '500' }}>{card.label}</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginTop: '2px' }}>{card.value}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
