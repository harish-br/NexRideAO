import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, deleteDoc, doc, addDoc } from 'firebase/firestore';
import { Search, Plus, Trash2, Send, AlertCircle, X } from 'lucide-react';
import DetailsView from '../components/common/DetailsView';

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
  
  const [viewMode, setViewMode] = useState('list'); // 'list', 'create', 'details'
  const [selectedNotification, setSelectedNotification] = useState(null);
  
  // Create form state
  const [formData, setFormData] = useState({
    title: '',
    body: '',
    type: 'GENERAL_ANNOUNCEMENT',
    target: 'all_users'
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
        setTimeout(() => setLoading(false), 400);
      }, (err) => {
        console.error("Firestore error on notifications:", err);
        setTimeout(() => setLoading(false), 400);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setTimeout(() => setLoading(false), 400);
    }
  }, []);

  const handleCreate = () => {
    setFormData({ title: '', body: '', type: 'GENERAL_ANNOUNCEMENT', target: 'all_users' });
    setViewMode('create');
  };

  const handleBackToList = () => {
    setViewMode('list');
    setSelectedNotification(null);
  };

  const handleView = (notif) => {
    setSelectedNotification(notif);
    setViewMode('details');
  };

  const handleDelete = async (notif) => {
    if (window.confirm(`Are you sure you want to delete notification "${notif.title}"?`)) {
      const remarks = window.prompt("Please enter remarks or reason for deletion:");
      if (remarks === null) return;
      try {
        await deleteDoc(doc(db, 'notifications', notif.id));
        if (viewMode === 'details') handleBackToList();
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
          <div className="animate-fade-in-up" style={{ animationDelay: '0.05s', flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
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
                                {notif.body || notif.message || '-'}
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
                              {notif.target === 'all_users' || notif.targetAudience === 'all_users' ? 'Broadcast (All)' : 'Targeted'}
                            </div>
                            <div style={{ fontSize: '12px', color: '#6B7280' }}>{formatDate(notif.createdAt)}</div>
                            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                              <button onClick={() => handleView(notif)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }} title="View">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                  <path d="M15 22.75H14C13.59 22.75 13.25 22.41 13.25 22C13.25 21.59 13.59 21.25 14 21.25H15C19.61 21.25 21.25 19.61 21.25 15V9C21.25 4.39 19.61 2.75 15 2.75H9C4.39 2.75 2.75 4.39 2.75 9V9.98C2.75 10.39 2.41 10.73 2 10.73C1.59 10.73 1.25 10.39 1.25 9.98V9C1.25 3.57 3.57 1.25 9 1.25H15C20.43 1.25 22.75 3.57 22.75 9V15C22.75 20.43 20.43 22.75 15 22.75Z"/>
                                  <path d="M12.9999 11.7507C12.8099 11.7507 12.6199 11.6807 12.4699 11.5307C12.1799 11.2407 12.1799 10.7607 12.4699 10.4707L16.2099 6.7207H13.9999C13.5899 6.7207 13.2499 6.3807 13.2499 5.9707C13.2499 5.5607 13.5799 5.2207 13.9999 5.2207H18.0099C18.3099 5.2207 18.5899 5.4007 18.6999 5.6807C18.8199 5.9607 18.7499 6.2807 18.5399 6.5007L13.5299 11.5307C13.3799 11.6807 13.1899 11.7507 12.9999 11.7507Z"/>
                                  <path d="M18.01 10.7407C17.6 10.7407 17.26 10.4007 17.26 9.9907V5.9707C17.26 5.5607 17.6 5.2207 18.01 5.2207C18.42 5.2207 18.76 5.5607 18.76 5.9707V9.9807C18.76 10.4007 18.42 10.7407 18.01 10.7407Z"/>
                                  <path d="M7.85 22.75H5.15C2.49 22.75 1.25 21.51 1.25 18.85V16.15C1.25 13.49 2.49 12.25 5.15 12.25H7.85C10.51 12.25 11.75 13.49 11.75 16.15V18.85C11.75 21.51 10.51 22.75 7.85 22.75ZM5.15 13.75C3.31 13.75 2.75 14.31 2.75 16.15V18.85C2.75 20.69 3.31 21.25 5.15 21.25H7.85C9.69 21.25 10.25 20.69 10.25 18.85V16.15C10.25 14.31 9.69 13.75 7.85 13.75H5.15Z"/>
                                </svg>
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
                        value={formData.body} onChange={e => setFormData({...formData, body: e.target.value})} 
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
                        <select style={inputStyle} value={formData.target} onChange={e => setFormData({...formData, target: e.target.value})}>
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

            {viewMode === 'details' && selectedNotification && (
              <DetailsView
                title={selectedNotification.title || 'Untitled Notification'}
                subtitle={getTypeStyle(selectedNotification.type).label}
                data={[
                  { label: 'Message', value: selectedNotification.body || selectedNotification.message },
                  { label: 'Audience', value: selectedNotification.target === 'all_users' || selectedNotification.targetAudience === 'all_users' ? 'Broadcast (All)' : 'Targeted' },
                  { label: 'Date Sent', value: formatDate(selectedNotification.createdAt) }
                ]}
                onBack={handleBackToList}
                onDelete={() => handleDelete(selectedNotification)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
