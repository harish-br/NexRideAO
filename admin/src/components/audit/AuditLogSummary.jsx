import React from 'react';
import { Activity, Clock, ShieldAlert, UserCheck } from 'lucide-react';

export default function AuditLogSummary({ stats }) {
  const cards = [
    { label: 'Total Events', value: stats.total, icon: Activity, color: '#3B82F6' },
    { label: 'Today', value: stats.today, icon: Clock, color: '#10B981' },
    { label: 'Admin Actions', value: stats.admin, icon: UserCheck, color: '#8B5CF6' },
    { label: 'Critical Events', value: stats.critical, icon: ShieldAlert, color: '#EF4444' }
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
          <div style={{ background: `${card.color}15`, padding: '12px', borderRadius: '12px', color: card.color }}>
            <card.icon size={24} />
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
