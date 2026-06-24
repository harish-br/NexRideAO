import { auth } from './firebase-config.js';
import { 
  RecaptchaVerifier, 
  signInWithPhoneNumber, 
  onAuthStateChanged, 
  signOut,
  setPersistence,
  browserLocalPersistence
} from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

let resendAttempts = 0;
const MAX_RESEND_ATTEMPTS = 3;

// Ensure confirmationResult survives basic re-renders by attaching to window
window.confirmationResult = window.confirmationResult || null;

document.addEventListener('DOMContentLoaded', async () => {
  console.log("[DEBUG] Initializing Auth UI...");

  // Set Local Persistence immediately to survive mobile browser suspends
  try {
    if (auth) {
      await setPersistence(auth, browserLocalPersistence);
      console.log("[DEBUG] Auth persistence set to browserLocalPersistence");
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

  // Set up Firebase Recaptcha
  const setupRecaptcha = () => {
    try {
      if (window.recaptchaVerifier) {
        // Clear old instance before recreating to prevent memory leaks/stale state
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
      
      if (auth) {
        console.log("[DEBUG] Initializing visible RecaptchaVerifier...");
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          'size': 'normal', 
          'callback': (response) => {
            console.log("[DEBUG] reCAPTCHA solved automatically. Token:", response);
          },
          'expired-callback': () => {
            console.warn("[DEBUG] reCAPTCHA expired. Please solve again.");
          }
        });
        window.recaptchaVerifier.render();
        console.log("[DEBUG] Recaptcha initialized successfully");
      }
    } catch (error) {
      console.error("[DEBUG] Failed to initialize Recaptcha:", error);
    }
  };

  // --- SESSION LOGIC via onAuthStateChanged ---
  if (auth) {
    onAuthStateChanged(auth, (user) => {
      if (user && !user.isAnonymous) {
        console.log("[DEBUG] User is logged in securely with phone:", user.phoneNumber);
        authPage.classList.add('hidden');
        otpPage.classList.add('hidden');
        if(appContainer) appContainer.style.display = 'flex';
      } else {
        console.log("[DEBUG] User not logged in. Showing auth page.");
        if(appContainer) appContainer.style.display = 'none';
        authPage.classList.remove('hidden');
        setupRecaptcha();
      }
    });
  } else {
    // Fallback if Firebase fails to init
    if(appContainer) appContainer.style.display = 'none';
    authPage.classList.remove('hidden');
  }

  // --- MOBILE NUMBER PAGE LOGIC ---
  const validateMobileForm = () => {
    const mobileVal = mobileInput.value.replace(/\D/g, ''); // Strip non-digits
    mobileInput.value = mobileVal; // Enforce numbers only in UI
    continueBtn.disabled = mobileVal.length !== 10;
  };

  if (mobileInput) {
    mobileInput.addEventListener('input', validateMobileForm);
  }

  // Open Terms & Privacy overlays from Auth Page
  if (authTermsLink) {
    authTermsLink.addEventListener('click', (e) => {
      e.preventDefault();
      if(termsPage) termsPage.classList.remove('hidden');
    });
  }

  if (authPrivacyLink) {
    authPrivacyLink.addEventListener('click', (e) => {
      e.preventDefault();
      if(privacyPage) privacyPage.classList.remove('hidden');
    });
  }

  // --- OTP PAGE LOGIC ---
  let countdownTimer;
  
  const startResendCountdown = () => {
    clearInterval(countdownTimer);
    let timeLeft = 30;
    resendCountdown.classList.remove('hidden');
    resendBtn.classList.add('hidden');
    
    resendCountdown.textContent = `Resend OTP in ${timeLeft}s`;
    
    countdownTimer = setInterval(() => {
      timeLeft--;
      if (timeLeft <= 0) {
        clearInterval(countdownTimer);
        resendCountdown.classList.add('hidden');
        if (resendAttempts < MAX_RESEND_ATTEMPTS) {
          resendBtn.classList.remove('hidden');
        } else {
          resendCountdown.textContent = "Max resend limit reached";
          resendCountdown.classList.remove('hidden');
        }
      } else {
        resendCountdown.textContent = `Resend OTP in ${timeLeft}s`;
      }
    }, 1000);
  };

  // --- SEND OTP FLOW ---
  if (continueBtn) {
    continueBtn.addEventListener('click', async () => {
      const mobileVal = mobileInput.value;
      const phoneNumber = '+91' + mobileVal;
      
      console.log("[DEBUG] --- Sending OTP ---");
      console.log("[DEBUG] phone number formatted:", phoneNumber);
      
      continueBtn.classList.add('loading');
      continueBtn.disabled = true;
      
      try {
        if (!window.recaptchaVerifier) {
          setupRecaptcha();
        }

        const appVerifier = window.recaptchaVerifier;
        if (!appVerifier) {
          throw new Error("Security check failed to initialize. Please refresh the page.");
        }

        console.log("[DEBUG] Calling signInWithPhoneNumber...");
        
        // Timeout wrapper for iOS Safari hang bug
        const signInPromise = signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error("Timeout: Firebase Auth took too long to respond. Please check your internet connection or try again.")), 15000)
        );
        
        const result = await Promise.race([signInPromise, timeoutPromise]);
        
        console.log("[DEBUG] Firebase OTP Send Response SUCCESS.");
        window.confirmationResult = result;
        
        otpSentNumber.textContent = `+91 ${mobileVal.substring(0, 5)} ${mobileVal.substring(5)}`;
        
        // Reset OTP inputs
        otpInputs.forEach(input => {
          input.value = '';
          input.classList.remove('error');
        });
        otpError.classList.add('hidden');

        // Navigate to OTP Screen
        console.log("[DEBUG] Navigation start: transitioning to OTP page");
        authPage.classList.add('hidden');
        otpPage.classList.remove('hidden');
        
        console.log("[DEBUG] OTP sent successfully to", phoneNumber);
        
        startResendCountdown();
        setTimeout(() => otpInputs[0].focus(), 100);

      } catch (error) {
        console.error("[DEBUG] OTP Send Error:", error.code, error.message);
        
        let errorMsg = "Failed to send OTP: " + error.message;
        if (error.code === 'auth/too-many-requests') {
          errorMsg = "Too many attempts. Please try again later or use a different number.";
        } else if (error.code === 'auth/billing-not-enabled') {
          errorMsg = "Firebase billing issue detected. Please check project settings.";
        } else if (error.code === 'auth/captcha-check-failed') {
          errorMsg = "Security check failed. Check if domain is authorized in Firebase.";
        }
        
        alert(errorMsg);
        
        // Reset reCAPTCHA so user can try again
        try {
          if (window.recaptchaVerifier && typeof grecaptcha !== 'undefined') {
            await window.recaptchaVerifier.render().then(widgetId => grecaptcha.reset(widgetId));
          } else {
             setupRecaptcha(); // Re-initialize if completely broken
          }
        } catch (resetErr) {
          console.error("[DEBUG] Failed to reset reCAPTCHA:", resetErr);
          setupRecaptcha();
        }
      } finally {
        console.log("[DEBUG] Removing loading state from Send OTP button");
        continueBtn.classList.remove('loading');
        continueBtn.disabled = false;
      }
    });
  }

  // --- BACK BUTTON LOGIC ---
  if (backToAuthBtn) {
    backToAuthBtn.addEventListener('click', () => {
      otpPage.classList.add('hidden');
      authPage.classList.remove('hidden');
      clearInterval(countdownTimer);
    });
  }

  // --- RESEND OTP FLOW ---
  if (resendBtn) {
    resendBtn.addEventListener('click', async () => {
      if (resendAttempts >= MAX_RESEND_ATTEMPTS) return;
      
      console.log("[DEBUG] --- Resending OTP ---");
      resendAttempts++;
      
      startResendCountdown();
      otpInputs.forEach(input => {
        input.value = '';
        input.classList.remove('error');
      });
      otpError.classList.add('hidden');
      
      const phoneNumber = '+91' + mobileInput.value;
      resendBtn.classList.add('loading');
      
      try {
        const appVerifier = window.recaptchaVerifier;
        if (!appVerifier) throw new Error("Security check missing. Please go back and refresh.");
        
        console.log("[DEBUG] Calling signInWithPhoneNumber for Resend...");
        const result = await signInWithPhoneNumber(auth, phoneNumber, appVerifier);
        
        console.log("[DEBUG] Resend OTP Send Response SUCCESS.");
        window.confirmationResult = result;
        otpInputs[0].focus();
      } catch (error) {
        console.error("[DEBUG] Resend SMS failed", error);
        alert("Failed to resend OTP: " + error.message);
      } finally {
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
      otpError.classList.add('hidden');

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
        otpError.classList.add('hidden');
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
      const otp = Array.from(otpInputs).map(input => input.value).join('');
      
      if (otp.length < 6) {
        otpInputs.forEach(input => input.classList.add('error'));
        otpError.textContent = "Please enter the complete 6-digit OTP";
        otpError.classList.remove('hidden');
        return;
      }

      console.log("[DEBUG] --- Verifying OTP ---");
      console.log("[DEBUG] before verify. OTP:", otp);
      
      verifyOtpBtn.classList.add('loading');
      verifyOtpBtn.disabled = true;
      
      try {
        if (!window.confirmationResult) {
          throw new Error("Session expired. Please request a new OTP.");
        }
        
        console.log("[DEBUG] Calling confirmationResult.confirm()...");
        const result = await window.confirmationResult.confirm(otp);
        
        console.log("[DEBUG] after verify. result SUCCESS:", result.user.uid);
        
        // Transition UI for all users upon successful OTP match
        console.log("[DEBUG] navigation start: transitioning to app container");
        authPage.classList.add('hidden');
        otpPage.classList.add('hidden');
        if(appContainer) appContainer.style.display = 'flex';
        
      } catch (error) {
        console.error("[DEBUG] Verification error:", error);
        
        otpInputs.forEach(input => input.classList.add('error'));
        
        let errorMessage = "Invalid OTP. Please try again.";
        if (error.message.includes('Session expired')) {
           errorMessage = error.message;
        } else if (error.code === 'auth/invalid-verification-code') {
          errorMessage = "Invalid OTP. Please check and try again.";
        } else if (error.code === 'auth/code-expired') {
          errorMessage = "OTP expired. Please request a new OTP.";
        } else if (error.code === 'auth/too-many-requests') {
          errorMessage = "Too many attempts. Please try again later.";
        } else if (error.code === 'auth/network-request-failed') {
          errorMessage = "Network error. Please check your internet connection.";
        } else {
          errorMessage = "Verification failed: " + error.message;
        }
        
        otpError.textContent = errorMessage;
        otpError.classList.remove('hidden');
      } finally {
        console.log("[DEBUG] Removing loading state from Verify OTP button");
        verifyOtpBtn.classList.remove('loading');
        verifyOtpBtn.disabled = false;
      }
    });
  }

  // --- LOGOUT LOGIC ---
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      console.log("[DEBUG] --- Logging Out ---");
      if (auth) {
        try {
          await signOut(auth);
          console.log("[DEBUG] Sign out successful");
          if (profilePage) profilePage.classList.add('hidden');
          // onAuthStateChanged handles showing the auth screen
        } catch (error) {
          console.error("[DEBUG] Sign out error", error);
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
