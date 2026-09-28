import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { Search, Plus, Trash2, Send, AlertCircle, X } from 'lucide-react';

const inputStyle = {
  padding: '10px 12px',
  borderRadius: '8px',
  border: '1px solid rgba(0,0,0,0.15)',
  background: '#fff',
  outline: 'none',
  fontSize: '14px',
  width: '100%',
  boxSizing: 'border-box'
};

const FormGroup = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '16px' }}>
    <label style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>{label}</label>
    {children}
  </div>
);

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  const [viewMode, setViewMode] = useState('list'); // 'list', 'create'
  
  // Create form state
  const [formData, setFormData] = useState({
    title: '',
    message: '',
    type: 'GENERAL_ANNOUNCEMENT',
    targetAudience: 'all_users'
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, 'notifications'), (snapshot) => {
        const notifsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        notifsData.sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        setNotifications(notifsData);
        setLoading(false);
      }, (err) => {
        console.error("Firestore error on notifications:", err);
        setLoading(false);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setLoading(false);
    }
  }, []);

  const handleCreate = () => {
    setFormData({ title: '', message: '', type: 'GENERAL_ANNOUNCEMENT', targetAudience: 'all_users' });
    setViewMode('create');
  };

  const handleBackToList = () => {
    setViewMode('list');
  };

  const handleDelete = async (notif) => {
    if (window.confirm(`Are you sure you want to delete notification "${notif.title}"?`)) {
      try {
        await deleteDoc(doc(db, 'notifications', notif.id));
      } catch (err) {
        console.error("Failed to delete notification:", err);
      }
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    
    try {
      await addDoc(collection(db, 'notifications'), {
        ...formData,
        createdAt: new Date().toISOString(),
        status: 'sent'
      });
      handleBackToList();
    } catch (err) {
      setError('Failed to send notification: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const filteredNotifs = notifications.filter(n => 
    (n.title || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (n.message || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTypeStyle = (type) => {
    switch(type) {
      case 'GENERAL_ANNOUNCEMENT': return { color: '#2563EB', bg: '#EFF6FF', label: 'Announcement' };
      case 'SAFETY_ALERT': return { color: '#DC2626', bg: '#FEF2F2', label: 'Safety Alert' };
      case 'BUS_DELAYED': return { color: '#D97706', bg: '#FFFBEB', label: 'Delay' };
      default: return { color: '#6B7280', bg: '#F3F4F6', label: type || 'Notice' };
    }
  };
  
  const formatDate = (dateString) => {
    if (!dateString) return '-';
    try {
      const d = new Date(dateString);
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    } catch (e) {
      return dateString;
    }
  };

  return (
    <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="header">
        <div>
          <h1>Notification Center</h1>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: '4px 0 0 0' }}>Create and dispatch push notifications and broadcast alerts.</p>
        </div>
      </div>
      
      <div style={{ flex: 1, padding: '4px', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', padding: '20px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
              <div className="skeleton" style={{ height: '100px', borderRadius: '12px' }}></div>
              <div className="skeleton" style={{ height: '100px', borderRadius: '12px' }}></div>
              <div className="skeleton" style={{ height: '100px', borderRadius: '12px' }}></div>
              <div className="skeleton" style={{ height: '100px', borderRadius: '12px' }}></div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px' }}>
              <div className="skeleton" style={{ width: '300px', height: '42px', borderRadius: '10px' }}></div>
              <div className="skeleton" style={{ width: '150px', height: '42px', borderRadius: '10px' }}></div>
            </div>
            <div className="skeleton" style={{ flex: 1, width: '100%', borderRadius: '16px', minHeight: '300px' }}></div>
          </div>
        ) : (
          <>
            {viewMode === 'list' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {/* Stats */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                  <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #eee' }}>
                    <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>Total Sent</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px' }}>{notifications.length}</div>
                  </div>
                  <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #eee' }}>
                    <div style={{ fontSize: '13px', color: '#2563EB', fontWeight: '600' }}>Announcements</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: '#2563EB' }}>
                      {notifications.filter(n => n.type === 'GENERAL_ANNOUNCEMENT').length}
                    </div>
                  </div>
                  <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #eee' }}>
                    <div style={{ fontSize: '13px', color: '#DC2626', fontWeight: '600' }}>Safety Alerts</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: '#DC2626' }}>
                      {notifications.filter(n => n.type === 'SAFETY_ALERT').length}
                    </div>
                  </div>
                  <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #eee' }}>
                    <div style={{ fontSize: '13px', color: '#059669', fontWeight: '600' }}>Targeted Alerts</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: '#059669' }}>
                      {notifications.filter(n => n.targetAudience !== 'all_users').length}
                    </div>
                  </div>
                </div>

                {/* Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                  <div style={{ display: 'flex', gap: '12px' }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={18} color="#999" style={{ position: 'absolute', left: '12px', top: '10px' }} />
                      <input 
                        type="text" 
                        placeholder="Search notifications..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                          padding: '0 16px 0 40px', height: '42px', borderRadius: '10px',
                          border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)',
                          outline: 'none', width: '280px', fontSize: '14px', transition: 'border-color 0.2s'
                        }}
                      />
                    </div>
                  </div>

                  <button 
                    onClick={handleCreate}
                    style={{
                      display: 'flex', alignItems: 'center', gap: '8px', background: '#2563EB', color: 'white',
                      border: 'none', padding: '10px 24px', height: '42px', borderRadius: '10px', fontSize: '14px',
                      fontWeight: '600', cursor: 'pointer', boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)'
                    }}
                  >
                    <Plus size={18} strokeWidth={2.5} />
                    Create Notification
                  </button>
                </div>

                {/* Table */}
                <div style={{ 
                  flex: 1, background: 'rgba(255, 255, 255, 0.4)', borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.8)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
                }}>
                  <div style={{ 
                    display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr 80px', 
                    padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)',
                    fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', textAlign: 'left'
                  }}>
                    <div>Notification Title / Content</div>
                    <div>Type</div>
                    <div>Audience</div>
                    <div>Date Sent</div>
                    <div style={{ textAlign: 'center' }}>Action</div>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filteredNotifs.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>No notifications found.</div>
                    ) : (
                      filteredNotifs.map(notif => {
                        const style = getTypeStyle(notif.type);
                        return (
                          <div key={notif.id} style={{ 
                            display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1.5fr 80px', 
                            padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.03)',
                            alignItems: 'center', fontSize: '14px', color: '#111'
                          }}>
                            <div>
                              <div style={{ fontWeight: '600', marginBottom: '4px' }}>{notif.title || '-'}</div>
                              <div style={{ fontSize: '13px', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '300px' }}>
                                {notif.message || '-'}
                              </div>
                            </div>
                            <div>
                              <span style={{ 
                                color: style.color, background: style.bg, padding: '4px 10px', 
                                borderRadius: '100px', fontSize: '12px', fontWeight: '600', whiteSpace: 'nowrap'
                              }}>
                                {style.label}
                              </span>
                            </div>
                            <div style={{ fontSize: '13px' }}>
                              {notif.targetAudience === 'all_users' ? 'Broadcast (All)' : 'Targeted'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6B7280' }}>{formatDate(notif.createdAt)}</div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button onClick={() => handleDelete(notif)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }} title="Delete">
                                <Trash2 size={18} />
                              </button>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {viewMode === 'create' && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(255, 255, 255, 0.6)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111' }}>Compose Notification</h2>
                  <button onClick={handleBackToList} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <X size={24} color="#444" />
                  </button>
                </div>
                
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
                  {error && (
                    <div style={{ padding: '12px', background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <AlertCircle size={16} /> {error}
                    </div>
                  )}
                  
                  <form onSubmit={handleSubmit} style={{ maxWidth: '600px', margin: '0 auto', background: '#fff', padding: '24px', borderRadius: '12px', border: '1px solid #eee' }}>
                    <FormGroup label="Notification Title *">
                      <input 
                        type="text" required style={inputStyle} 
                        value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} 
                        placeholder="e.g. Bus Delay Alert" 
                      />
                    </FormGroup>
                    
                    <FormGroup label="Message Content *">
                      <textarea 
                        required style={{...inputStyle, minHeight: '120px', resize: 'vertical'}} 
                        value={formData.message} onChange={e => setFormData({...formData, message: e.target.value})} 
                        placeholder="Enter the notification message..." 
                      />
                    </FormGroup>
                    
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                      <FormGroup label="Notification Type *">
                        <select style={inputStyle} value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                          <option value="GENERAL_ANNOUNCEMENT">General Announcement</option>
                          <option value="BUS_DELAYED">Bus Delay</option>
                          <option value="ROUTE_UPDATED">Route Update</option>
                          <option value="SAFETY_ALERT">Safety Alert</option>
                        </select>
                      </FormGroup>
                      
                      <FormGroup label="Target Audience *">
                        <select style={inputStyle} value={formData.targetAudience} onChange={e => setFormData({...formData, targetAudience: e.target.value})}>
                          <option value="all_users">All Users (Broadcast)</option>
                          <option value="specific_route">Specific Route Passengers</option>
                        </select>
                      </FormGroup>
                    </div>
                    
                    <button 
                      type="submit" 
                      disabled={submitting}
                      style={{
                        marginTop: '20px', width: '100%', padding: '12px', background: '#2563EB', color: '#fff', 
                        border: 'none', borderRadius: '8px', fontSize: '15px', fontWeight: '600', 
                        cursor: submitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px'
                      }}
                    >
                      <Send size={18} /> {submitting ? 'Sending...' : 'Dispatch Notification'}
                    </button>
                  </form>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
