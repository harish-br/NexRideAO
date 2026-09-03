import { auth, firestore } from './firebase-config.js';
import { 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  onAuthStateChanged, 
  signOut,
  signInAnonymously,
  browserLocalPersistence,
  setPersistence
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-firestore.js';

// --- GLOBAL ERROR CAPTURE ---
window.onerror = (msg, src, line, col, err) => {
  console.error("GLOBAL ERROR:", msg, err);
};
window.onunhandledrejection = event => {
  console.error("UNHANDLED PROMISE:", event.reason);
};

// --- PWA & SAFARI DETECTION ---
const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
const isPWA = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
console.log("[DEBUG] isSafari:", isSafari);
console.log("[DEBUG] isPWA:", isPWA);

let resendAttempts = 0;
const MAX_RESEND_ATTEMPTS = 3;

// Ensure confirmationResult survives basic re-renders by attaching to window
window.confirmationResult = window.confirmationResult || null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log("[DEBUG] Initializing Auth UI...");

  try {
    if (auth) {
      await setPersistence(auth, browserLocalPersistence);
      console.log("[DEBUG] Auth persistence forced to browserLocalPersistence");
    }
  } catch (err) {
    console.error("[DEBUG] Failed to set auth persistence:", err);
  }

  // Overlays
  const authPage = document.getElementById('auth-page');
  const otpPage = document.getElementById('otp-page');
  const termsPage = document.getElementById('terms-page');
  const privacyPage = document.getElementById('privacy-page');

  // Auth Page Elements
  const mobileInput = document.getElementById('mobile-input');
  const continueBtn = document.getElementById('auth-continue-btn');
  const authTermsLink = document.getElementById('auth-terms-link');
  const authPrivacyLink = document.getElementById('auth-privacy-link');

  // OTP Page Elements
  const backToAuthBtn = document.getElementById('back-to-auth');
  const otpSentNumber = document.getElementById('otp-sent-number');
  const otpInputs = document.querySelectorAll('.otp-input');
  const otpError = document.getElementById('otp-error');
  const verifyOtpBtn = document.getElementById('verify-otp-btn');
  const resendCountdown = document.getElementById('resend-countdown');
  const resendBtn = document.getElementById('resend-btn');

  // Global Elements
  const logoutBtn = document.getElementById('logout-btn');
  const profilePage = document.getElementById('profile-page');
  const appContainer = document.getElementById('app');

  // State management
  let recaptchaWidgetId = null;
  let isRecaptchaSolved = false;
  let isOtpSending = false;
  let isOtpVerifying = false;
  let countdownTimer = null;

  // --- RECAPTCHA LIFECYCLE MANAGER ---
  const cleanupRecaptchaVerifier = () => {
    console.log("[DEBUG] Cleaning up RecaptchaVerifier and container...");

    if (window.recaptchaVerifier) {
      try {
        window.recaptchaVerifier.clear();
      } catch (err) {
        console.warn("[DEBUG] Non-fatal error clearing recaptchaVerifier:", err);
      }
      window.recaptchaVerifier = null;
    }

    recaptchaWidgetId = null;
    isRecaptchaSolved = false;

    // Purge the container DOM completely to prevent auth/argument-error
    const container = document.getElementById('recaptcha-container');
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      container.innerHTML = '';
    }
  };

  const initVisibleRecaptcha = async () => {
    if (!auth) {
      console.warn("[DEBUG] Firebase Auth not ready");
      return null;
    }

    const container = document.getElementById('recaptcha-container');
    if (!container) {
      console.warn("[DEBUG] #recaptcha-container not in DOM");
      return null;
    }

    // Always guarantee a clean slate before instantiating
    cleanupRecaptchaVerifier();

    try {
      console.log("[DEBUG] Initializing fresh visible RecaptchaVerifier...");
      window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        'size': 'normal',
        'callback': (response) => {
          console.log("[DEBUG] reCAPTCHA solved by user. Token received.");
          isRecaptchaSolved = true;
          validateMobileForm();
        },
        'expired-callback': () => {
          console.warn("[DEBUG] reCAPTCHA token expired. User must solve again.");
          isRecaptchaSolved = false;
          validateMobileForm();
        }
      });

      recaptchaWidgetId = await window.recaptchaVerifier.render();
      console.log("[DEBUG] Recaptcha rendered successfully. Widget ID:", recaptchaWidgetId);
      return window.recaptchaVerifier;
    } catch (error) {
      console.error("[Firebase Auth Error] Failed to initialize RecaptchaVerifier:", error.code, error.message, error);
      cleanupRecaptchaVerifier();
      return null;
    }
  };

  // --- USER-FRIENDLY ERROR MAPPING ---
  const getAuthErrorMessage = (error) => {
    console.error("[Firebase Auth Error Code]:", error.code);
    console.error("[Firebase Auth Error Message]:", error.message);
    console.error("[Firebase Auth Error Full]:", error);

    switch (error.code) {
      case 'auth/captcha-check-failed':
        return "Security verification expired or was already used. Please complete the reCAPTCHA checkbox again.";
      case 'auth/invalid-app-credential':
        return "Authentication verification failed. Please try again.";
      case 'auth/too-many-requests':
        return "Too many attempts. Please wait a few minutes before trying again.";
      case 'auth/quota-exceeded':
        return "SMS limit exceeded for today. Please try again later or contact support.";
      case 'auth/requires-recent-login':
        return "This operation requires recent login. Please log in again.";
      case 'auth/invalid-phone-number':
        return "The phone number entered is invalid. Please enter a valid 10-digit mobile number.";
      case 'auth/missing-phone-number':
        return "Please enter a valid mobile number.";
      case 'auth/billing-not-enabled':
        return "SMS service is temporarily unavailable. Please contact support.";
      case 'auth/network-request-failed':
        return "Network error. Please check your internet connection and try again.";
      case 'auth/code-expired':
        return "The OTP has expired. Please click 'Resend OTP' to request a new code.";
      case 'auth/invalid-verification-code':
        return "Invalid OTP entered. Please check the code and try again.";
      case 'auth/session-expired':
        return "Session expired. Please request a new OTP.";
      default:
        if (error.message && error.message.includes('Timeout')) {
          return error.message;
        }
        return error.message ? error.message : "Authentication failed. Please try again.";
    }
  };

  // --- FULL AUTH STATE RESET ---
  const resetAuthState = () => {
    cleanupRecaptchaVerifier();
    window.confirmationResult = null;
    resendAttempts = 0;
    if (countdownTimer) {
      clearInterval(countdownTimer);
      countdownTimer = null;
    }
    isOtpSending = false;
    isOtpVerifying = false;

    if (mobileInput) {
      mobileInput.value = '';
    }
    if (continueBtn) {
      continueBtn.disabled = true;
      continueBtn.classList.remove('loading');
    }
    otpInputs.forEach(input => {
      input.value = '';
      input.classList.remove('error');
    });
    if (otpError) {
      otpError.classList.add('hidden');
      otpError.textContent = '';
    }
    if (resendCountdown) {
      resendCountdown.classList.remove('hidden');
      resendCountdown.textContent = 'Resend OTP in 30s';
    }
    if (resendBtn) {
      resendBtn.classList.add('hidden');
      resendBtn.classList.remove('loading');
    }
  };

  // --- SESSION LOGIC via onAuthStateChanged ---
  if (auth) {
    console.log("App mounted");
    console.log("Current user:", auth.currentUser);

    onAuthStateChanged(auth, async (user) => {
      console.log("Restored user:", user);

      const splash = document.getElementById('splash-screen');
      if (splash) splash.style.display = 'none';

      // Bypass auth entirely on localhost for development
      if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
        console.log("[DEBUG] Localhost detected. Bypassing auth for dev beta.");
        authPage.classList.add('hidden');
        otpPage.classList.add('hidden');
        if (appContainer) appContainer.style.display = 'flex';
        if (!user) {
          try {
            await signInAnonymously(auth);
          } catch (e) {
            console.warn("[DEBUG] Localhost anonymous auth sign-in:", e);
          }
        }
        return;
      }

      if (user && !user.isAnonymous) {
        console.log("[DEBUG] User is logged in securely with phone:", user.phoneNumber);
        authPage.classList.add('hidden');
        otpPage.classList.add('hidden');
        if (appContainer) appContainer.style.display = 'flex';
        cleanupRecaptchaVerifier();
      } else {
        console.log("[DEBUG] User not logged in. Showing auth page.");
        if (appContainer) appContainer.style.display = 'none';
        otpPage.classList.add('hidden');
        authPage.classList.remove('hidden');
        resetAuthState();
        await initVisibleRecaptcha();
      }
    });
  } else {
    // Fallback if Firebase fails to init
    const splash = document.getElementById('splash-screen');
    if (splash) splash.style.display = 'none';
    if (appContainer) appContainer.style.display = 'none';
    authPage.classList.remove('hidden');
  }

  // --- MOBILE NUMBER PAGE LOGIC ---
  const validateMobileForm = () => {
    if (!mobileInput || !continueBtn) return;
    const mobileVal = mobileInput.value.replace(/\D/g, ''); // Strip non-digits
    mobileInput.value = mobileVal; // Enforce numbers only in UI
    continueBtn.disabled = mobileVal.length !== 10;
  };

  if (mobileInput) {
    mobileInput.addEventListener('input', validateMobileForm);
  }

  // Open Terms & Privacy overlays from Auth Page
  const verificationTermsPage = document.getElementById('verification-terms-page');
  const verificationPrivacyPage = document.getElementById('verification-privacy-page');
  const backVerificationTerms = document.getElementById('back-verification-terms');
  const backVerificationPrivacy = document.getElementById('back-verification-privacy');

  if (authTermsLink) {
    authTermsLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (verificationTermsPage) verificationTermsPage.classList.remove('hidden');
    });
  }

  if (authPrivacyLink) {
    authPrivacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      if (verificationPrivacyPage) verificationPrivacyPage.classList.remove('hidden');
    });
  }

  if (backVerificationTerms) {
    backVerificationTerms.addEventListener('click', (e) => {
      e.preventDefault();
      if (verificationTermsPage) verificationTermsPage.classList.add('hidden');
    });
  }

  if (backVerificationPrivacy) {
    backVerificationPrivacy.addEventListener('click', (e) => {
      e.preventDefault();
      if (verificationPrivacyPage) verificationPrivacyPage.classList.add('hidden');
    });
  }

  // --- OTP PAGE LOGIC ---
  const startResendCountdown = () => {
    if (countdownTimer) clearInterval(countdownTimer);
    let timeLeft = 30;
    if (resendCountdown) {
      resendCountdown.classList.remove('hidden');
      resendCountdown.textContent = `Resend OTP in ${timeLeft}s`;
    }
    if (resendBtn) resendBtn.classList.add('hidden');

    countdownTimer = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        if (resendCountdown) resendCountdown.classList.add('hidden');
        if (resendAttempts < MAX_RESEND_ATTEMPTS) {
          if (resendBtn) resendBtn.classList.remove('hidden');
        } else {
          if (resendCountdown) {
            resendCountdown.textContent = "Max resend limit reached";
            resendCountdown.classList.remove('hidden');
          }
        }
      } else {
        if (resendCountdown) resendCountdown.textContent = `Resend OTP in ${timeLeft}s`;
      }
    }, 1000);
  };

  // --- SEND OTP FLOW ---
  if (continueBtn) {
    continueBtn.addEventListener('click', async () => {
      if (isOtpSending) return;

      const mobileVal = mobileInput.value.replace(/\D/g, '');
      if (mobileVal.length !== 10) {
        alert("Please enter a valid 10-digit mobile number.");
        return;
      }

      const phoneNumber = '+91' + mobileVal;

      // Check if reCAPTCHA has been completed
      let hasToken = false;
      if (recaptchaWidgetId !== null && typeof grecaptcha !== 'undefined') {
        try {
          const resp = grecaptcha.getResponse(recaptchaWidgetId);
          if (resp && resp.length > 0) {
            hasToken = true;
            isRecaptchaSolved = true;
          }
        } catch (e) {
          console.warn("[DEBUG] Error reading grecaptcha response:", e);
        }
      }

      if (!hasToken && !isRecaptchaSolved) {
        alert("Please check the 'I'm not a robot' reCAPTCHA box to continue.");
        return;
      }

      console.log("[DEBUG] --- Sending OTP ---");
      console.log("[DEBUG] phone number formatted:", phoneNumber);

      isOtpSending = true;
      continueBtn.classList.add('loading');
      continueBtn.disabled = true;

      try {
        if (!window.recaptchaVerifier) {
          console.log("[DEBUG] Initializing verifier before sending...");
          await initVisibleRecaptcha();
        }

        const appVerifier = window.recaptchaVerifier;
        if (!appVerifier) {
          throw new Error("Security verification failed to initialize. Please refresh the page.");
        }

        console.log("[DEBUG] Calling signInWithPhoneNumber...");
        const signInPromise = signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error("Timeout: Firebase Auth took too long to respond. Please check your internet connection or try again.")), 20000)
        );

        const result = await Promise.race([signInPromise, timeoutPromise]);
        console.log("[DEBUG] Firebase OTP Send Response SUCCESS.");
        window.confirmationResult = result;

        // CRITICAL: Clean up the consumed reCAPTCHA verifier immediately
        // so a stale or consumed instance can NEVER be reused.
        cleanupRecaptchaVerifier();

        if (otpSentNumber) {
          otpSentNumber.textContent = `+91 ${mobileVal.substring(0, 5)} ${mobileVal.substring(5)}`;
        }

        // Reset OTP inputs
        otpInputs.forEach(input => {
          input.value = '';
          input.classList.remove('error');
        });
        if (otpError) {
          otpError.classList.add('hidden');
          otpError.textContent = '';
        }

        // Navigate to OTP Screen
        console.log("[DEBUG] Navigation: transitioning to OTP page");
        authPage.classList.add('hidden');
        otpPage.classList.remove('hidden');

        console.log("[DEBUG] OTP sent successfully to", phoneNumber);

        startResendCountdown();
        setTimeout(() => {
          if (otpInputs[0]) otpInputs[0].focus();
        }, 100);

      } catch (error) {
        console.error("[Firebase Auth Error] OTP Send Error:", error.code, error.message);
        const errorMsg = getAuthErrorMessage(error);
        alert(errorMsg);

        // Re-initialize fresh reCAPTCHA so user can retry immediately without refreshing
        await initVisibleRecaptcha();
      } finally {
        console.log("[DEBUG] Removing loading state from Send OTP button");
        isOtpSending = false;
        continueBtn.classList.remove('loading');
        validateMobileForm();
      }
    });
  }

  // --- BACK BUTTON LOGIC ---
  if (backToAuthBtn) {
    backToAuthBtn.addEventListener('click', async () => {
      console.log("[DEBUG] Back to auth requested");
      if (countdownTimer) {
        clearInterval(countdownTimer);
        countdownTimer = null;
      }
      otpPage.classList.add('hidden');
      authPage.classList.remove('hidden');

      // Create a fresh reCAPTCHA for the new login attempt
      await initVisibleRecaptcha();
      validateMobileForm();
    });
  }

  // --- RESEND OTP FLOW ---
  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      if (resendAttempts >= MAX_RESEND_ATTEMPTS || isOtpSending) return;

      console.log("[DEBUG] --- Resending OTP ---");
      resendAttempts++;
      isOtpSending = true;

      startResendCountdown();
      otpInputs.forEach(input => {
        input.value = '';
        input.classList.remove('error');
      });
      if (otpError) {
        otpError.classList.add('hidden');
        otpError.textContent = '';
      }

      const phoneNumber = '+91' + mobileInput.value.replace(/\D/g, '');
      resendBtn.classList.add('loading');

      // Create a dedicated invisible verifier for resend from OTP screen
      let resendVerifier = null;
      let resendContainer = document.getElementById('recaptcha-resend-container');
      if (!resendContainer) {
        resendContainer = document.createElement('div');
        resendContainer.id = 'recaptcha-resend-container';
        document.body.appendChild(resendContainer);
      }
      resendContainer.innerHTML = '';

      try {
        console.log("[DEBUG] Initializing ephemeral invisible verifier for Resend...");
        resendVerifier = new RecaptchaVerifier(auth, 'recaptcha-resend-container', {
          'size': 'invisible',
          'callback': () => {
            console.log("[DEBUG] Resend invisible reCAPTCHA solved");
          }
        });

        console.log("[DEBUG] Calling signInWithPhoneNumber for Resend...");
        const result = await signInWithPhoneNumber(auth, phoneNumber, resendVerifier);

        console.log("[DEBUG] Resend OTP Send Response SUCCESS.");
        window.confirmationResult = result;
        if (otpInputs[0]) otpInputs[0].focus();
      } catch (error) {
        console.error("[Firebase Auth Error] Resend SMS failed:", error);
        const errorMsg = getAuthErrorMessage(error);
        alert("Failed to resend OTP: " + errorMsg);
      } finally {
        if (resendVerifier) {
          try {
            resendVerifier.clear();
          } catch (e) {
            console.warn("[DEBUG] Error clearing resendVerifier:", e);
          }
        }
        if (resendContainer) {
          resendContainer.innerHTML = '';
        }
        isOtpSending = false;
        resendBtn.classList.remove('loading');
      }
    });
  }

  // --- AUTO-ADVANCE OTP INPUTS ---
  otpInputs.forEach((input, index) => {
    input.addEventListener('input', (e) => {
      // Allow only numbers
      input.value = input.value.replace(/\D/g, '');
      input.classList.remove('error');
      if (otpError) otpError.classList.add('hidden');

      if (input.value.length === 1) {
        if (index < otpInputs.length - 1) {
          otpInputs[index + 1].focus();
        } else {
          input.blur(); // Auto-submit or hide keyboard when done
        }
      }
    });

    // Handle backspace
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Backspace' && input.value === '' && index > 0) {
        otpInputs[index - 1].focus();
      }
    });

    // Handle paste
    input.addEventListener('paste', (e) => {
      e.preventDefault();
      const pasteData = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
      if (pasteData) {
        for (let i = 0; i < pasteData.length; i++) {
          if (otpInputs[i]) {
            otpInputs[i].value = pasteData[i];
            otpInputs[i].classList.remove('error');
          }
        }
        if (otpError) otpError.classList.add('hidden');
        if (pasteData.length === 6) {
          otpInputs[5].focus();
        } else {
          otpInputs[pasteData.length].focus();
        }
      }
    });
  });

  // --- VERIFY OTP FLOW ---
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', async () => {
      if (isOtpVerifying) return;

      const otp = Array.from(otpInputs).map(input => input.value).join('');

      if (otp.length < 6) {
        otpInputs.forEach(input => input.classList.add('error'));
        otpError.textContent = "Please enter the complete 6-digit OTP";
        otpError.classList.remove('hidden');
        return;
      }

      console.log("[DEBUG] --- Verifying OTP ---");
      isOtpVerifying = true;
      verifyOtpBtn.classList.add('loading');
      verifyOtpBtn.disabled = true;

      try {
        if (!window.confirmationResult) {
          throw new Error("Session expired. Please request a new OTP.");
        }

        console.log("[DEBUG] Calling confirmationResult.confirm()...");
        const result = await window.confirmationResult.confirm(otp);
        const user = result.user;

        console.log("[DEBUG] after verify. result SUCCESS:", user.uid);

        // Reset auth state on successful login
        resetAuthState();

        // Transition UI for all users upon successful OTP match
        console.log("[DEBUG] navigation start: transitioning to app container");
        authPage.classList.add('hidden');
        otpPage.classList.add('hidden');
        if (appContainer) appContainer.style.display = 'flex';

      } catch (error) {
        console.error("[Firebase Auth Error] Verification error:", error);
        otpInputs.forEach(input => input.classList.add('error'));
        const errorMessage = getAuthErrorMessage(error);
        otpError.textContent = errorMessage;
        otpError.classList.remove('hidden');
      } finally {
        console.log("[DEBUG] Removing loading state from Verify OTP button");
        isOtpVerifying = false;
        verifyOtpBtn.classList.remove('loading');
        verifyOtpBtn.disabled = false;
      }
    });
  }

  // --- LOGOUT LOGIC ---
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      console.log("[DEBUG] --- Logging Out ---");
      resetAuthState();
      if (auth) {
        try {
          await signOut(auth);
          console.log("[DEBUG] Sign out successful");
          if (profilePage) profilePage.classList.add('hidden');
          // onAuthStateChanged handles showing the auth screen
        } catch (error) {
          console.error("[Firebase Auth Error] Sign out error", error);
        }
      }
    });
  }

  // --- KEYBOARD AVOIDANCE LOGIC ---
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', () => {
      const viewportHeight = window.visualViewport.height;
      const windowHeight = window.innerHeight;
      
      const authWrapper = document.getElementById('auth-bottom-wrapper');
      const otpWrapper = document.getElementById('otp-bottom-wrapper');

      // If viewport shrinks by more than 50px, assume keyboard is open
      if (viewportHeight < windowHeight - 50) {
        if (authWrapper && !authPage.classList.contains('hidden')) authWrapper.classList.add('keyboard-open');
        if (otpWrapper && !otpPage.classList.contains('hidden')) otpWrapper.classList.add('keyboard-open');
      } else {
        if (authWrapper) authWrapper.classList.remove('keyboard-open');
        if (otpWrapper) otpWrapper.classList.remove('keyboard-open');
      }
    });
  }
});
