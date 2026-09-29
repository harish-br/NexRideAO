import React, { useState, useEffect, useMemo } from 'react';
import { db } from '../firebase';
import { collection, onSnapshot, deleteDoc, doc } from 'firebase/firestore';
import StudentForm from '../components/students/StudentForm';
import { Plus, Edit, Trash2, Search, Edit2, Filter, ChevronLeft, ChevronRight, UserCircle } from 'lucide-react';
import DetailsView from '../components/common/DetailsView';
import ScrollingText from '../components/common/ScrollingText';
import RefreshButton from '../components/common/RefreshButton';

export default function Students() {
  const [students, setStudents] = useState([]);
  const [viewMode, setViewMode] = useState('list'); // 'list', 'add', 'edit'
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Search & Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [filterDept, setFilterDept] = useState('');
  const [filterFees, setFilterFees] = useState('');
  const [filterStage, setFilterStage] = useState('');
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  useEffect(() => {
    try {
      const unsubscribe = onSnapshot(collection(db, 'students'), (snapshot) => {
        const studentsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        // Sort by newest first based on createdAt if available
        studentsData.sort((a, b) => {
          const tA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tB - tA;
        });
        setStudents(studentsData);
        setTimeout(() => setLoading(false), 400);
      }, (err) => {
        console.error("Firestore error on students:", err);
        setTimeout(() => setLoading(false), 400);
      });
      return () => unsubscribe();
    } catch (e) {
      console.error(e);
      setTimeout(() => setLoading(false), 400);
    }
  }, []);

  const handleAdd = () => {
    setSelectedStudent(null);
    setViewMode('add');
  };

  const handleEdit = (student) => {
    setSelectedStudent(student);
    setViewMode('edit');
  };

  const handleView = (student) => {
    setSelectedStudent(student);
    setViewMode('details');
  };

  const handleBackToList = () => {
    setSelectedStudent(null);
    setViewMode('list');
  };

  const handleDelete = async (student) => {
    if (window.confirm(`Are you sure you want to delete passenger ${student.studentName}? This action cannot be undone.`)) {
      const remarks = window.prompt("Please enter remarks or reason for deletion:");
      if (remarks === null) return;
      try {
        await deleteDoc(doc(db, 'students', student.id));
        if (viewMode === 'details') handleBackToList();
      } catch (err) {
        console.error("Failed to delete student:", err);
      }
    }
  };

  const calculateFeesStatus = (student) => {
    const total = Number(student.feesTotal) || 0;
    const paid = Number(student.paidAmount) || 0;
    if (total === 0) return 'Pending';
    if (paid >= total) return 'Paid';
    return 'Pending';
  };

  const getStatusColor = (status) => {
    switch(status?.toLowerCase()) {
      case 'paid': return '#16A34A';
      case 'pending': return '#D97706';
      case 'overdue': return '#DC2626';
      default: return '#6B7280';
    }
  };

  // Derived filter options
  const uniqueYears = useMemo(() => [...new Set(students.map(s => s.academicYear).filter(Boolean))].sort(), [students]);
  const uniqueDepts = useMemo(() => [...new Set(students.map(s => s.department).filter(Boolean))].sort(), [students]);
  const uniqueStages = useMemo(() => [...new Set(students.map(s => s.stage).filter(Boolean))].sort(), [students]);

  // Filtering
  const filteredStudents = useMemo(() => {
    return students.filter(s => {
      const matchSearch = (s.studentName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (s.applicationNumber || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (s.phoneNumber || '').includes(searchTerm);
      const matchYear = filterYear ? s.academicYear === filterYear : true;
      const matchDept = filterDept ? s.department === filterDept : true;
      const matchFees = filterFees ? calculateFeesStatus(s).toLowerCase() === filterFees.toLowerCase() : true;
      const matchStage = filterStage ? s.stage === filterStage : true;
      return matchSearch && matchYear && matchDept && matchFees && matchStage;
    });
  }, [students, searchTerm, filterYear, filterDept, filterFees, filterStage]);

  // Pagination logic
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const currentStudents = filteredStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // Reset to page 1 if filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, filterYear, filterDept, filterFees, filterStage]);

  const selectStyle = {
    padding: '0 12px',
    height: '40px',
    borderRadius: '10px',
    border: '1px solid rgba(0,0,0,0.1)',
    background: 'rgba(255,255,255,0.8)',
    outline: 'none',
    fontSize: '13px',
    color: '#4B5563',
    cursor: 'pointer'
  };

  return (
    <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
      <div className="header" style={{ marginBottom: '0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <h1>Passengers / Students</h1>
          <div style={{ fontSize: '14px', color: '#6B7280', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <UserCircle size={16} />
            {students.length} registered
          </div>
        </div>
        <RefreshButton 
          loading={refreshing} 
          onClick={() => {
            setRefreshing(true);
            setTimeout(() => setRefreshing(false), 400);
          }} 
        />
      </div>
      
      <div style={{ flex: 1, padding: '4px', display: 'flex', flexDirection: 'column', minHeight: 0, marginTop: '16px' }}>
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
                {/* Action Bar */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '16px' }}>
                  <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', flex: 1 }}>
                    <div style={{ position: 'relative' }}>
                      <Search size={18} color="#999" style={{ position: 'absolute', left: '12px', top: '11px' }} />
                      <input 
                        type="text" 
                        placeholder="Search passengers..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        onFocus={(e) => e.target.style.borderColor = '#2563EB'}
                        onBlur={(e) => e.target.style.borderColor = 'rgba(0,0,0,0.1)'}
                        style={{
                          padding: '0 16px 0 40px',
                          height: '40px',
                          borderRadius: '10px',
                          border: '1px solid rgba(0,0,0,0.1)',
                          background: 'rgba(255,255,255,0.8)',
                          outline: 'none',
                          width: '240px',
                          fontSize: '14px',
                          transition: 'border-color 0.2s'
                        }}
                      />
                    </div>
                    
                    <select value={filterYear} onChange={e => setFilterYear(e.target.value)} style={selectStyle}>
                      <option value="">All Academic Years</option>
                      {uniqueYears.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>

                    <select value={filterDept} onChange={e => setFilterDept(e.target.value)} style={selectStyle}>
                      <option value="">All Departments</option>
                      {uniqueDepts.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>

                    <select value={filterStage} onChange={e => setFilterStage(e.target.value)} style={selectStyle}>
                      <option value="">All Stages</option>
                      {uniqueStages.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    <select value={filterFees} onChange={e => setFilterFees(e.target.value)} style={selectStyle}>
                      <option value="">All Fees Status</option>
                      <option value="Paid">Paid</option>
                      <option value="Pending">Pending</option>
                      <option value="Overdue">Overdue</option>
                    </select>
                  </div>

                  <button 
                    onClick={handleAdd}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = 'translateY(-1px)';
                      e.currentTarget.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.25)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = 'translateY(0)';
                      e.currentTarget.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.15)';
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      background: '#2563EB',
                      color: 'white',
                      border: 'none',
                      padding: '0 20px',
                      height: '40px',
                      borderRadius: '10px',
                      fontSize: '14px',
                      fontWeight: '600',
                      cursor: 'pointer',
                      boxShadow: '0 4px 12px rgba(37, 99, 235, 0.15)',
                      transition: 'all 0.2s ease-in-out',
                      whiteSpace: 'nowrap'
                    }}
                  >
                    <Plus size={18} strokeWidth={2.5} />
                    Add Passenger
                  </button>
                </div>

                {/* Table */}
                <div style={{ 
                  flex: 1, 
                  background: 'rgba(255, 255, 255, 0.6)', 
                  borderRadius: '16px', 
                  border: '1px solid rgba(255,255,255,0.8)',
                  boxShadow: '0 4px 20px rgba(0,0,0,0.02)',
                  overflow: 'hidden',
                  display: 'flex',
                  flexDirection: 'column'
                }}>
                  <div style={{ 
                    display: 'grid', 
                    gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr 80px', 
                    padding: '16px 24px', 
                    borderBottom: '1px solid rgba(0,0,0,0.06)',
                    fontSize: '12px',
                    fontWeight: '700',
                    color: '#6B7280',
                    letterSpacing: '0.5px',
                    textTransform: 'uppercase',
                    background: 'rgba(249, 250, 251, 0.5)'
                  }}>
                    <div>Passenger</div>
                    <div>Academic</div>
                    <div>Fees</div>
                    <div>Transport</div>
                    <div style={{ textAlign: 'center' }}>Actions</div>
                  </div>

                  <div style={{ overflowY: 'auto', flex: 1 }}>
                    {currentStudents.length === 0 ? (
                      <div style={{ padding: '80px 20px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                        <div style={{ background: '#F3F4F6', padding: '20px', borderRadius: '50%', marginBottom: '16px' }}>
                          <UserCircle size={48} color="#9CA3AF" />
                        </div>
                        <h3 style={{ margin: '0 0 8px 0', color: '#374151', fontSize: '18px' }}>No passengers found</h3>
                        <p style={{ margin: 0, color: '#6B7280', fontSize: '14px', maxWidth: '300px' }}>
                          {searchTerm || filterYear || filterDept || filterFees || filterStage ? 
                            "Try adjusting your search or filters to find what you're looking for." : 
                            "Add a passenger to start managing your transport records."}
                        </p>
                      </div>
                    ) : (
                      currentStudents.map(student => (
                        <div key={student.id} style={{ 
                          display: 'grid', 
                          gridTemplateColumns: '1.5fr 1fr 1fr 1.5fr 80px', 
                          padding: '16px 24px', 
                          borderBottom: '1px solid rgba(0,0,0,0.04)',
                          alignItems: 'center',
                          transition: 'background 0.2s',
                          cursor: 'default'
                        }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255,255,255,0.8)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          {/* Student Info */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ fontWeight: '600', color: '#111827', fontSize: '14px' }}>{student.studentName || '-'}</div>
                            <div style={{ color: '#6B7280', fontSize: '12px' }}>App No: {student.applicationNumber || '-'}</div>
                          </div>
                          
                          {/* Academic */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <div style={{ color: '#374151', fontSize: '14px' }}>{student.department || '-'}</div>
                            <div style={{ color: '#6B7280', fontSize: '12px' }}>{student.year || '-'} • {student.academicYear || '-'}</div>
                          </div>

                          {/* Fees */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', alignItems: 'flex-start' }}>
                            <div style={{ color: '#374151', fontSize: '14px', fontWeight: '500' }}>₹{student.feesTotal || '0'}</div>
                            <span style={{ 
                              color: getStatusColor(calculateFeesStatus(student)),
                              background: `${getStatusColor(calculateFeesStatus(student))}15`,
                              padding: '3px 10px',
                              borderRadius: '100px',
                              fontSize: '11px',
                              fontWeight: '600',
                              border: `1px solid ${getStatusColor(calculateFeesStatus(student))}30`
                            }}>
                              {calculateFeesStatus(student)}
                            </span>
                          </div>

                          {/* Transport */}
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', overflow: 'hidden' }}>
                            <div style={{ color: '#374151', fontSize: '14px', minWidth: 0 }}>
                              <ScrollingText text={student.stage || 'Unassigned Stage'} />
                            </div>
                            <div style={{ color: '#6B7280', fontSize: '12px', display: 'flex', gap: '8px' }}>
                              <span>{student.phoneNumber || 'No phone'}</span>
                              {student.routeNumber && <span style={{ color: '#2563EB', fontWeight: '500' }}>Bus {student.routeNumber}</span>}
                            </div>
                          </div>

                          {/* Actions */}
                          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                            <button onClick={() => handleView(student)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', padding: '4px' }} title="View Details"
                              onMouseEnter={e => e.currentTarget.style.color = '#2563EB'}
                              onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
                            >
                              <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                                <path d="M15 22.75H14C13.59 22.75 13.25 22.41 13.25 22C13.25 21.59 13.59 21.25 14 21.25H15C19.61 21.25 21.25 19.61 21.25 15V9C21.25 4.39 19.61 2.75 15 2.75H9C4.39 2.75 2.75 4.39 2.75 9V9.98C2.75 10.39 2.41 10.73 2 10.73C1.59 10.73 1.25 10.39 1.25 9.98V9C1.25 3.57 3.57 1.25 9 1.25H15C20.43 1.25 22.75 3.57 22.75 9V15C22.75 20.43 20.43 22.75 15 22.75Z"/>
                                <path d="M12.9999 11.7507C12.8099 11.7507 12.6199 11.6807 12.4699 11.5307C12.1799 11.2407 12.1799 10.7607 12.4699 10.4707L16.2099 6.7207H13.9999C13.5899 6.7207 13.2499 6.3807 13.2499 5.9707C13.2499 5.5607 13.5799 5.2207 13.9999 5.2207H18.0099C18.3099 5.2207 18.5899 5.4007 18.6999 5.6807C18.8199 5.9607 18.7499 6.2807 18.5399 6.5007L13.5299 11.5307C13.3799 11.6807 13.1899 11.7507 12.9999 11.7507Z"/>
                                <path d="M18.01 10.7407C17.6 10.7407 17.26 10.4007 17.26 9.9907V5.9707C17.26 5.5607 17.6 5.2207 18.01 5.2207C18.42 5.2207 18.76 5.5607 18.76 5.9707V9.9807C18.76 10.4007 18.42 10.7407 18.01 10.7407Z"/>
                                <path d="M7.85 22.75H5.15C2.49 22.75 1.25 21.51 1.25 18.85V16.15C1.25 13.49 2.49 12.25 5.15 12.25H7.85C10.51 12.25 11.75 13.49 11.75 16.15V18.85C11.75 21.51 10.51 22.75 7.85 22.75ZM5.15 13.75C3.31 13.75 2.75 14.31 2.75 16.15V18.85C2.75 20.69 3.31 21.25 5.15 21.25H7.85C9.69 21.25 10.25 20.69 10.25 18.85V16.15C10.25 14.31 9.69 13.75 7.85 13.75H5.15Z"/>
                              </svg>
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  
                  {/* Pagination Footer */}
                  {filteredStudents.length > 0 && (
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      alignItems: 'center',
                      padding: '16px 24px',
                      borderTop: '1px solid rgba(0,0,0,0.06)',
                      background: 'rgba(249, 250, 251, 0.3)'
                    }}>
                      <div style={{ fontSize: '13px', color: '#6B7280' }}>
                        Showing <b>{Math.min((currentPage - 1) * itemsPerPage + 1, filteredStudents.length)}</b> to <b>{Math.min(currentPage * itemsPerPage, filteredStudents.length)}</b> of <b>{filteredStudents.length}</b> passengers
                      </div>
                      
                      <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                        <button 
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', borderRadius: '6px',
                            background: currentPage === 1 ? 'transparent' : 'white',
                            border: '1px solid',
                            borderColor: currentPage === 1 ? 'transparent' : '#E5E7EB',
                            color: currentPage === 1 ? '#D1D5DB' : '#374151',
                            cursor: currentPage === 1 ? 'default' : 'pointer',
                            boxShadow: currentPage === 1 ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
                          }}
                        >
                          <ChevronLeft size={16} />
                        </button>
                        
                        <div style={{ fontSize: '13px', color: '#374151', padding: '0 8px' }}>
                          Page {currentPage} of {totalPages || 1}
                        </div>

                        <button 
                          disabled={currentPage === totalPages || totalPages === 0}
                          onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', borderRadius: '6px',
                            background: currentPage === totalPages || totalPages === 0 ? 'transparent' : 'white',
                            border: '1px solid',
                            borderColor: currentPage === totalPages || totalPages === 0 ? 'transparent' : '#E5E7EB',
                            color: currentPage === totalPages || totalPages === 0 ? '#D1D5DB' : '#374151',
                            cursor: currentPage === totalPages || totalPages === 0 ? 'default' : 'pointer',
                            boxShadow: currentPage === totalPages || totalPages === 0 ? 'none' : '0 1px 2px rgba(0,0,0,0.05)'
                          }}
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}
            
            {(viewMode === 'add' || viewMode === 'edit') && (
              <StudentForm 
                student={selectedStudent} 
                onBack={handleBackToList} 
                onSaveComplete={handleBackToList} 
              />
            )}
            {viewMode === 'details' && selectedStudent && (
              <DetailsView
                title={selectedStudent.studentName || 'Unknown Student'}
                data={[
                  { label: 'Department', value: selectedStudent.department },
                  { label: 'Year', value: selectedStudent.year },
                  { label: 'Academic Year', value: selectedStudent.academicYear },
                  { label: 'Phone Number', value: selectedStudent.phoneNumber },
                  { label: 'Stage', value: selectedStudent.stage },
                  { label: 'Route Number', value: selectedStudent.routeNumber },
                  { label: 'Fees Total', value: `₹${selectedStudent.feesTotal || '0'}` },
                  { label: 'Paid Amount', value: `₹${selectedStudent.paidAmount || '0'}` },
                  { label: 'Status', value: calculateFeesStatus(selectedStudent), element: (
                    <span style={{ 
                      color: getStatusColor(calculateFeesStatus(selectedStudent)),
                      background: `${getStatusColor(calculateFeesStatus(selectedStudent))}15`,
                      padding: '4px 10px',
                      borderRadius: '100px',
                      fontSize: '12px',
                      fontWeight: '600'
                    }}>
                      {calculateFeesStatus(selectedStudent)}
                    </span>
                  )}
                ]}
                onBack={handleBackToList}
                onEdit={() => handleEdit(selectedStudent)}
                onDelete={() => handleDelete(selectedStudent)}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
