import React, { useState } from 'react';
import { auth } from '../firebase';
import { signInWithEmailAndPassword } from 'firebase/auth';
import NexRideLogo from '../assets/NexRide-AO.svg';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message || 'Failed to login');
      setLoading(false);
    }
  };

  return (
    <div style={{
      width: '100vw',
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#F9FAFB', // Off-white clean background
      fontFamily: 'Inter, system-ui, sans-serif'
    }}>
      <div className="animate-fade-in-up" style={{
        background: '#ffffff',
        border: '1px solid rgba(0, 0, 0, 0.05)',
        borderRadius: '24px',
        padding: '48px 40px',
        width: '400px',
        boxShadow: '0 20px 40px rgba(0, 0, 0, 0.04)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        boxSizing: 'border-box'
      }}>
        <img src={NexRideLogo} alt="NexRide AO" style={{
          width: '64px',
          height: '64px',
          marginBottom: '24px',
          objectFit: 'contain'
        }} />
        <h1 style={{ color: '#111827', fontSize: '26px', fontWeight: '800', marginBottom: '8px', margin: 0, letterSpacing: '-0.5px' }}>Admin Login</h1>
        <p style={{ color: '#6B7280', fontSize: '14px', marginBottom: '32px', textAlign: 'center' }}>Sign in to access the NexRide AO dashboard</p>
        
        {error && (
          <div style={{ width: '100%', padding: '12px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626', borderRadius: '8px', fontSize: '13px', marginBottom: '20px', boxSizing: 'border-box' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', color: '#374151', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Email Address</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                color: '#111827',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.2s',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
              }}
              onFocus={(e) => {
                e.target.style.border = '1px solid #3B82F6';
                e.target.style.background = '#FFFFFF';
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.border = '1px solid #E5E7EB';
                e.target.style.background = '#F9FAFB';
                e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.02)';
              }}
              placeholder="admin@example.com"
            />
          </div>
          <div>
            <label style={{ display: 'block', color: '#374151', fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>Password</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{
                width: '100%',
                padding: '12px 16px',
                background: '#F9FAFB',
                border: '1px solid #E5E7EB',
                borderRadius: '12px',
                color: '#111827',
                fontSize: '14px',
                outline: 'none',
                boxSizing: 'border-box',
                transition: 'all 0.2s',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.02)'
              }}
              onFocus={(e) => {
                e.target.style.border = '1px solid #3B82F6';
                e.target.style.background = '#FFFFFF';
                e.target.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.1)';
              }}
              onBlur={(e) => {
                e.target.style.border = '1px solid #E5E7EB';
                e.target.style.background = '#F9FAFB';
                e.target.style.boxShadow = 'inset 0 1px 2px rgba(0,0,0,0.02)';
              }}
              placeholder="••••••••"
            />
          </div>
          <button 
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              padding: '14px',
              background: '#2563EB',
              color: '#ffffff',
              border: 'none',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: '600',
              cursor: loading ? 'not-allowed' : 'pointer',
              marginTop: '8px',
              transition: 'all 0.2s',
              opacity: loading ? 0.8 : 1,
              boxShadow: '0 4px 12px rgba(37, 99, 235, 0.2)'
            }}
            onMouseEnter={(e) => {
              if(!loading) {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.3)';
              }
            }}
            onMouseLeave={(e) => {
              if(!loading) {
                e.currentTarget.style.transform = 'translateY(0)';
                e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.2)';
              }
            }}
          >
            {loading ? 'Authenticating...' : 'Sign In'}
          </button>
        </form>
      </div>
    </div>
  );
}
