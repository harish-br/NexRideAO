/* ==========================================================================
   NexRide — AI Chat Support & Ticket System (Professional Controller)
   Zero emojis, clean typography, multi-turn reasoning & Firestore integration
   ========================================================================== */

import { firestore as db, auth } from './firebase-config.js';
import {
  collection,
  doc,
  setDoc,
  addDoc,
  getDoc,
  getDocs,
  serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// =============================================================================
// STANDARDIZED CATEGORIES & SUBCATEGORIES (NO EMOJIS)
// =============================================================================
export const SUPPORT_CATEGORIES = {
  BUS: {
    id: 'BUS',
    name: 'Bus Issue',
    subcategories: ['Overcrowded', 'Dirty', 'AC not working', 'Lights not working', 'Seat problem', 'Door problem', 'Vehicle breakdown', 'Bus condition', 'Other'],
    defaultSeverity: 'MEDIUM'
  },
  DRIVER: {
    id: 'DRIVER',
    name: 'Driver',
    subcategories: ['Harsh driving', 'Rash driving', 'Overspeeding', 'Phone usage', 'Misbehavior', 'Not following route', 'Unauthorized stop', 'Late arrival', 'Other'],
    defaultSeverity: 'HIGH'
  },
  STAFF: {
    id: 'STAFF',
    name: 'Staff',
    subcategories: ['Misbehavior', 'Unprofessional behavior', 'Not responding', 'Communication issue', 'Other'],
    defaultSeverity: 'MEDIUM'
  },
  STUDENT: {
    id: 'STUDENT',
    name: 'Student',
    subcategories: ['Misbehavior', 'Bullying', 'Fighting', 'Disturbance', 'Safety concern', 'Other'],
    defaultSeverity: 'HIGH'
  },
  DELAY: {
    id: 'DELAY',
    name: 'Delay',
    subcategories: ['Bus late', 'Route delay', 'Traffic delay', 'Driver delay', 'Unknown reason'],
    defaultSeverity: 'MEDIUM'
  },
  BUS_NOT_AVAILABLE: {
    id: 'BUS_NOT_AVAILABLE',
    name: 'Bus Not Available',
    subcategories: ['Bus didn’t arrive', 'Bus cancelled', 'Bus breakdown', 'Bus missing', 'Route unavailable'],
    defaultSeverity: 'HIGH'
  },
  ROUTE: {
    id: 'ROUTE',
    name: 'Route Problem',
    subcategories: ['Route changed', 'Wrong route', 'Incorrect map location', 'Route confusion', 'Other'],
    defaultSeverity: 'MEDIUM'
  },
  STOP: {
    id: 'STOP',
    name: 'Bus Stop Issue',
    subcategories: ['Skipped my stop', 'Arrived too early', 'Wrong pickup point', 'Unsafe stop area', 'Other'],
    defaultSeverity: 'MEDIUM'
  },
  SAFETY: {
    id: 'SAFETY',
    name: 'Safety Issue',
    subcategories: ['Unsafe driving', 'Immediate danger', 'Medical emergency', 'Physical threat / Harassment', 'Accident', 'Other'],
    defaultSeverity: 'CRITICAL'
  },
  BEHAVIOR: {
    id: 'BEHAVIOR',
    name: 'Misbehavior & Conduct',
    subcategories: ['Verbal abuse', 'Inappropriate conduct', 'Harassment', 'Refusal of service', 'Other'],
    defaultSeverity: 'HIGH'
  },
  MAINTENANCE: {
    id: 'MAINTENANCE',
    name: 'Bus Issue',
    subcategories: ['AC malfunctioning', 'Broken seat', 'Punctured tire', 'Window broken', 'Door stuck', 'Other'],
    defaultSeverity: 'LOW'
  },
  LOST_AND_FOUND: {
    id: 'LOST_AND_FOUND',
    name: 'Lost & Found',
    subcategories: ['Lost bag / backpack', 'Lost phone', 'Lost ID card', 'Lost wallet / keys', 'Other item'],
    defaultSeverity: 'LOW'
  },
  ATTENDANCE: {
    id: 'ATTENDANCE',
    name: 'Attendance & E-Pass',
    subcategories: ['QR code not scanning', 'Pass not generated', 'Pass expired prematurely', 'Photo mismatch', 'Other'],
    defaultSeverity: 'MEDIUM'
  },
  PAYMENT: {
    id: 'PAYMENT',
    name: 'Payment & Fees',
    subcategories: ['Money deducted but pass pending', 'Duplicate payment', 'Receipt not received', 'Transaction failure', 'Other'],
    defaultSeverity: 'MEDIUM'
  },
  TECHNICAL: {
    id: 'TECHNICAL',
    name: 'App Technical',
    subcategories: ['Live tracking not working', 'App crash', 'Login issue', 'Blank screen', 'Other'],
    defaultSeverity: 'LOW'
  },
  OTHER: {
    id: 'OTHER',
    name: 'Other',
    subcategories: ['General question', 'Suggestion', 'Other transport concern'],
    defaultSeverity: 'LOW'
  }
};

export const STANDARD_QUICK_CHIPS = [
  { label: 'Bus Issue', category: 'BUS' },
  { label: 'Driver', category: 'DRIVER' },
  { label: 'Staff', category: 'STAFF' },
  { label: 'Student', category: 'STUDENT' },
  { label: 'Delay', category: 'DELAY' },
  { label: 'Bus Not Available', category: 'BUS_NOT_AVAILABLE' },
  { label: 'Safety Issue', category: 'SAFETY' },
  { label: 'Other', category: 'OTHER' }
];

// Global Conversation State
let conversationId = null;
let conversationMessages = [];
let allBusesList = [];
let userProfile = null;
let currentDraft = null;
let stagedAttachments = [];
let isAiThinking = false;
let isSubmitted = false;
let speechRecognizer = null;
let isRecordingVoice = false;

// Create clean draft structure
function createInitialDraft() {
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return {
    category: null,
    subcategory: null,
    title: '',
    description: '',
    aiSummary: '',
    severity: 'MEDIUM',
    priority: 'NORMAL',
    status: 'OPEN',
    busId: '',
    busNumber: '',
    routeId: '',
    routeName: '',
    stop: '',
    location: '',
    driverName: 'Unknown',
    staffName: 'Unknown',
    studentName: 'Unknown',
    incidentDate: dateStr,
    incidentTime: timeStr,
    expectedTime: '',
    actualTime: '',
    delayDuration: '',
    frequency: '',
    impact: '',
    evidenceUrls: [],
    attachments: [],
    recommendedDepartment: 'Transport Operations',
    recommendedPriority: 'MEDIUM',
    readyForConfirmation: false
  };
}

// =============================================================================
// INITIALIZATION
// =============================================================================
export function initReportChatModule() {
  console.log('[ReportChat] Initializing NexRide AI Chat Support...');
  loadBusesData();

  if (auth) {
    auth.onAuthStateChanged((user) => {
      if (user) {
        loadUserProfile(user.uid);
      } else {
        userProfile = null;
      }
    });
  }

  setupUIEventListeners();
  setupEditModalEventListeners();
  initSpeechRecognition();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initReportChatModule);
} else {
  initReportChatModule();
}

window.openChatSupport = openChatSupport;
window.openReportChat = openChatSupport;
window.openReportIssuePage = openChatSupport;
window.openEditDetailsModal = openEditDetailsModal;

// =============================================================================
// DATA FETCHERS
// =============================================================================
async function loadBusesData() {
  if (!db) return;
  try {
    const snap = await getDocs(collection(db, 'buses'));
    allBusesList = [];
    snap.forEach(docSnap => {
      const b = docSnap.data();
      const bNum = String(b.bus_no || b.busNumber || docSnap.id.replace('bus_', '')).trim();
      const rName = b.routeName || b.route || `Route ${bNum}`;
      allBusesList.push({
        id: docSnap.id,
        busNumber: bNum,
        routeName: rName,
        ...b
      });
    });
  } catch (e) {
    console.warn('[ReportChat] Failed to load buses data:', e);
  }
}

async function loadUserProfile(uid) {
  if (!db || !uid) return;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (snap.exists()) {
      userProfile = snap.data();
      if (currentDraft && !currentDraft.busNumber && userProfile.busNumber) {
        currentDraft.busNumber = String(userProfile.busNumber);
        currentDraft.routeName = userProfile.stage || userProfile.route || '';
      }
    }
  } catch (e) {
    console.warn('[ReportChat] Failed to load user profile:', e);
  }
}

// =============================================================================
// CHAT OPENING & LIFECYCLE
// =============================================================================
export function openChatSupport() {
  const page = document.getElementById('report-issue-page');
  if (!page) return;

  // Lock root document scroll so whole page doesn't shift
  document.documentElement.style.overflow = 'hidden';
  document.body.style.overflow = 'hidden';
  window.scrollTo(0, 0);
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;

  if (window.visualViewport) {
    page.style.height = `${window.visualViewport.height}px`;
  }

  page.classList.remove('hidden');

  if (!conversationId || isSubmitted || conversationMessages.length === 0) {
    startNewConversation();
  } else {
    renderMessages();
  }

  setTimeout(() => {
    scrollToBottom();
  }, 100);
}

function startNewConversation() {
  conversationId = 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
  conversationMessages = [];
  currentDraft = createInitialDraft();
  stagedAttachments = [];
  isSubmitted = false;

  if (userProfile) {
    if (userProfile.busNumber || userProfile.bus) {
      currentDraft.busNumber = String(userProfile.busNumber || userProfile.bus);
    }
    if (userProfile.stage || userProfile.route) {
      currentDraft.routeName = String(userProfile.stage || userProfile.route);
      currentDraft.stop = String(userProfile.stage || '');
      currentDraft.location = String(userProfile.stage || '');
    }
  }

  // Initial greeting matching reference screenshot
  const initialGreeting = {
    id: 'msg_' + Date.now(),
    sender: 'AI',
    text: `Please share the details of the issue.`,
    quickChips: [...STANDARD_QUICK_CHIPS],
    timestamp: formatCurrentTime()
  };

  conversationMessages.push(initialGreeting);
  renderMessages();
  updateStagedAttachmentsUI();
}

function formatCurrentTime() {
  return new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

// =============================================================================
// SPEECH RECOGNITION (VOICE INPUT)
// =============================================================================
function initSpeechRecognition() {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) return;

  try {
    speechRecognizer = new SpeechRecognition();
    speechRecognizer.continuous = false;
    speechRecognizer.interimResults = false;
    speechRecognizer.lang = 'en-IN';

    speechRecognizer.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      const input = document.getElementById('report-chat-input');
      if (input && transcript) {
        input.value = (input.value ? input.value + ' ' : '') + transcript;
        input.dispatchEvent(new Event('input'));
      }
    };

    speechRecognizer.onend = () => {
      isRecordingVoice = false;
      const micBtn = document.getElementById('report-chat-voice-btn');
      if (micBtn) micBtn.classList.remove('listening');
    };

    speechRecognizer.onerror = (err) => {
      console.warn('[ReportChat] Voice recognition error:', err);
      isRecordingVoice = false;
      const micBtn = document.getElementById('report-chat-voice-btn');
      if (micBtn) micBtn.classList.remove('listening');
    };
  } catch (e) {
    console.warn('[ReportChat] Speech recognition not supported:', e);
  }
}

function toggleVoiceRecognition() {
  if (!speechRecognizer) {
    alert('Voice input is not supported in this browser. Please type your message.');
    return;
  }

  const micBtn = document.getElementById('report-chat-voice-btn');

  if (isRecordingVoice) {
    speechRecognizer.stop();
    isRecordingVoice = false;
    if (micBtn) micBtn.classList.remove('listening');
  } else {
    try {
      speechRecognizer.start();
      isRecordingVoice = true;
      if (micBtn) micBtn.classList.add('listening');
    } catch (e) {
      console.warn('[ReportChat] Could not start speech recognition:', e);
    }
  }
}

// =============================================================================
// UI SETUP & EVENT LISTENERS
// =============================================================================
function setupUIEventListeners() {
  const backBtn = document.getElementById('back-report-chat');
  if (backBtn) {
    backBtn.onclick = () => {
      const page = document.getElementById('report-issue-page');
      if (page) {
        page.classList.add('hidden');
        page.style.height = '';
      }
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      window.scrollTo(0, 0);
    };
  }

  const myReportsBtn = document.getElementById('report-chat-my-reports-btn');
  if (myReportsBtn) {
    myReportsBtn.onclick = () => {
      if (window.openMyReportsPage) {
        window.openMyReportsPage();
      }
    };
  }

  const inputField = document.getElementById('report-chat-input');
  const sendBtn = document.getElementById('report-chat-send-btn');
  const micBtn = document.getElementById('report-chat-voice-btn');

  // Visual Viewport & Keyboard Resizing (prevents total page from shifting upwards)
  if (window.visualViewport) {
    const handleViewportChange = () => {
      const page = document.getElementById('report-issue-page');
      if (page && !page.classList.contains('hidden')) {
        const vpHeight = window.visualViewport.height;
        page.style.height = `${vpHeight}px`;
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        scrollToBottom();
      }
    };

    window.visualViewport.addEventListener('resize', handleViewportChange);
    window.visualViewport.addEventListener('scroll', () => {
      const page = document.getElementById('report-issue-page');
      if (page && !page.classList.contains('hidden')) {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
      }
    });
  }

  if (micBtn) {
    micBtn.onclick = (e) => {
      e.preventDefault();
      toggleVoiceRecognition();
    };
  }

  if (inputField) {
    inputField.addEventListener('input', () => {
      inputField.style.height = 'auto';
      inputField.style.height = Math.min(inputField.scrollHeight, 100) + 'px';
      
      const hasText = inputField.value.trim().length > 0;
      const hasAttachments = stagedAttachments.length > 0;
      if (sendBtn) {
        sendBtn.disabled = (!hasText && !hasAttachments) || isAiThinking || isSubmitted;
      }
    });

    inputField.addEventListener('focus', () => {
      setTimeout(() => {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        if (window.visualViewport) {
          const page = document.getElementById('report-issue-page');
          if (page && !page.classList.contains('hidden')) {
            page.style.height = `${window.visualViewport.height}px`;
          }
        }
        scrollToBottom();
      }, 50);
    });

    inputField.addEventListener('blur', () => {
      setTimeout(() => {
        window.scrollTo(0, 0);
        document.body.scrollTop = 0;
        document.documentElement.scrollTop = 0;
        if (window.visualViewport) {
          const page = document.getElementById('report-issue-page');
          if (page && !page.classList.contains('hidden')) {
            page.style.height = `${window.visualViewport.height}px`;
          }
        }
      }, 50);
    });

    inputField.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleUserSendMessage();
      }
    });
  }

  if (sendBtn) {
    sendBtn.onclick = () => {
      handleUserSendMessage();
    };
  }

  // Attachment Triggers
  const attachBtn = document.getElementById('report-chat-attach-btn');
  const attachSheet = document.getElementById('report-attach-sheet-modal');
  const attachCancelBtn = document.getElementById('report-attach-sheet-cancel');

  if (attachBtn && attachSheet) {
    attachBtn.onclick = (e) => {
      e.preventDefault();
      attachSheet.classList.add('active');
    };
  }

  if (attachCancelBtn && attachSheet) {
    attachCancelBtn.onclick = () => attachSheet.classList.remove('active');
  }

  if (attachSheet) {
    attachSheet.onclick = (e) => {
      if (e.target === attachSheet) attachSheet.classList.remove('active');
    };
  }

  const triggerCamera = document.getElementById('report-attach-camera-opt');
  const triggerPhoto = document.getElementById('report-attach-photo-opt');
  const triggerFiles = document.getElementById('report-attach-files-opt');

  const fileCameraInput = document.getElementById('report-hidden-file-camera');
  const filePhotoInput = document.getElementById('report-hidden-file-photo');
  const fileDocsInput = document.getElementById('report-hidden-file-docs');

  if (triggerCamera && fileCameraInput) {
    triggerCamera.onclick = () => {
      attachSheet.classList.remove('active');
      fileCameraInput.click();
    };
  }

  if (triggerPhoto && filePhotoInput) {
    triggerPhoto.onclick = () => {
      attachSheet.classList.remove('active');
      filePhotoInput.click();
    };
  }

  if (triggerFiles && fileDocsInput) {
    triggerFiles.onclick = () => {
      attachSheet.classList.remove('active');
      fileDocsInput.click();
    };
  }

  [fileCameraInput, filePhotoInput, fileDocsInput].forEach(input => {
    if (input) {
      input.addEventListener('change', (e) => {
        handleFileSelection(e.target.files);
        input.value = '';
      });
    }
  });

  const lightbox = document.getElementById('report-image-lightbox');
  const lightboxClose = document.getElementById('report-lightbox-close');
  if (lightboxClose && lightbox) {
    lightboxClose.onclick = () => lightbox.classList.remove('active');
    lightbox.onclick = (e) => {
      if (e.target === lightbox) lightbox.classList.remove('active');
    };
  }
}

// =============================================================================
// ATTACHMENT PROCESSING
// =============================================================================
async function handleFileSelection(files) {
  if (!files || files.length === 0) return;

  if (stagedAttachments.length + files.length > 5) {
    alert('You can attach a maximum of 5 images per report.');
    return;
  }

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!file.type.startsWith('image/')) {
      alert(`"${file.name}" is not a valid image file.`);
      continue;
    }

    try {
      const dataUrl = await compressImageToDataUrl(file);
      stagedAttachments.push({
        id: 'att_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: dataUrl
      });
    } catch (err) {
      console.warn('[ReportChat] Image compression failed:', err);
    }
  }

  updateStagedAttachmentsUI();

  const sendBtn = document.getElementById('report-chat-send-btn');
  if (sendBtn) sendBtn.disabled = isAiThinking || isSubmitted;
}

function compressImageToDataUrl(file, maxWidth = 1000, quality = 0.8) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function updateStagedAttachmentsUI() {
  const container = document.getElementById('report-chat-staged-container');
  if (!container) return;

  if (stagedAttachments.length === 0) {
    container.style.display = 'none';
    container.innerHTML = '';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = '';

  stagedAttachments.forEach((att, idx) => {
    const item = document.createElement('div');
    item.className = 'report-chat-staged-item';
    item.innerHTML = `
      <img src="${att.dataUrl}" alt="${att.name}" class="report-chat-staged-img" />
      <button type="button" class="report-chat-staged-remove" data-idx="${idx}" aria-label="Remove image">&times;</button>
    `;

    item.querySelector('.report-chat-staged-remove').onclick = (e) => {
      e.stopPropagation();
      stagedAttachments.splice(idx, 1);
      updateStagedAttachmentsUI();
      const input = document.getElementById('report-chat-input');
      const sendBtn = document.getElementById('report-chat-send-btn');
      if (sendBtn) {
        sendBtn.disabled = (!input || input.value.trim().length === 0) && stagedAttachments.length === 0;
      }
    };

    container.appendChild(item);
  });
}

// =============================================================================
// USER MESSAGE SEND & PROCESSING
// =============================================================================
async function handleUserSendMessage(overrideText = null) {
  if (isAiThinking || isSubmitted) return;

  const inputField = document.getElementById('report-chat-input');
  const userText = (overrideText !== null ? overrideText : (inputField?.value || '')).trim();
  const currentAttachments = [...stagedAttachments];

  if (!userText && currentAttachments.length === 0) return;

  if (inputField && overrideText === null) {
    inputField.value = '';
    inputField.style.height = 'auto';
  }
  stagedAttachments = [];
  updateStagedAttachmentsUI();

  const sendBtn = document.getElementById('report-chat-send-btn');
  if (sendBtn) sendBtn.disabled = true;

  const userMsg = {
    id: 'msg_' + Date.now(),
    sender: 'USER',
    text: userText,
    attachments: currentAttachments,
    timestamp: formatCurrentTime()
  };

  conversationMessages.push(userMsg);
  renderMessages();

  if (currentAttachments.length > 0) {
    currentDraft.attachments = [...currentDraft.attachments, ...currentAttachments];
  }

  await processAiResponse(userText, currentAttachments);
}

// =============================================================================
// AI INTENT DETECTION & TANGLISH/ENGLISH NLP ENGINE
// =============================================================================
async function processAiResponse(userText, attachedImages) {
  isAiThinking = true;
  renderMessages();

  try {
    // 1. Check Critical Safety Emergency
    const isSafety = detectSafetyEmergency(userText);
    if (isSafety) {
      currentDraft.category = 'SAFETY';
      currentDraft.subcategory = 'Unsafe driving';
      currentDraft.severity = 'CRITICAL';
      currentDraft.priority = 'CRITICAL';
      currentDraft.recommendedPriority = 'CRITICAL';
      currentDraft.recommendedDepartment = 'Safety & Emergency';
    }

    // 2. Extract Entities, Subcategories & Intent (Supporting Tanglish/Tamil-English)
    extractEntitiesAndIntent(userText, currentDraft, allBusesList);

    // 3. Vision Analysis
    let visionNote = '';
    if (attachedImages && attachedImages.length > 0) {
      const visionAnalysis = analyzeAttachedImages(attachedImages, userText);
      if (visionAnalysis.inferredCategory && !currentDraft.category) {
        currentDraft.category = visionAnalysis.inferredCategory;
      }
      visionNote = visionAnalysis.note;
    }

    // Realistic AI response latency
    await new Promise(r => setTimeout(r, 450 + Math.random() * 200));

    // 4. Generate Multi-Turn Conversation Step
    const nextStep = generateNextConversationalStep(currentDraft, userText, visionNote);

    isAiThinking = false;

    const aiMsg = {
      id: 'msg_' + Date.now(),
      sender: 'AI',
      text: nextStep.message,
      card: nextStep.card || null,
      quickChips: nextStep.quickChips || null,
      timestamp: formatCurrentTime()
    };

    conversationMessages.push(aiMsg);
    renderMessages();

  } catch (err) {
    console.error('[ReportChat] AI Processing error:', err);
    isAiThinking = false;

    conversationMessages.push({
      id: 'msg_' + Date.now(),
      sender: 'AI',
      text: `I'm having trouble processing your report right now. Please specify your bus number and describe the problem.`,
      timestamp: formatCurrentTime()
    });
    renderMessages();
  }
}

// =============================================================================
// TANGLISH & NATURAL LANGUAGE INTENT EXTRACTION
// =============================================================================
function detectSafetyEmergency(text) {
  const lower = text.toLowerCase();
  const safetyKeywords = [
    'emergency', 'in danger', 'danger', 'threat', 'threatening', 'attack',
    'harass', 'harassment', 'accident', 'injured', 'injury', 'fight',
    'drunk', 'drinking', 'rash driving', 'reckless driving', 'brake fail',
    'fire', 'smoke in bus', 'police', 'critical', 'dangerously'
  ];
  return safetyKeywords.some(kw => lower.includes(kw));
}

function extractEntitiesAndIntent(text, draft, busList) {
  const lower = text.toLowerCase();

  // 1. Tanglish and Natural Language Intent Mapping
  if (!draft.category) {
    if (lower.includes('speed') || lower.includes('otturaaru') || lower.includes('rash') || lower.includes('harsh') || lower.includes('driver') || lower.includes('phone while driving') || lower.includes('overspeed')) {
      draft.category = 'DRIVER';
      draft.subcategory = (lower.includes('phone')) ? 'Phone usage' : 'Harsh driving';
      draft.severity = (lower.includes('harsh') || lower.includes('speed') || lower.includes('rash')) ? 'HIGH' : 'MEDIUM';
    } else if (lower.includes('late') || lower.includes('delay') || lower.includes('delayed') || lower.includes('vandhuchu') || lower.includes('neram aachu')) {
      draft.category = 'DELAY';
      draft.subcategory = 'Bus late';
      draft.severity = 'MEDIUM';
    } else if (lower.includes('varala') || lower.includes("didn't come") || lower.includes('not come') || lower.includes('no bus') || lower.includes('not available') || lower.includes('cancelled')) {
      draft.category = 'BUS_NOT_AVAILABLE';
      draft.subcategory = 'Bus didn’t arrive';
      draft.severity = 'HIGH';
    } else if (lower.includes('conductor') || lower.includes('staff') || lower.includes('attendant') || lower.includes('behaviour') || lower.includes('behavior')) {
      draft.category = 'STAFF';
      draft.subcategory = 'Misbehavior';
      draft.severity = 'MEDIUM';
    } else if (lower.includes('student') || lower.includes('ragging') || lower.includes('bully') || lower.includes('fight') || lower.includes('disturbance')) {
      draft.category = 'STUDENT';
      draft.subcategory = 'Misbehavior';
      draft.severity = 'HIGH';
    } else if (lower.includes('ac') || lower.includes('vela seiyala') || lower.includes('overcrowd') || lower.includes('crowd') || lower.includes('seat') || lower.includes('clean') || lower.includes('dirty') || lower.includes('breakdown')) {
      draft.category = 'BUS';
      draft.subcategory = (lower.includes('ac')) ? 'AC not working' : (lower.includes('crowd') ? 'Overcrowded' : 'Bus condition');
      draft.severity = 'MEDIUM';
    } else if (lower.includes('skipped') || lower.includes('skip') || lower.includes('route changed') || lower.includes('wrong route') || lower.includes('early')) {
      draft.category = (lower.includes('skip') || lower.includes('early')) ? 'STOP' : 'ROUTE';
      draft.subcategory = (lower.includes('skip')) ? 'Skipped my stop' : 'Route changed';
      draft.severity = 'MEDIUM';
    } else if (lower.includes('pass') || lower.includes('qr') || lower.includes('scan') || lower.includes('epass')) {
      draft.category = 'ATTENDANCE';
      draft.subcategory = 'QR code not scanning';
      draft.severity = 'MEDIUM';
    } else if (lower.includes('fee') || lower.includes('payment') || lower.includes('money') || lower.includes('deduct') || lower.includes('upi') || lower.includes('receipt')) {
      draft.category = 'PAYMENT';
      draft.subcategory = 'Payment issue';
      draft.severity = 'MEDIUM';
    } else if (lower.includes('lost') || lower.includes('marandhuten') || lower.includes('forgot') || lower.includes('bag') || lower.includes('wallet') || lower.includes('phone in bus')) {
      draft.category = 'LOST_AND_FOUND';
      draft.subcategory = 'Lost item';
      draft.severity = 'LOW';
    } else if (lower.includes('app') || lower.includes('gps') || lower.includes('tracking') || lower.includes('crash') || lower.includes('glitch')) {
      draft.category = 'TECHNICAL';
      draft.subcategory = 'Live tracking not working';
      draft.severity = 'LOW';
    }
  }

  // 2. Extract Bus Number
  const busMatch = text.match(/(?:college\s+bus|bus\s*(?:no\.?|number|#)?)\s*([A-Za-z0-9\-]+)/i) ||
                   text.match(/\b([A-Z]{2}[-\s]?[0-9]{2}[-\s]?[A-Z]{1,2}[-\s]?[0-9]{4})\b/i) ||
                   text.match(/\b(\d{1,3})\b/);
  if (busMatch && (!draft.busNumber || draft.busNumber === '')) {
    const candidate = busMatch[1].trim();
    const found = busList.find(b => b.busNumber.toLowerCase() === candidate.toLowerCase());
    if (found) {
      draft.busNumber = found.busNumber;
      if (!draft.routeName) draft.routeName = found.routeName;
    } else {
      draft.busNumber = candidate;
    }
  }

  // 3. Extract Times
  const timeMatches = text.match(/\b([0-1]?[0-9]|2[0-3])(?::|\.)([0-5][0-9])\s*(am|pm|AM|PM)?\b/g);
  if (timeMatches && timeMatches.length >= 1) {
    if (!draft.expectedTime) {
      draft.expectedTime = timeMatches[0].replace('.', ':').toUpperCase();
    }
    if (timeMatches.length >= 2 && !draft.actualTime) {
      draft.actualTime = timeMatches[1].replace('.', ':').toUpperCase();
    }
  }

  // 4. Extract Stop / Location Name
  if (!draft.stop) {
    const stopMatch = text.match(/(?:at|from|near|stop)\s+([a-zA-Z\s]{3,25})(?:\s+(?:stop|stage|junction|cross|gate|road))?/i);
    if (stopMatch && stopMatch[1] && !['the', 'my', 'this', 'a', 'our'].includes(stopMatch[1].trim().toLowerCase())) {
      draft.stop = stopMatch[1].trim();
      draft.location = draft.stop;
    }
  }

  // 5. Accumulate Raw Description
  if (!draft.description) {
    draft.description = text;
  } else if (!draft.description.includes(text)) {
    draft.description += `\n${text}`;
  }
}

function analyzeAttachedImages(images, userText) {
  const count = images.length;
  let note = `I have received ${count} image${count > 1 ? 's' : ''}.`;
  let inferredCat = null;

  const lower = userText.toLowerCase();
  if (lower.includes('seat') || lower.includes('ac') || lower.includes('broken') || lower.includes('damage') || lower.includes('bus')) {
    inferredCat = 'BUS';
    note = `I have received the photo${count > 1 ? 's' : ''} regarding vehicle condition.`;
  } else if (lower.includes('pass') || lower.includes('qr') || lower.includes('ticket')) {
    inferredCat = 'ATTENDANCE';
    note = `I have attached the screenshot of your E-Pass issue.`;
  } else if (lower.includes('receipt') || lower.includes('payment') || lower.includes('upi')) {
    inferredCat = 'PAYMENT';
    note = `I have attached your payment receipt screenshot.`;
  }

  return { inferredCategory: inferredCat, note };
}

// =============================================================================
// MULTI-TURN AI REASONING & FOLLOW-UP GENERATOR (ZERO EMOJIS, CLEAN WORDING)
// =============================================================================
function generateNextConversationalStep(draft, lastUserText, visionNote) {
  const catKey = draft.category;

  // 0. Unknown Category
  if (!catKey) {
    return {
      message: `I'm here to help you report this. Which category does your issue relate to?`,
      quickChips: [...STANDARD_QUICK_CHIPS]
    };
  }

  const catObj = SUPPORT_CATEGORIES[catKey] || SUPPORT_CATEGORIES.OTHER;

  // 1. SAFETY & EMERGENCY
  if (catKey === 'SAFETY') {
    if (!draft.busNumber && !draft.location) {
      return {
        message: `This has been flagged as an urgent safety concern.\n\nIf anyone is in immediate physical danger, please move to a safe position and contact campus security or emergency services directly.\n\nWhich bus number or route did this occur on?`,
        quickChips: allBusesList.slice(0, 4).map(b => ({ label: `Bus ${b.busNumber}`, text: `Bus ${b.busNumber}` }))
      };
    }
    if (!draft.description || draft.description.length < 15) {
      return {
        message: `Please describe what happened and your current location or stop:`
      };
    }
    draft.aiSummary = generateFactualTicketSummary(draft);
    return {
      message: `I have compiled your safety report. Please review the details below before submitting:`,
      card: buildSupportTicketSummaryCard(draft)
    };
  }

  // 2. DRIVER COMPLAINT / HARSH DRIVING
  if (catKey === 'DRIVER') {
    if (!draft.busNumber) {
      return {
        message: `${visionNote ? visionNote + '\n\n' : ''}I will help you report the driver issue.\n\nWhich bus number or route were you travelling on?`,
        quickChips: allBusesList.slice(0, 4).map(b => ({ label: `Bus ${b.busNumber}`, text: `Bus ${b.busNumber}` }))
      };
    }
    if (!draft.stop && !draft.location) {
      return {
        message: `Where did this incident occur?`
      };
    }
    if (!draft.incidentTime && !draft.expectedTime) {
      return {
        message: `Approximately what time did this occur?`,
        quickChips: [{ label: 'Morning trip', text: 'Morning trip' }, { label: 'Evening return trip', text: 'Evening return trip' }]
      };
    }
    draft.aiSummary = generateFactualTicketSummary(draft);
    return {
      message: `Here is the report summary I've prepared. Please review and confirm to submit:`,
      card: buildSupportTicketSummaryCard(draft)
    };
  }

  // 3. BUS DELAY
  if (catKey === 'DELAY') {
    if (!draft.busNumber) {
      return {
        message: `${visionNote ? visionNote + '\n\n' : ''}I'll help you report the delay.\n\nWhich bus or route were you expecting?`,
        quickChips: allBusesList.slice(0, 4).map(b => ({ label: `Bus ${b.busNumber}`, text: `Bus ${b.busNumber}` }))
      };
    }
    if (!draft.stop) {
      return {
        message: `Which stop were you waiting at for Bus ${draft.busNumber}?`
      };
    }
    if (!draft.expectedTime || !draft.actualTime) {
      return {
        message: `What time was Bus ${draft.busNumber} scheduled to arrive, and what time did it actually arrive?`,
        quickChips: [
          { label: 'Morning schedule', text: 'Morning schedule' },
          { label: 'Evening schedule', text: 'Evening schedule' }
        ]
      };
    }
    draft.aiSummary = generateFactualTicketSummary(draft);
    return {
      message: `Here is the delay report I've prepared. Please review and confirm submission:`,
      card: buildSupportTicketSummaryCard(draft)
    };
  }

  // 4. BUS NOT AVAILABLE / CANCELLED
  if (catKey === 'BUS_NOT_AVAILABLE') {
    if (!draft.busNumber) {
      return {
        message: `I'm sorry your bus didn't arrive. Which bus number or route were you waiting for?`,
        quickChips: allBusesList.slice(0, 4).map(b => ({ label: `Bus ${b.busNumber}`, text: `Bus ${b.busNumber}` }))
      };
    }
    if (!draft.stop) {
      return {
        message: `Which stop were you waiting at?`
      };
    }
    if (!draft.expectedTime) {
      return {
        message: `What time was the bus scheduled to arrive at ${draft.stop || 'your stop'}?`
      };
    }
    draft.aiSummary = generateFactualTicketSummary(draft);
    return {
      message: `I have compiled all the information for the missing bus report. Please verify below:`,
      card: buildSupportTicketSummaryCard(draft)
    };
  }

  // 5. BUS CONDITION / OVERCROWDED / MAINTENANCE
  if (catKey === 'BUS' || catKey === 'MAINTENANCE') {
    if (!draft.busNumber) {
      return {
        message: `${visionNote ? visionNote + '\n\n' : ''}I'll help you file a bus report. Which bus number is this for?`,
        quickChips: allBusesList.slice(0, 4).map(b => ({ label: `Bus ${b.busNumber}`, text: `Bus ${b.busNumber}` }))
      };
    }
    if (!draft.description || draft.description.length < 15) {
      return {
        message: `Please describe the issue you are experiencing.\n\nYou can attach a photo or video if needed.`
      };
    }
    draft.aiSummary = generateFactualTicketSummary(draft);
    return {
      message: `Here is the report draft. Please verify the details:`,
      card: buildSupportTicketSummaryCard(draft)
    };
  }

  // 6. STAFF / STUDENT / ATTENDANCE / OTHER
  if (!draft.description || draft.description.length < 15) {
    return {
      message: `Please describe the issue you are experiencing.`
    };
  }

  draft.aiSummary = generateFactualTicketSummary(draft);
  return {
    message: `I've prepared a support ticket based on our conversation. Please review the details below before submitting:`,
    card: buildSupportTicketSummaryCard(draft)
  };
}

// =============================================================================
// FACTUAL ADMINISTRATIVE TICKET SUMMARY GENERATION
// =============================================================================
function generateFactualTicketSummary(draft) {
  const catObj = SUPPORT_CATEGORIES[draft.category] || SUPPORT_CATEGORIES.OTHER;
  const parts = [];

  let core = `On ${draft.incidentDate}, the student reported an issue regarding ${draft.subcategory || catObj.name}`;
  if (draft.busNumber) core += ` on Bus ${draft.busNumber}`;
  if (draft.routeName) core += ` (${draft.routeName})`;
  if (draft.stop || draft.location) core += ` near ${draft.stop || draft.location}`;
  core += `.`;
  parts.push(core);

  if (draft.expectedTime && draft.actualTime) {
    parts.push(`The bus was scheduled at ${draft.expectedTime} and arrived at ${draft.actualTime}${draft.delayDuration ? ` (${draft.delayDuration} delay)` : ''}.`);
  }

  if (draft.description) {
    parts.push(`Incident detail: ${draft.description.replace(/\n+/g, ' ')}`);
  }

  if (draft.attachments && draft.attachments.length > 0) {
    parts.push(`Attached evidence: ${draft.attachments.length} image file(s).`);
  }

  parts.push(`Categorized under ${catObj.name} with ${draft.severity} severity.`);

  return parts.join(' ');
}

// =============================================================================
// TWO-COLUMN TICKET SUMMARY CARD
// =============================================================================
function buildSupportTicketSummaryCard(draft) {
  const catObj = SUPPORT_CATEGORIES[draft.category] || SUPPORT_CATEGORIES.OTHER;
  const rows = [];

  rows.push({ key: 'Issue', val: draft.subcategory || catObj.name });
  rows.push({ key: 'Category', val: catObj.name });

  if (draft.busNumber) {
    rows.push({ key: 'Bus', val: `Bus ${draft.busNumber}` });
  }
  if (draft.routeName) {
    rows.push({ key: 'Route', val: draft.routeName });
  }
  if (draft.stop || draft.location) {
    rows.push({ key: 'Location / Stop', val: draft.stop || draft.location });
  }
  if (draft.incidentDate) {
    rows.push({ key: 'Date', val: draft.incidentDate });
  }
  if (draft.expectedTime && draft.actualTime) {
    rows.push({ key: 'Expected Time', val: draft.expectedTime });
    rows.push({ key: 'Actual Arrival', val: draft.actualTime });
  } else if (draft.incidentTime) {
    rows.push({ key: 'Time', val: draft.incidentTime });
  }

  rows.push({ key: 'Severity', val: draft.severity || 'Medium' });

  if (draft.attachments && draft.attachments.length > 0) {
    rows.push({ key: 'Evidence', val: `${draft.attachments.length} image(s)` });
  }

  return {
    type: 'CONFIRMATION',
    title: 'Report Summary',
    badge: (draft.severity || 'MEDIUM').toLowerCase(),
    rows: rows,
    narrative: draft.aiSummary || generateFactualTicketSummary(draft)
  };
}

function validateChatDraft(draft) {
  if (!draft) return 'Report information is missing';
  const cat = (draft.category || '').toUpperCase();

  if (cat === 'DELAY') {
    if (!draft.busNumber) return 'bus number';
    if (!draft.routeName && !draft.routeId) return 'route';
    if (!draft.stop && !draft.location) return 'waiting stop / stage';
    if (!draft.expectedTime) return 'expected arrival time';
    if (!draft.actualTime) return 'actual arrival time';
  } else if (cat === 'NOT_AVAILABLE') {
    if (!draft.routeName && !draft.routeId) return 'route';
    if (!draft.stop && !draft.location) return 'waiting stop / stage';
    if (!draft.expectedTime) return 'scheduled time';
  } else if (cat === 'DRIVER') {
    if (!draft.busNumber) return 'bus number';
    if (!draft.routeName && !draft.routeId) return 'route';
    if (!draft.driverName) return 'driver name';
  } else if (cat === 'BUS') {
    if (!draft.busNumber) return 'bus number';
  } else if (cat === 'ROUTE') {
    if (!draft.routeName && !draft.routeId) return 'route';
    if (!draft.stop && !draft.location) return 'stop location';
  }

  if (!draft.description && !draft.aiSummary) return 'detailed description of the issue';
  return null;
}

// =============================================================================
// TICKET SUBMISSION & FIRESTORE INTEGRATION
// =============================================================================
export async function submitSupportTicket() {
  if (isSubmitted || !currentDraft) return;

  // Independent mandatory validation of structured draft
  const missingField = validateChatDraft(currentDraft);
  if (missingField) {
    conversationMessages.push({
      id: 'msg_' + Date.now(),
      sender: 'AI',
      text: `Before submitting, could you please provide the ${missingField}?`,
      timestamp: formatCurrentTime()
    });
    renderMessages();
    return;
  }

  isSubmitted = true;
  isAiThinking = true;
  renderMessages();

  try {
    const ticketId = generateTicketId();
    const user = auth?.currentUser;
    const uid = user ? user.uid : (userProfile?.uid || 'student_guest');
    const userName = userProfile?.name || user?.displayName || 'NexRide Student';
    const userEmail = user?.email || userProfile?.email || '';
    const userRole = userProfile?.role || 'student';

    const attachmentPayload = (currentDraft.attachments || []).map(att => ({
      id: att.id,
      name: att.name,
      url: att.dataUrl,
      type: att.type
    }));

    const catObj = SUPPORT_CATEGORIES[currentDraft.category] || SUPPORT_CATEGORIES.OTHER;

    // Structured Support Ticket Document (Standardized Reports Schema)
    const ticketDoc = {
      reportId: ticketId,
      reportNumber: ticketId,
      ticketId: ticketId,
      userId: uid,
      userName: userName,
      userPhone: userProfile?.phone || user?.phoneNumber || '',
      userEmail: userEmail,
      userRole: userRole,
      category: currentDraft.category || 'OTHER',
      categoryName: catObj.name,
      categoryLabel: catObj.name,
      subcategory: currentDraft.subcategory || 'General Issue',
      title: `Report of ${currentDraft.subcategory || catObj.name}`,
      subject: `Bus ${currentDraft.busNumber || ''} - ${currentDraft.subcategory || catObj.name}`,
      description: currentDraft.aiSummary || generateFactualTicketSummary(currentDraft),
      rawDescription: currentDraft.description || '',
      severity: currentDraft.severity || 'MEDIUM',
      status: 'Submitted',
      priority: currentDraft.priority || 'NORMAL',
      busId: currentDraft.busId || (currentDraft.busNumber ? `bus_${currentDraft.busNumber}` : ''),
      busNumber: currentDraft.busNumber || '',
      routeId: currentDraft.routeId || '',
      routeName: currentDraft.routeName || '',
      stop: currentDraft.stop || currentDraft.location || '',
      location: currentDraft.location || currentDraft.stop || '',
      driverId: null,
      driverName: currentDraft.driverName || 'Unknown',
      incidentDate: currentDraft.incidentDate || new Date().toISOString().split('T')[0],
      incidentTime: currentDraft.incidentTime || '',
      expectedTime: currentDraft.expectedTime || '',
      actualTime: currentDraft.actualTime || '',
      evidenceUrls: attachmentPayload,
      attachments: attachmentPayload,
      aiGenerated: true,
      aiSummary: currentDraft.aiSummary || generateFactualTicketSummary(currentDraft),
      recommendedDepartment: currentDraft.recommendedDepartment || 'Transport Operations',
      recommendedPriority: currentDraft.severity || 'MEDIUM',
      assignedTo: null,
      assignedAt: null,
      assignedAdminId: null,
      assignedTeam: null,
      adminResponse: null,
      adminResponseAt: null,
      adminReply: null,
      resolvedAt: null,
      closedAt: null,
      conversationId: ticketId,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      statusHistory: [
        {
          status: 'Submitted',
          timestamp: new Date().toISOString(),
          message: 'Report received and registered in system via AI Assistant.'
        }
      ]
    };

    if (db) {
      await setDoc(doc(db, 'supportTickets', ticketId), ticketDoc);
      await setDoc(doc(db, 'reports', ticketId), ticketDoc);

      for (const msg of conversationMessages) {
        await addDoc(collection(db, 'supportTickets', ticketId, 'messages'), {
          sender: msg.sender.toLowerCase(),
          message: msg.text,
          timestamp: serverTimestamp()
        });
      }

      await addDoc(collection(db, 'reports', ticketId, 'activity'), {
        action: 'REPORT_SUBMITTED',
        status: 'Submitted',
        performedBy: uid,
        timestamp: serverTimestamp()
      });

      await addDoc(collection(db, 'supportTickets', ticketId, 'activity'), {
        action: 'TICKET_CREATED',
        from: null,
        to: 'Submitted',
        performedBy: uid,
        timestamp: serverTimestamp()
      });

      if (uid && uid !== 'student_guest') {
        await addDoc(collection(db, 'users', uid, 'notifications'), {
          title: 'Report Submitted',
          body: `Your report ${ticketId} (${catObj.name}) has been created and logged for review.`,
          type: 'report_status',
          reportId: ticketId,
          reportNumber: ticketId,
          ticketId: ticketId,
          read: false,
          createdAt: serverTimestamp()
        });
      }
    }

    isAiThinking = false;

    // AI Success Response (No emojis)
    const successMsg = {
      id: 'msg_' + Date.now(),
      sender: 'AI',
      text: `✓ Report submitted successfully\n\nTicket ID:\n${ticketId}\n\nStatus:\nOpen\n\nOur transport team will review your report and take appropriate action. You can track progress from Ticket History.`,
      actionButtons: [
        {
          label: 'View in Ticket History',
          primary: true,
          action: () => {
            if (window.openMyReportsPage) {
              window.openMyReportsPage();
            }
          }
        },
        {
          label: 'Back to Support',
          primary: false,
          action: () => {
            startNewConversation();
          }
        }
      ],
      timestamp: formatCurrentTime()
    };

    conversationMessages.push(successMsg);
    renderMessages();

  } catch (err) {
    console.error('[ReportChat] Failed to submit ticket:', err);
    isAiThinking = false;
    isSubmitted = false;

    conversationMessages.push({
      id: 'msg_' + Date.now(),
      sender: 'AI',
      text: `Your report could not be submitted due to a connection issue. Please try tapping Submit Report again.`,
      card: buildSupportTicketSummaryCard(currentDraft),
      timestamp: formatCurrentTime()
    });
    renderMessages();
  }
}

// Generate Unique Report/Ticket ID: NXR-{YYYY}-{random 6 digits}
function generateTicketId() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const randNum = String(Math.floor(100000 + Math.random() * 900000));
  return `NXR-${yyyy}-${randNum}`;
}

// =============================================================================
// DOM RENDERING
// =============================================================================
function renderMessages() {
  const container = document.getElementById('report-chat-messages');
  if (!container) return;

  container.innerHTML = '';

  conversationMessages.forEach(msg => {
    const isAi = msg.sender.toUpperCase() === 'AI';
    const row = document.createElement('div');
    row.className = `report-chat-message-row ${isAi ? 'ai' : 'user'}`;
    row.style.cssText = isAi
      ? 'display: flex !important; flex-direction: column !important; align-items: flex-start !important; width: 100% !important; height: auto !important; min-height: 0 !important; max-height: none !important; flex: 0 0 auto !important; box-sizing: border-box !important; margin: 0 !important; padding: 0 !important;'
      : 'display: flex !important; flex-direction: column !important; align-items: flex-end !important; width: 100% !important; height: auto !important; min-height: 0 !important; max-height: none !important; flex: 0 0 auto !important; box-sizing: border-box !important; margin: 0 !important; padding: 0 !important;';

    // AI Author label
    let authorHtml = '';
    if (isAi) {
      authorHtml = `<div class="report-chat-ai-author" style="font-size: 12px !important; font-weight: 600 !important; color: #64748B !important; margin-bottom: 4px !important; padding-left: 2px !important; display: block !important; text-align: left !important; height: auto !important; min-height: 0 !important; flex: 0 0 auto !important;">NexRide Support</div>`;
    }

    // Attached Images
    let imagesHtml = '';
    if (msg.attachments && msg.attachments.length > 0) {
      imagesHtml = msg.attachments.map(att => `
        <div class="report-chat-bubble-image-wrap" onclick="window.openReportLightbox('${att.dataUrl}')">
          <img src="${att.dataUrl}" alt="${att.name}" class="report-chat-bubble-image" />
        </div>
      `).join('');
    }

    // Text Bubble (transparent background, clean text)
    const bubbleInlineStyle = isAi
      ? 'display: inline-block !important; width: fit-content !important; max-width: 90% !important; height: auto !important; min-height: 0 !important; max-height: none !important; flex: 0 0 auto !important; padding: 2px 0 !important; background: transparent !important; background-color: transparent !important; color: #111827 !important; font-size: 15px !important; line-height: 1.45 !important; border: none !important; box-shadow: none !important; text-align: left !important; font-weight: 500 !important; word-break: break-word !important;'
      : 'display: inline-block !important; width: fit-content !important; max-width: 85% !important; height: auto !important; min-height: 0 !important; max-height: none !important; flex: 0 0 auto !important; padding: 2px 0 !important; background: transparent !important; background-color: transparent !important; color: #111827 !important; font-size: 15px !important; line-height: 1.45 !important; border: none !important; box-shadow: none !important; text-align: right !important; font-weight: 500 !important; word-break: break-word !important;';

    row.innerHTML = `
      ${authorHtml}
      <div class="report-chat-bubble" style="${bubbleInlineStyle}">
        ${imagesHtml}
        ${escapeHtml(msg.text)}
      </div>
    `;

    // Structured 2-Column Summary Card
    if (msg.card && msg.card.type === 'CONFIRMATION') {
      const cardEl = document.createElement('div');
      cardEl.className = 'report-chat-card';

      const rowsHtml = msg.card.rows.map(r => `
        <div class="report-chat-card-row">
          <span class="report-chat-card-key">${escapeHtml(r.key)}</span>
          <span class="report-chat-card-val">${escapeHtml(r.val)}</span>
        </div>
      `).join('');

      cardEl.innerHTML = `
        <div class="report-chat-card-header">
          <span class="report-chat-card-title">${msg.card.title}</span>
          <span class="report-chat-card-badge ${msg.card.badge}">${msg.card.badge}</span>
        </div>
        <div class="report-chat-card-grid">
          ${rowsHtml}
        </div>
        ${msg.card.narrative ? `
          <div class="report-chat-narrative-box">
            <span class="report-chat-narrative-title">Incident Description</span>
            <p class="report-chat-narrative-text">${escapeHtml(msg.card.narrative)}</p>
          </div>
        ` : ''}
        ${!isSubmitted ? `
          <div class="report-chat-card-actions">
            <button type="button" class="report-chat-action-btn-primary" id="btn-chat-submit-report">
              Submit Report
            </button>
            <button type="button" class="report-chat-action-btn-secondary" id="btn-chat-edit-report">
              Edit Details
            </button>
          </div>
        ` : ''}
      `;

      if (!isSubmitted) {
        cardEl.querySelector('#btn-chat-submit-report').onclick = () => {
          submitSupportTicket();
        };
        cardEl.querySelector('#btn-chat-edit-report').onclick = () => {
          openEditDetailsModal();
        };
      }

      row.appendChild(cardEl);
    }

    // Timestamp directly below the message bubble
    const ts = document.createElement('span');
    ts.className = 'report-chat-timestamp';
    ts.style.cssText = isAi
      ? 'font-size: 12px !important; color: #64748B !important; font-weight: 500 !important; margin-top: 4px !important; padding: 0 2px !important; align-self: flex-start !important; text-align: left !important; display: block !important; height: auto !important; min-height: 0 !important; flex: 0 0 auto !important;'
      : 'font-size: 12px !important; color: #64748B !important; font-weight: 500 !important; margin-top: 4px !important; padding: 0 2px !important; align-self: flex-end !important; text-align: right !important; display: block !important; height: auto !important; min-height: 0 !important; flex: 0 0 auto !important;';
    ts.textContent = msg.timestamp;
    row.appendChild(ts);

    container.appendChild(row);

    // Quick Action Chips (NO EMOJIS, Responsive wrapping) — SEPARATE component after message & timestamp
    if (msg.quickChips && msg.quickChips.length > 0 && !isSubmitted) {
      const chipsWrap = document.createElement('div');
      chipsWrap.className = 'report-chat-chips-container';
      msg.quickChips.forEach(chip => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'report-chat-chip-btn';
        if (chip.category && currentDraft && currentDraft.category === chip.category) {
          btn.classList.add('selected');
        }
        btn.textContent = chip.label;
        btn.onclick = () => {
          if (chip.category) {
            currentDraft.category = chip.category;
          }
          msg.quickChips = null;
          handleUserSendMessage(chip.text || chip.label);
        };
        chipsWrap.appendChild(btn);
      });
      container.appendChild(chipsWrap);
    }

    // Action buttons — SEPARATE component
    if (msg.actionButtons && msg.actionButtons.length > 0) {
      const actionsWrap = document.createElement('div');
      actionsWrap.className = 'report-chat-card-actions';
      actionsWrap.style.width = '100%';
      actionsWrap.style.marginTop = '8px';

      msg.actionButtons.forEach(btn => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = btn.primary ? 'report-chat-action-btn-primary' : 'report-chat-action-btn-secondary';
        b.textContent = btn.label;
        b.onclick = btn.action;
        actionsWrap.appendChild(b);
      });
      container.appendChild(actionsWrap);
    }
  });

  // AI Typing indicator (NO EMOJIS, minimal 3 dots)
  if (isAiThinking) {
    const thinkingRow = document.createElement('div');
    thinkingRow.className = 'report-chat-message-row ai';
    thinkingRow.innerHTML = `
      <div class="report-chat-ai-author">NexRide Support</div>
      <div class="report-chat-typing-bubble">
        <div class="report-chat-typing-dot"></div>
        <div class="report-chat-typing-dot"></div>
        <div class="report-chat-typing-dot"></div>
      </div>
    `;
    container.appendChild(thinkingRow);
  }

  scrollToBottom();
}

function scrollToBottom() {
  const scrollArea = document.getElementById('report-chat-scroll-area');
  if (scrollArea) {
    setTimeout(() => {
      scrollArea.scrollTop = scrollArea.scrollHeight;
    }, 50);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

window.openReportLightbox = (imgSrc) => {
  const lightbox = document.getElementById('report-image-lightbox');
  const img = document.getElementById('report-lightbox-image');
  if (lightbox && img) {
    img.src = imgSrc;
    lightbox.classList.add('active');
  }
};

// =============================================================================
// EDIT DETAILS MODAL CONTROLLER (NO EMOJIS)
// =============================================================================
export function openEditDetailsModal() {
  const modal = document.getElementById('report-edit-details-modal');
  if (!modal || !currentDraft) return;

  const fieldCat = document.getElementById('edit-report-category');
  const fieldBus = document.getElementById('edit-report-bus');
  const fieldRoute = document.getElementById('edit-report-route');
  const fieldStop = document.getElementById('edit-report-stop');
  const fieldExpTime = document.getElementById('edit-report-expected-time');
  const fieldActTime = document.getElementById('edit-report-actual-time');
  const fieldPrio = document.getElementById('edit-report-priority');
  const fieldDesc = document.getElementById('edit-report-narrative');

  if (fieldCat) fieldCat.value = currentDraft.category || 'BUS';
  if (fieldBus) fieldBus.value = currentDraft.busNumber || '';
  if (fieldRoute) fieldRoute.value = currentDraft.routeName || '';
  if (fieldStop) fieldStop.value = currentDraft.stop || currentDraft.location || '';
  if (fieldExpTime) fieldExpTime.value = currentDraft.expectedTime || '';
  if (fieldActTime) fieldActTime.value = currentDraft.actualTime || '';
  if (fieldPrio) fieldPrio.value = currentDraft.severity || 'MEDIUM';
  if (fieldDesc) fieldDesc.value = currentDraft.aiSummary || generateFactualTicketSummary(currentDraft);

  modal.classList.add('active');
}

function setupEditModalEventListeners() {
  const modal = document.getElementById('report-edit-details-modal');
  const closeBtn = document.getElementById('close-report-edit-modal');
  const saveBtn = document.getElementById('save-report-edit-btn');

  if (closeBtn && modal) {
    closeBtn.onclick = () => modal.classList.remove('active');
  }

  if (modal) {
    modal.onclick = (e) => {
      if (e.target === modal) modal.classList.remove('active');
    };
  }

  if (saveBtn && modal) {
    saveBtn.onclick = () => {
      if (!currentDraft) return;

      currentDraft.category = document.getElementById('edit-report-category')?.value || currentDraft.category;
      currentDraft.busNumber = document.getElementById('edit-report-bus')?.value.trim() || currentDraft.busNumber;
      currentDraft.routeName = document.getElementById('edit-report-route')?.value.trim() || currentDraft.routeName;
      currentDraft.stop = document.getElementById('edit-report-stop')?.value.trim() || currentDraft.stop;
      currentDraft.location = currentDraft.stop;
      currentDraft.expectedTime = document.getElementById('edit-report-expected-time')?.value.trim() || currentDraft.expectedTime;
      currentDraft.actualTime = document.getElementById('edit-report-actual-time')?.value.trim() || currentDraft.actualTime;
      currentDraft.severity = document.getElementById('edit-report-priority')?.value || currentDraft.severity;
      currentDraft.priority = (currentDraft.severity === 'CRITICAL' || currentDraft.severity === 'HIGH') ? currentDraft.severity : 'NORMAL';
      currentDraft.aiSummary = document.getElementById('edit-report-narrative')?.value.trim() || generateFactualTicketSummary(currentDraft);

      modal.classList.remove('active');

      conversationMessages.push({
        id: 'msg_' + Date.now(),
        sender: 'AI',
        text: `I've updated your ticket details. Please review the updated summary:`,
        card: buildSupportTicketSummaryCard(currentDraft),
        timestamp: formatCurrentTime()
      });

      renderMessages();
    };
  }
}
