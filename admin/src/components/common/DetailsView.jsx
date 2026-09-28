import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function DetailsView({ title, subtitle, data, onBack, onEdit, onDelete }) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'rgba(255, 255, 255, 0.4)', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.8)', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} color="#444" />
          </button>
          <div>
            <h2 style={{ margin: 0, fontSize: '20px', fontWeight: '700', color: '#111', display: 'flex', alignItems: 'center', gap: '12px' }}>
              {title}
              {subtitle && <span style={{ fontSize: '14px', color: '#6B7280', fontWeight: '500' }}>{subtitle}</span>}
            </h2>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          {onEdit && (
            <button onClick={onEdit} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#F3F4F6', color: '#111', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                <path d="M15.7999 2.21048C15.3899 1.80048 14.6799 2.08048 14.6799 2.65048V6.14048C14.6799 7.60048 15.9199 8.81048 17.4299 8.81048C18.3799 8.82048 19.6999 8.82048 20.8299 8.82048C21.3999 8.82048 21.6999 8.15048 21.2999 7.75048C19.8599 6.30048 17.2799 3.69048 15.7999 2.21048Z"/>
                <path d="M20.5 10.19H17.61C15.24 10.19 13.31 8.26 13.31 5.89V3C13.31 2.45 12.86 2 12.31 2H8.07C4.99 2 2.5 4 2.5 7.57V16.43C2.5 20 4.99 22 8.07 22H15.93C19.01 22 21.5 20 21.5 16.43V11.19C21.5 10.64 21.05 10.19 20.5 10.19ZM11.5 17.75H7.5C7.09 17.75 6.75 17.41 6.75 17C6.75 16.59 7.09 16.25 7.5 16.25H11.5C11.91 16.25 12.25 16.59 12.25 17C12.25 17.41 11.91 17.75 11.5 17.75ZM13.5 13.75H7.5C7.09 13.75 6.75 13.41 6.75 13C6.75 12.59 7.09 12.25 7.5 12.25H13.5C13.91 12.25 14.25 12.59 14.25 13C14.25 13.41 13.91 13.75 13.5 13.75Z"/>
              </svg> Edit
            </button>
          )}
          {onDelete && (
            <button onClick={onDelete} style={{ display: 'flex', alignItems: 'center', gap: '8px', background: '#FEE2E2', color: '#DC2626', border: 'none', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M21 5.98047C17.67 5.65047 14.32 5.48047 10.98 5.48047C9 5.48047 7.02 5.58047 5.04 5.78047L3 5.98047" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M8.5 4.97L8.72 3.66C8.88 2.71 9 2 10.69 2H13.31C15 2 15.13 2.75 15.28 3.67L15.5 4.97" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M18.85 9.14062L18.2 19.2106C18.09 20.7806 18 22.0006 15.21 22.0006H8.79002C6.00002 22.0006 5.91002 20.7806 5.80002 19.2106L5.15002 9.14062" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg> Delete
            </button>
          )}
        </div>
      </div>

      <div style={{ overflowY: 'auto', flex: 1, padding: '24px' }}>
        <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)', background: '#F9FAFB' }}>
            <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#111' }}>Details</h3>
          </div>
          <div style={{ padding: '20px', display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '24px' }}>
            {data.map((item, index) => (
              <div key={index}>
                <div style={{ fontSize: '13px', color: '#6B7280', marginBottom: '4px', fontWeight: '500' }}>{item.label}</div>
                <div style={{ fontSize: '15px', color: '#111', fontWeight: '600', wordBreak: 'break-word' }}>
                  {item.element ? item.element : (item.value || '-')}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
