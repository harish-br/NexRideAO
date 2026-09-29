import React, { useState, useEffect } from 'react';
import { ArrowLeft, Save, Upload, X, CheckCircle, AlertCircle } from 'lucide-react';
import { db, storage } from '../../firebase';
import { collection, addDoc, doc, updateDoc, getDocs, setDoc } from 'firebase/firestore';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { createAuditLog } from '../../services/auditLogger';

const MANUFACTURERS = ['Ashok Leyland', 'Tata', 'Eicher', 'Volvo', 'BharatBenz', 'Mahindra'];
const BHARAT_STAGES = ['BS-III', 'BS-IV', 'BS-VI'];
const STATUSES = ['Active', 'Inactive', 'Spare', 'Abandoned'];

const SectionHeader = ({ title }) => (
  <h3 style={{ fontSize: '15px', fontWeight: '700', color: '#111', margin: '24px 0 16px 0', borderBottom: '1px solid #eee', paddingBottom: '8px' }}>
    {title}
  </h3>
);

const FormGroup = ({ label, children }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
    <label style={{ fontSize: '12px', fontWeight: '600', color: '#555' }}>{label}</label>
    {children}
  </div>
);

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

export default function BusForm({ bus, onBack, onSaveComplete }) {
  const isEdit = !!bus;
  
  // Data State
  const [formData, setFormData] = useState({
    busNumber: bus?.busNumber || '',
    registrationNumber: bus?.registrationNumber || bus?.regNumber || '',
    manufacturer: bus?.manufacturer || 'Ashok Leyland',
    bharatStage: bus?.bharatStage || 'BS-VI',
    manufacturingYear: bus?.manufacturingYear || new Date().getFullYear(),
    capacity: bus?.capacity || bus?.seatCapacity || bus?.totalCapacity || 52,
    standingCapacity: bus?.standingCapacity || 0,
    status: bus?.status || 'Active',
    
    assignedDriverId: bus?.assignedDriverId || '',
    assignedDriverName: bus?.assignedDriverName || bus?.driverName || '',
    assignedRouteId: bus?.assignedRouteId || '',
    assignedRouteName: bus?.assignedRouteName || bus?.routeName || bus?.route || '',
    coverageType: bus?.coverageType || 'full_route',
    driverContact: bus?.driverContact || '',
    driverLicense: bus?.driverLicense || '',
    driverName: bus?.driverName || '',
    busType: bus?.busType || 'College Bus',
    
    operatingTimings: {
      morning: {
        departure: bus?.operatingTimings?.morning?.departure || bus?.schedules?.morningDeparture || bus?.morningDeparture || '',
        arrival: bus?.operatingTimings?.morning?.arrival || bus?.schedules?.morningArrival || bus?.morningArrival || ''
      },
      evening: {
        departure: bus?.operatingTimings?.evening?.departure || bus?.schedules?.eveningDeparture || bus?.eveningDeparture || '',
        arrival: bus?.operatingTimings?.evening?.arrival || bus?.schedules?.eveningArrival || bus?.eveningArrival || ''
      }
    },
    
    maintenance: {
      lastServiceDate: bus?.maintenance?.lastServiceDate || '',
      nextServiceDate: bus?.maintenance?.nextServiceDate || '',
      notes: bus?.maintenance?.notes || ''
    },

    documents: bus?.documents || { rc: null, fitness: null, insurance: null, pollution: null }
  });

  // Mock data for dropdowns (in reality, fetch from Firestore)
  const [routes, setRoutes] = useState([]);
  const [drivers, setDrivers] = useState([]);
  
  useEffect(() => {
    const fetchDropdownData = async () => {
      try {
        const routesSnapshot = await getDocs(collection(db, 'routes'));
        const formattedRoutes = routesSnapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, name: data.routeName || data.name || 'Unnamed Route' };
        });
        setRoutes(formattedRoutes);

        const driversSnapshot = await getDocs(collection(db, 'drivers'));
        const formattedDrivers = driversSnapshot.docs.map(doc => {
          const data = doc.data();
          return { id: doc.id, name: data.driverName || data.name || 'Unnamed Driver' };
        });
        setDrivers(formattedDrivers);
      } catch (err) {
        console.error("Failed to fetch dropdown data:", err);
      }
    };
    
    fetchDropdownData();
  }, []);
  
  const [files, setFiles] = useState({
    rc: null, fitness: null, insurance: null, pollution: null
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Handle nested state updates safely
  const updateNestedState = (category, field, value) => {
    setFormData(prev => ({
      ...prev,
      [category]: {
        ...prev[category],
        [field]: value
      }
    }));
  };

  const updateTiming = (shift, field, value) => {
    setFormData(prev => ({
      ...prev,
      operatingTimings: {
        ...prev.operatingTimings,
        [shift]: {
          ...prev.operatingTimings[shift],
          [field]: value
        }
      }
    }));
  };

  const handleFileChange = (docType, e) => {
    if (e.target.files[0]) {
      setFiles(prev => ({ ...prev, [docType]: e.target.files[0] }));
    }
  };

  const uploadFile = async (busId, docType, file) => {
    if (!file) return formData.documents[docType]; // Return existing if no new file
    const storageRef = ref(storage, `vehicleDocuments/${busId}/${docType}/${file.name}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return {
      documentNumber: formData.documents[docType]?.documentNumber || 'PENDING',
      issueDate: formData.documents[docType]?.issueDate || new Date().toISOString().split('T')[0],
      expiryDate: formData.documents[docType]?.expiryDate || '', // Ideally gathered from form
      fileUrl: url,
      fileName: file.name,
      uploadedAt: new Date().toISOString()
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    
    try {
      // 1. Save Bus info first to get ID
      const rawBusData = {
        busNumber: formData.busNumber,
        registrationNumber: formData.registrationNumber,
        regNumber: formData.registrationNumber, // Backward compatibility
        manufacturer: formData.manufacturer,
        bharatStage: formData.bharatStage,
        manufacturingYear: formData.manufacturingYear,
        seatCapacity: Number(formData.capacity),
        capacity: formData.capacity,
        standingCapacity: Number(formData.standingCapacity),
        status: formData.status,
        busType: formData.busType,
        coverageType: formData.coverageType,
        assignedRouteId: formData.assignedRouteId,
        assignedRouteName: formData.assignedRouteName,
        route: formData.assignedRouteName, // Backward compatibility
        routeName: formData.assignedRouteName, // Backward compatibility
        assignedDriverId: formData.assignedDriverId,
        assignedDriverName: formData.assignedDriverName,
        driverName: formData.assignedDriverName, // Backward compatibility
        driverContact: formData.driverContact,
        driverLicense: formData.driverLicense,
        schedules: {
          morningDeparture: formData.operatingTimings.morning.departure,
          morningArrival: formData.operatingTimings.morning.arrival,
          eveningDeparture: formData.operatingTimings.evening.departure,
          eveningArrival: formData.operatingTimings.evening.arrival,
        },
        morningDeparture: formData.operatingTimings.morning.departure,
        morningArrival: formData.operatingTimings.morning.arrival,
        eveningDeparture: formData.operatingTimings.evening.departure,
        eveningArrival: formData.operatingTimings.evening.arrival,
        maintenance: {
          lastServiceDate: formData.maintenance.lastServiceDate,
          nextServiceDate: formData.maintenance.nextServiceDate,
          notes: formData.maintenance.notes
        },
        documents: formData.documents,
        updatedAt: new Date().toISOString()
      };
      
      const busDataToSave = JSON.parse(JSON.stringify(rawBusData));
      
      // Check auth state right before saving
      import('../../firebase').then(({ auth }) => {
        console.log("Current user before save:", auth.currentUser);
        if (!auth.currentUser) {
           console.error("No user is logged in! Firestore will reject this.");
        }
      });
      
      let busId = bus?.id;
      
      if (isEdit) {
        await updateDoc(doc(db, 'buses', busId), busDataToSave);
      } else {
        busDataToSave.createdAt = new Date().toISOString();
        busId = `bus_${formData.busNumber}`;
        await setDoc(doc(db, 'buses', busId), busDataToSave);
      }
      
      // 2. Upload documents if any new files were selected
      const updatedDocs = { ...formData.documents };
      let docsChanged = false;
      
      for (const docType of ['rc', 'fitness', 'insurance', 'pollution']) {
        if (files[docType]) {
          updatedDocs[docType] = await uploadFile(busId, docType, files[docType]);
          docsChanged = true;
        }
      }
      
      // 3. Update doc references if changed
      if (docsChanged) {
        await updateDoc(doc(db, 'buses', busId), JSON.parse(JSON.stringify({ documents: updatedDocs })));
      }
      
      await createAuditLog({
        action: isEdit ? 'UPDATE' : 'CREATE',
        module: 'Bus Management',
        entityType: 'bus',
        entityId: busId,
        entityName: formData.busNumber,
        description: isEdit ? `Updated bus details for ${formData.busNumber}` : `Created new bus ${formData.busNumber}`,
        severity: 'info',
        changes: { before: isEdit ? bus : null, after: busDataToSave }
      });
      
      onSaveComplete();
    } catch (err) {
      console.error('Full Error:', err);
      setError(`Failed to save bus details. Error: ${err.message || 'Unknown error'}`);
      await createAuditLog({
        action: isEdit ? 'UPDATE' : 'CREATE',
        module: 'Bus Management',
        entityType: 'bus',
        entityId: bus?.id || `bus_${formData.busNumber}`,
        entityName: formData.busNumber,
        description: `Failed to save bus details: ${err.message}`,
        severity: 'warning',
        status: 'failed'
      }).catch(() => {});
    } finally {
      setLoading(false);
    }
  };



  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(255, 255, 255, 0.6)', borderRadius: '16px', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(0,0,0,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#fff' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button onClick={onBack} style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
            <ArrowLeft size={20} color="#444" />
          </button>
          <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: '#111' }}>
            {isEdit ? 'Edit Bus' : 'Add New Bus'}
          </h2>
        </div>
        <button 
          onClick={handleSubmit}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', gap: '8px', background: loading ? '#ccc' : '#2563EB', color: 'white', border: 'none', padding: '10px 24px', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: loading ? 'not-allowed' : 'pointer'
          }}
        >
          <Save size={18} />
          {loading ? <div className="btn-spinner"></div> : 'Save Bus'}
        </button>
      </div>
      
      {/* Scrollable Form Content */}
      <div style={{ padding: '24px', overflowY: 'auto', flex: 1 }}>
        {error && (
          <div style={{ padding: '12px', background: '#FEE2E2', color: '#DC2626', borderRadius: '8px', marginBottom: '20px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <AlertCircle size={16} /> {error}
          </div>
        )}
        
        <form onSubmit={handleSubmit} style={{ maxWidth: '800px', margin: '0 auto' }}>
          
          {/* BASIC DETAILS */}
          <SectionHeader title="Basic Details" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Bus Number *">
              <input type="text" required style={inputStyle} value={formData.busNumber} onChange={e => setFormData({...formData, busNumber: e.target.value})} />
            </FormGroup>
            <FormGroup label="Registration Number *">
              <input type="text" required style={inputStyle} value={formData.registrationNumber} onChange={e => setFormData({...formData, registrationNumber: e.target.value})} />
            </FormGroup>
            
            <FormGroup label="Manufacturer *">
              <select style={inputStyle} value={formData.manufacturer} onChange={e => setFormData({...formData, manufacturer: e.target.value})}>
                {MANUFACTURERS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </FormGroup>

            
            <FormGroup label="Bharat Stage *">
              <select style={inputStyle} value={formData.bharatStage} onChange={e => setFormData({...formData, bharatStage: e.target.value})}>
                {BHARAT_STAGES.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Manufacturing Year *">
              <input type="number" required max={new Date().getFullYear()} style={inputStyle} value={formData.manufacturingYear} onChange={e => setFormData({...formData, manufacturingYear: e.target.value})} />
            </FormGroup>
            
            <FormGroup label="Seat Capacity *">
              <input type="number" required min="1" style={inputStyle} value={formData.capacity} onChange={e => setFormData({...formData, capacity: e.target.value})} />
            </FormGroup>
            <FormGroup label="Standing Capacity">
              <input type="number" min="0" style={inputStyle} value={formData.standingCapacity} onChange={e => setFormData({...formData, standingCapacity: e.target.value})} />
            </FormGroup>
            
            <FormGroup label="Bus Status *">
              <select style={inputStyle} value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})}>
                {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FormGroup>
          </div>

          {/* ROUTE ASSIGNMENT */}
          <SectionHeader title="Route Assignment" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Assigned Route">
              <select style={inputStyle} value={formData.assignedRouteId} onChange={e => {
                const r = routes.find(x => x.id === e.target.value);
                setFormData(prev => ({ ...prev, assignedRouteId: e.target.value, assignedRouteName: r ? r.name : '' }));
              }}>
                <option value="">Unassigned</option>
                {routes.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Route Coverage">
              <select style={inputStyle} value={formData.coverageType} onChange={e => setFormData(prev => ({ ...prev, coverageType: e.target.value }))}>
                <option value="full_route">Full Route</option>
                <option value="specific_segment">Specific Route Segment</option>
              </select>
            </FormGroup>
          </div>
          {formData.coverageType === 'specific_segment' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px', padding: '16px', background: 'rgba(0,0,0,0.02)', borderRadius: '8px' }}>
              <FormGroup label="Starting Point">
                <input type="text" style={inputStyle} value={formData.startPoint || ''} onChange={e => setFormData(prev => ({ ...prev, startPoint: e.target.value }))} />
              </FormGroup>
              <FormGroup label="Ending Point">
                <input type="text" style={inputStyle} value={formData.endPoint || ''} onChange={e => setFormData(prev => ({ ...prev, endPoint: e.target.value }))} />
              </FormGroup>
            </div>
          )}

          {/* DRIVER ASSIGNMENT */}
          <SectionHeader title="Driver Assignment" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Assigned Driver">
              <select style={inputStyle} value={formData.assignedDriverId} onChange={e => {
                const d = drivers.find(x => x.id === e.target.value);
                setFormData(prev => ({ 
                  ...prev, 
                  assignedDriverId: e.target.value, 
                  assignedDriverName: d ? d.name : '',
                  driverName: d ? d.name : ''
                }));
              }}>
                <option value="">Unassigned</option>
                {drivers.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </FormGroup>
            <FormGroup label="Bus Type">
              <input type="text" required style={inputStyle} value={formData.busType} onChange={e => setFormData({...formData, busType: e.target.value})} />
            </FormGroup>
            
            <FormGroup label="Driver Contact">
              <input type="text" style={inputStyle} value={formData.driverContact} onChange={e => setFormData({...formData, driverContact: e.target.value})} />
            </FormGroup>
            <FormGroup label="Driver License">
              <input type="text" style={inputStyle} value={formData.driverLicense} onChange={e => setFormData({...formData, driverLicense: e.target.value})} />
            </FormGroup>
          </div>

          {/* OPERATING TIMINGS */}
          <SectionHeader title="Operating Timings" />
          <div style={{ display: 'flex', gap: '40px' }}>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '12px' }}>Morning Shift</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <FormGroup label="Departure Time"><input type="time" style={inputStyle} value={formData.operatingTimings.morning.departure} onChange={e => updateTiming('morning', 'departure', e.target.value)} /></FormGroup>
                <FormGroup label="Arrival Time"><input type="time" style={inputStyle} value={formData.operatingTimings.morning.arrival} onChange={e => updateTiming('morning', 'arrival', e.target.value)} /></FormGroup>
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <h4 style={{ fontSize: '13px', fontWeight: '600', color: '#444', marginBottom: '12px' }}>Evening Shift</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <FormGroup label="Departure Time"><input type="time" style={inputStyle} value={formData.operatingTimings.evening.departure} onChange={e => updateTiming('evening', 'departure', e.target.value)} /></FormGroup>
                <FormGroup label="Arrival Time"><input type="time" style={inputStyle} value={formData.operatingTimings.evening.arrival} onChange={e => updateTiming('evening', 'arrival', e.target.value)} /></FormGroup>
              </div>
            </div>
          </div>

          {/* VEHICLE MAINTENANCE */}
          <SectionHeader title="Vehicle Maintenance" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            <FormGroup label="Last Service Date">
              <input type="date" style={inputStyle} value={formData.maintenance.lastServiceDate} onChange={e => updateNestedState('maintenance', 'lastServiceDate', e.target.value)} />
            </FormGroup>
            <FormGroup label="Next Service Date">
              <input type="date" style={inputStyle} value={formData.maintenance.nextServiceDate} onChange={e => updateNestedState('maintenance', 'nextServiceDate', e.target.value)} />
            </FormGroup>
          </div>
          <div style={{ marginTop: '20px' }}>
            <FormGroup label="Maintenance Notes">
              <textarea style={{...inputStyle, minHeight: '80px', resize: 'vertical'}} value={formData.maintenance.notes} onChange={e => updateNestedState('maintenance', 'notes', e.target.value)} />
            </FormGroup>
          </div>

          {/* VEHICLE DOCUMENTS */}
          <SectionHeader title="Vehicle Documents (Upload)" />
          
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
            {['rc', 'fitness', 'insurance', 'pollution'].map(docType => (
              <div key={docType} style={{ padding: '16px', border: '1px solid rgba(0,0,0,0.1)', borderRadius: '12px', background: '#fafafa' }}>
                <h4 style={{ margin: '0 0 12px 0', fontSize: '14px', textTransform: 'uppercase', color: '#222' }}>{docType} Document</h4>
                
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <FormGroup label="Expiry Date *">
                    <input type="date" required style={inputStyle} value={formData.documents[docType]?.expiryDate || ''} onChange={e => {
                      setFormData(prev => ({
                        ...prev, documents: { ...prev.documents, [docType]: { ...prev.documents[docType], expiryDate: e.target.value } }
                      }));
                    }} />
                  </FormGroup>
                  
                  <FormGroup label="Upload File (PDF/JPG)">
                    <div style={{ position: 'relative' }}>
                      <input 
                        type="file" 
                        accept=".pdf,.jpg,.jpeg,.png"
                        onChange={(e) => handleFileChange(docType, e)}
                        style={{ display: 'none' }}
                        id={`upload-${docType}`}
                      />
                      <label 
                        htmlFor={`upload-${docType}`}
                        style={{
                          display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', background: '#fff', border: '1px dashed #aaa', borderRadius: '8px', cursor: 'pointer', fontSize: '13px', color: '#555', justifyContent: 'center'
                        }}
                      >
                        <Upload size={16} /> 
                        {files[docType] ? files[docType].name : formData.documents[docType]?.fileName ? 'Replace ' + formData.documents[docType].fileName : 'Choose File'}
                      </label>
                    </div>
                  </FormGroup>
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ height: '100px' }}></div>
        </form>
      </div>
    </div>
  );
}
