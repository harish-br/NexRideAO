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
import LiveTracking from '../pages/LiveTracking';
import WeatherWidget from './WeatherWidget';
import './SidePanel.css';

const NAV_ITEMS = [
  { id: 'home', label: 'Dashboard', icon: HomeIcon },
  { id: 'live', label: 'Live Tracking', icon: RecordCircleIcon },
  { id: 'buses', label: 'Buses', icon: BusIcon },
  { id: 'drivers', label: 'Drivers', icon: DriverIcon },
  { id: 'students', label: 'Students', icon: StudentIcon },
  { id: 'routes', label: 'Routes', icon: RouteIcon },
  { id: 'reports', label: 'Reports', icon: ReportIcon },
  { id: 'notifications', label: 'Notifications', icon: NotificationIcon },
  { id: 'audit logs', label: 'Audit Logs', icon: AuditLogIcon },
  { id: 'settings', label: 'Settings', icon: SettingsIcon },
];

export default function SidePanel({ activeNav, setActiveNav, isFullView, setIsFullView, userLocation, onSelectBus }) {
  
  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Failed to log out:", err);
    }
  };

  const [shining, setShining] = useState(false);
  const [isNavHovered, setIsNavHovered] = useState(false);

  const handleLiveClick = () => {
    setActiveNav('live');
    setIsFullView(false);
  };

  return (
    <>
      <style>{`
        @keyframes panelShine {
          0%   { opacity: 0; transform: translateX(-100%) skewX(-15deg); }
          50%  { opacity: 1; }
          100% { opacity: 0; transform: translateX(400%) skewX(-15deg); }
        }
        .panel-shine {
          position: absolute; inset: 0; z-index: 9999; pointer-events: none;
          overflow: hidden; border-radius: 24px;
        }
        .panel-shine::after {
          content: '';
          position: absolute; top: 0; left: 0; width: 40%; height: 100%;
          background: linear-gradient(90deg, transparent, rgba(255,255,255,0.45), transparent);
          animation: panelShine 0.6s ease forwards;
        }
      `}</style>

      <div className={`side-panel-container ${isFullView ? 'full-view' : 'quarter-view'} ${isNavHovered ? 'sidebar-expanded' : ''}`} style={{ position: 'absolute' }}>
        {shining && <div className="panel-shine" />}

        {/* Left Navigation Bar */}
        <nav
          className={`nav-bar ${isNavHovered ? 'expanded' : ''}`}
          aria-label="Sidebar navigation"
          onMouseEnter={() => setIsNavHovered(true)}
          onMouseLeave={() => setIsNavHovered(false)}
        >
          {/* Brand / Live Fleet Button */}
          <div
            className={`brand-logo nav-item nav-icon ${activeNav === 'live' ? 'active' : ''}`}
            title="Live Fleet Tracking"
            onClick={handleLiveClick}
            style={{ cursor: 'pointer' }}
          >
            <div className="nav-icon-wrapper">
              <RecordCircleIcon width={22} height={22} />
            </div>
            <div className="nav-label-wrapper">
              <span className="nav-label">Live Fleet</span>
              <span className="nav-live-badge">LIVE</span>
            </div>
          </div>

          <div className="nav-divider" />

          {/* Navigation Items */}
          <div className="nav-icons">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activeNav === item.id;
              return (
                <div
                  key={item.id}
                  className={`nav-item nav-icon ${isActive ? 'active' : ''}`}
                  title={item.label}
                  onClick={() => {
                    if (item.id === 'live') {
                      handleLiveClick();
                    } else {
                      setActiveNav(item.id);
                      setIsFullView(true);
                    }
                  }}
                >
                  <div className="nav-icon-wrapper">
                    <Icon width={20} height={20} />
                  </div>
                  <span className="nav-label">{item.label}</span>
                </div>
              );
            })}
          </div>

          {/* Bottom Section (Logout) */}
          <div className="nav-bottom">
            <div
              className="nav-item nav-icon nav-logout"
              title="Logout"
              onClick={handleLogout}
              style={{ cursor: 'pointer' }}
            >
              <div className="nav-icon-wrapper">
                <LogoutIcon width={22} height={22} />
              </div>
              <span className="nav-label">Logout</span>
            </div>
          </div>
        </nav>

        {/* Main Content Panel */}
        <div className={`content-panel ${activeNav === 'live' ? 'live-view' : ''}`}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', width: '100%', marginBottom: activeNav === 'live' ? '12px' : '6px', flexShrink: 0 }}>
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
          {activeNav === 'live' && <LiveTracking onSelectBus={onSelectBus} />}
        </div>
      </div>
    </>
  );
}
