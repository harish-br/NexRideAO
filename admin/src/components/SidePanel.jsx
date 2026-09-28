import React, { useState } from 'react';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import {
  LogOut,
  Search,
  ArrowRight,
  Phone,
  MessageCircle
} from 'lucide-react';
import RecordCircleIcon from '../assets/svg/record-circle.svg?react';
import HomeIcon from '../assets/svg/ai-homepage.svg?react';
import BusIcon from '../assets/svg/bus-20.svg?react';
import DriverIcon from '../assets/svg/tag-user.svg?react';
import StudentIcon from '../assets/svg/profile-2user.svg?react';
import RouteIcon from '../assets/svg/routing.svg?react';
import ReportIcon from '../assets/svg/document-text.svg?react';
import NotificationIcon from '../assets/svg/notification.svg?react';
import AuditLogIcon from '../assets/svg/book.svg?react';
import SettingsIcon from '../assets/svg/setting.svg?react';
import LogoutIcon from '../assets/svg/logout2.svg?react';
import Dashboard from '../pages/Dashboard';
import Buses from '../pages/Buses';
import Drivers from '../pages/Drivers';
import Students from '../pages/Students';
import Routes from '../pages/Routes';
import Reports from '../pages/Reports';
import Notifications from '../pages/Notifications';
import AuditLogs from '../pages/AuditLogs';
import Settings from '../pages/Settings';
import WeatherWidget from './WeatherWidget';
import './SidePanel.css';

export default function SidePanel({ activeNav, setActiveNav, isFullView, setIsFullView, userLocation }) {
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Failed to log out:", err);
    }
  };

  return (
    <div className={`side-panel-container ${isFullView ? 'full-view' : 'quarter-view'}`}>
      {/* Left Navigation Bar */}
      <div className="nav-bar">
        <div 
          className={`brand-logo ${activeNav === 'live' ? 'active' : ''}`} 
          title="Live" 
          onClick={() => { setActiveNav('live'); setIsFullView(false); }} 
          style={{ cursor: 'pointer' }}
        >
          <RecordCircleIcon width={24} height={24} />
        </div>

        <div className="nav-icons">
          <div className={`nav-icon ${activeNav === 'home' ? 'active' : ''}`} title="Dashboard" onClick={() => { setActiveNav('home'); setIsFullView(true); }}><HomeIcon width={20} height={20} /></div>
          <div className={`nav-icon ${activeNav === 'buses' ? 'active' : ''}`} title="Buses" onClick={() => { setActiveNav('buses'); setIsFullView(true); }}><BusIcon width={20} height={20} /></div>
          <div className={`nav-icon ${activeNav === 'drivers' ? 'active' : ''}`} title="Drivers" onClick={() => { setActiveNav('drivers'); setIsFullView(true); }}><DriverIcon width={20} height={20} /></div>
          <div className={`nav-icon ${activeNav === 'students' ? 'active' : ''}`} title="Students" onClick={() => { setActiveNav('students'); setIsFullView(true); }}><StudentIcon width={20} height={20} /></div>
          <div className={`nav-icon ${activeNav === 'routes' ? 'active' : ''}`} title="Routes" onClick={() => { setActiveNav('routes'); setIsFullView(true); }}><RouteIcon width={20} height={20} /></div>
          <div className={`nav-icon ${activeNav === 'reports' ? 'active' : ''}`} title="Reports" onClick={() => { setActiveNav('reports'); setIsFullView(true); }}><ReportIcon width={20} height={20} /></div>
          <div className={`nav-icon ${activeNav === 'notifications' ? 'active' : ''}`} title="Notifications" onClick={() => { setActiveNav('notifications'); setIsFullView(true); }}><NotificationIcon width={20} height={20} /></div>
          <div className={`nav-icon ${activeNav === 'audit logs' ? 'active' : ''}`} title="Audit Logs" onClick={() => { setActiveNav('audit logs'); setIsFullView(true); }}><AuditLogIcon width={20} height={20} /></div>
          <div className={`nav-icon ${activeNav === 'settings' ? 'active' : ''}`} title="Settings" onClick={() => { setActiveNav('settings'); setIsFullView(true); }}><SettingsIcon width={20} height={20} /></div>
        </div>

        <div className="nav-bottom">
          <div className="nav-icon" title="Logout" onClick={handleLogout} style={{ cursor: 'pointer' }}>
            <LogoutIcon width={24} height={24} />
          </div>
        </div>
      </div>

      {/* Main Content Panel */}
      <div className="content-panel">
        <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginBottom: '4px' }}>
          <WeatherWidget userLocation={userLocation} />
        </div>
        {activeNav === 'home' && <Dashboard userLocation={userLocation} />}
        {activeNav === 'buses' && <Buses />}
        {activeNav === 'drivers' && <Drivers />}
        {activeNav === 'students' && <Students />}
        {activeNav === 'routes' && <Routes />}
        {activeNav === 'reports' && <Reports />}
        {activeNav === 'notifications' && <Notifications />}
        {activeNav === 'audit logs' && <AuditLogs />}
        {activeNav === 'settings' && <Settings />}
        {activeNav === 'live' && (
          <div className="blank-page" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <div className="header">
              <h1>Live Overview</h1>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
