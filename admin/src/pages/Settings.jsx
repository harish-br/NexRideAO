import React from 'react';

export default function Settings() {
  return (
    <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="header">
        <h1>Settings</h1>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', flex: 1, padding: '4px' }}>
        <div style={{ display: 'flex', gap: '16px' }}>
          <div className="skeleton" style={{ flex: 1, height: '140px', borderRadius: '16px' }}></div>
          <div className="skeleton" style={{ flex: 1, height: '140px', borderRadius: '16px' }}></div>
        </div>
        <div className="skeleton" style={{ width: '45%', height: '24px', borderRadius: '8px', marginTop: '16px', marginBottom: '8px' }}></div>
        <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '12px' }}></div>
        <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '12px' }}></div>
        <div className="skeleton" style={{ width: '100%', height: '80px', borderRadius: '12px' }}></div>
      </div>
    </div>
  );
}
