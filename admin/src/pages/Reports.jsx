import React, { useState, useEffect } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, doc, updateDoc, deleteDoc, addDoc } from 'firebase/firestore';
import { Search, Edit2, Trash2, X, Save } from 'lucide-react';

export default function Reports() {
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  
  const [viewMode, setViewMode] = useState('list');
  const [selectedReport, setSelectedReport] = useState(null);
  const [adminResponse, setAdminResponse] = useState('');
  
  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, 'reports'), (snapshot) => {
        const reportsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort by date descending if createdAt exists
        reportsData.sort((a, b) => {
          if (!a.createdAt) return 1;
          if (!b.createdAt) return -1;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
        setReports(reportsData);
        setTimeout(() => setLoading(false), 400);
      }, (err) => {
        console.error("Firestore error on reports:", err);
        setTimeout(() => setLoading(false), 400);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setTimeout(() => setLoading(false), 400);
    }
  }, []);

  const handleEdit = (report) => {
    setSelectedReport(report);
    setAdminResponse(report.adminResponse || report.resolution || report.adminReply || '');
    setViewMode('edit');
  };

  const handleBackToList = () => {
    setSelectedReport(null);
    setAdminResponse('');
    setViewMode('list');
  };

  const handleDelete = async (report) => {
    if (window.confirm(`Are you sure you want to delete report ${report.id}?`)) {
      try {
        await deleteDoc(doc(db, 'reports', report.id));
      } catch (err) {
        console.error("Failed to delete report:", err);
      }
    }
  };

  const handleUpdateStatus = async (status) => {
    if (!selectedReport) return;
    try {
      const now = new Date().toISOString();
      const updateData = {
        status: status,
        updatedAt: now,
        adminResponse: adminResponse.trim()
      };
      
      // Update the report document
      await updateDoc(doc(db, 'reports', selectedReport.id), updateData);
      
      // If the report belongs to a user, send them a notification about the update
      if (selectedReport.userId) {
        let notifBody = `Your report status has been updated to ${status}.`;
        if (adminResponse.trim()) {
          notifBody += `\n\nAdmin Message: ${adminResponse.trim()}`;
        }
        
        await addDoc(collection(db, 'users', selectedReport.userId, 'notifications'), {
          title: `Report Update: ${selectedReport.reportNumber || selectedReport.id.substring(0,8)}`,
          body: notifBody,
          type: 'report_status',
          reportId: selectedReport.id,
          read: false,
          createdAt: now
        });
      }
      
      handleBackToList();
    } catch (err) {
      console.error("Failed to update report status:", err);
    }
  };

  const filteredReports = reports.filter(r => {
    const matchesSearch = 
      (r.id || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.userName || r.reporterName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (r.subject || '').toLowerCase().includes(searchTerm.toLowerCase());
      
    const matchesStatus = statusFilter === 'All' || r.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'submitted': return '#D97706'; // Orange
      case 'in progress': return '#2563EB'; // Blue
      case 'resolved': return '#16A34A'; // Green
      case 'rejected': return '#DC2626'; // Red
      default: return '#6B7280';
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
          <h1>Issues &amp; Support Console</h1>
          <p style={{ color: '#6B7280', fontSize: '14px', margin: '4px 0 0 0' }}>Review, assign, and resolve student incident reports.</p>
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
                    <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '600' }}>Total Reports</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px' }}>{reports.length}</div>
                  </div>
                  <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #eee' }}>
                    <div style={{ fontSize: '13px', color: '#D97706', fontWeight: '600' }}>Pending Review</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: '#D97706' }}>
                      {reports.filter(r => r.status?.toLowerCase() === 'submitted').length}
                    </div>
                  </div>
                  <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #eee' }}>
                    <div style={{ fontSize: '13px', color: '#2563EB', fontWeight: '600' }}>In Progress</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: '#2563EB' }}>
                      {reports.filter(r => r.status?.toLowerCase() === 'in progress').length}
                    </div>
                  </div>
                  <div style={{ background: '#fff', padding: '16px 20px', borderRadius: '12px', border: '1px solid #eee' }}>
                    <div style={{ fontSize: '13px', color: '#DC2626', fontWeight: '600' }}>Critical / Safety</div>
                    <div style={{ fontSize: '24px', fontWeight: '700', marginTop: '8px', color: '#DC2626' }}>
                      {reports.filter(r => r.category?.toLowerCase() === 'safety').length}
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
                        placeholder="Search reports..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        style={{
                          padding: '0 16px 0 40px', height: '42px', borderRadius: '10px',
                          border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)',
                          outline: 'none', width: '260px', fontSize: '14px', transition: 'border-color 0.2s'
                        }}
                      />
                    </div>
                    <select 
                      value={statusFilter}
                      onChange={(e) => setStatusFilter(e.target.value)}
                      style={{
                        padding: '0 16px', height: '42px', borderRadius: '10px',
                        border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.8)',
                        outline: 'none', fontSize: '14px', cursor: 'pointer'
                      }}
                    >
                      <option value="All">All Statuses</option>
                      <option value="Submitted">Submitted</option>
                      <option value="In Progress">In Progress</option>
                      <option value="Resolved">Resolved</option>
                      <option value="Rejected">Rejected</option>
                    </select>
                  </div>
                </div>

                {/* Table */}
                <div style={{ 
                  flex: 1, background: 'rgba(255, 255, 255, 0.4)', borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.8)', overflow: 'hidden', display: 'flex', flexDirection: 'column'
                }}>
                  <div style={{ 
                    display: 'grid', gridTemplateColumns: '120px 1.5fr 1.5fr 1.5fr 120px 150px 80px', 
                    padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.05)',
                    fontSize: '12px', fontWeight: '600', color: '#6B7280', textTransform: 'uppercase', textAlign: 'center'
                  }}>
                    <div style={{ textAlign: 'left' }}>Ticket ID</div>
                    <div style={{ textAlign: 'left' }}>Reporter</div>
                    <div style={{ textAlign: 'left' }}>Category &amp; Subject</div>
                    <div>Bus / Route</div>
                    <div>Status</div>
                    <div>Date</div>
                    <div>Action</div>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {filteredReports.length === 0 ? (
                      <div style={{ padding: '40px', textAlign: 'center', color: '#6B7280' }}>No reports found.</div>
                    ) : (
                      filteredReports.map(report => (
                        <div key={report.id} style={{ 
                          display: 'grid', gridTemplateColumns: '120px 1.5fr 1.5fr 1.5fr 120px 150px 80px', 
                          padding: '16px 20px', borderBottom: '1px solid rgba(0,0,0,0.03)',
                          alignItems: 'center', fontSize: '14px', color: '#111', textAlign: 'center'
                        }}>
                          <div style={{ fontWeight: '600', textAlign: 'left', color: '#2563EB', fontSize: '12px' }}>{report.id.substring(0,8)}...</div>
                          <div style={{ textAlign: 'left' }}>{report.userName || report.reporterName || 'Unknown'}</div>
                          <div style={{ textAlign: 'left' }}>
                            <div style={{ fontWeight: '600', fontSize: '13px' }}>{report.category || 'General'}</div>
                            <div style={{ fontSize: '12px', color: '#6B7280', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{report.subject || '-'}</div>
                          </div>
                          <div style={{ fontSize: '13px' }}>
                            {report.busNumber ? `Bus: ${report.busNumber}` : (report.routeName ? `Route: ${report.routeName}` : '-')}
                          </div>
                          <div>
                            <span style={{ 
                              color: getStatusColor(report.status),
                              background: `${getStatusColor(report.status)}15`,
                              padding: '4px 10px', borderRadius: '100px', fontSize: '12px', fontWeight: '600'
                            }}>
                              {report.status || 'Submitted'}
                            </span>
                          </div>
                          <div style={{ fontSize: '12px', color: '#6B7280' }}>{formatDate(report.createdAt)}</div>
                          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
                            <button onClick={() => handleEdit(report)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280' }} title="View/Edit">
                              <Edit2 size={18} />
                            </button>
                            <button onClick={() => handleDelete(report)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#EF4444' }} title="Delete">
                              <Trash2 size={18} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            )}
            
            {viewMode === 'edit' && selectedReport && (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(255, 255, 255, 0.6)', borderRadius: '16px', overflow: 'hidden' }}>
                <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
                  <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111' }}>Report Details</h2>
                  <button onClick={handleBackToList} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                    <X size={24} color="#444" />
                  </button>
                </div>
                
                <div style={{ padding: '24px', overflowY: 'auto', flex: 1, maxWidth: '800px', margin: '0 auto', width: '100%' }}>
                  <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #eee', padding: '24px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
                      <div>
                        <div style={{ fontSize: '12px', color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' }}>Reporter</div>
                        <div style={{ fontSize: '16px', fontWeight: '600', marginTop: '4px' }}>{selectedReport.userName || selectedReport.reporterName || 'Unknown'}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '12px', color: '#6B7280', fontWeight: '600', textTransform: 'uppercase' }}>Date</div>
                        <div style={{ fontSize: '14px', marginTop: '4px' }}>{formatDate(selectedReport.createdAt)}</div>
                      </div>
                    </div>
                    
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '12px', color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Subject</div>
                      <div style={{ fontSize: '16px', fontWeight: '600' }}>{selectedReport.subject || '-'}</div>
                    </div>
                    
                    <div>
                      <div style={{ fontSize: '12px', color: '#6B7280', fontWeight: '600', textTransform: 'uppercase', marginBottom: '4px' }}>Description</div>
                      <div style={{ fontSize: '15px', color: '#333', lineHeight: '1.5', background: '#f9fafb', padding: '16px', borderRadius: '8px' }}>
                        {selectedReport.description || 'No description provided.'}
                      </div>
                    </div>
                  </div>
                  
                  <div style={{ background: '#fff', borderRadius: '12px', border: '1px solid #eee', padding: '24px' }}>
                    <div style={{ marginBottom: '20px' }}>
                      <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 8px 0' }}>Admin Response</h3>
                      <p style={{ fontSize: '13px', color: '#6B7280', margin: '0 0 12px 0' }}>This response will be visible to the user in their app.</p>
                      <textarea 
                        value={adminResponse}
                        onChange={(e) => setAdminResponse(e.target.value)}
                        placeholder="Type your response or resolution details here..."
                        style={{
                          width: '100%', minHeight: '100px', padding: '12px', borderRadius: '8px',
                          border: '1px solid #ccc', fontSize: '14px', fontFamily: 'inherit', resize: 'vertical'
                        }}
                      />
                    </div>
                    
                    <h3 style={{ fontSize: '16px', fontWeight: '600', margin: '0 0 16px 0' }}>Update Status</h3>
                    <div style={{ display: 'flex', gap: '12px' }}>
                      <button onClick={() => handleUpdateStatus('In Progress')} style={{ padding: '10px 16px', background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Mark In Progress</button>
                      <button onClick={() => handleUpdateStatus('Resolved')} style={{ padding: '10px 16px', background: '#f0fdf4', color: '#16a34a', border: '1px solid #bbf7d0', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Mark Resolved</button>
                      <button onClick={() => handleUpdateStatus('Rejected')} style={{ padding: '10px 16px', background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Reject Report</button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
