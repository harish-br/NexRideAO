import React from 'react';
import RefreshArrowIcon from '../../assets/svg/refresh-arrow2.svg?react';

export default function RefreshButton({ onClick, loading = false, label = 'Refresh', title = 'Refresh data', style = {} }) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        background: '#F3F4F6',
        color: '#374151',
        border: 'none',
        padding: label ? '10px 16px' : '10px',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: '600',
        cursor: loading ? 'not-allowed' : 'pointer',
        transition: 'all 0.2s ease',
        ...style
      }}
      onMouseEnter={(e) => {
        if (!loading) e.currentTarget.style.background = '#E5E7EB';
      }}
      onMouseLeave={(e) => {
        if (!loading) e.currentTarget.style.background = style.background || '#F3F4F6';
      }}
    >
      <RefreshArrowIcon
        width={16}
        height={16}
        className={loading ? 'spin' : ''}
        style={{ color: 'currentColor', display: 'block', flexShrink: 0 }}
      />
      {label && <span>{label}</span>}
    </button>
  );
}
