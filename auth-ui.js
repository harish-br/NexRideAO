import { auth } from './firebase-config.js';
import { RecaptchaVerifier, signInWithPhoneNumber, onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js';

let confirmationResult = null;
let resendAttempts = 0;
const MAX_RESEND_ATTEMPTS = 3;

document.addEventListener('DOMContentLoaded', () => {
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
      if (!window.recaptchaVerifier && auth) {
        console.log("[DEBUG] Initializing RecaptchaVerifier...");
        window.recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
          'size': 'invisible',
          'callback': (response) => {
            console.log("[DEBUG] reCAPTCHA solved. Token:", response);
          },
          'expired-callback': () => {
            console.warn("[DEBUG] reCAPTCHA expired. Please solve again.");
          }
        });
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
        // User is logged in securely with phone
        authPage.classList.add('hidden');
        otpPage.classList.add('hidden');
        if(appContainer) appContainer.style.display = 'flex';
      } else {
        // Not logged in or anonymous
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

    const isValidNumber = mobileVal.length === 10;

    if (isValidNumber) {
      continueBtn.disabled = false;
    } else {
      continueBtn.disabled = true;
    }
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

  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      const mobileVal = mobileInput.value;
      const phoneNumber = '+91' + mobileVal;
      
      console.log("[DEBUG] phone number formatted:", phoneNumber);
      
      continueBtn.classList.add('loading');
      
      console.log("[DEBUG] OTP send started...");
      continueBtn.disabled = true;
      
      if (!window.recaptchaVerifier) {
        setupRecaptcha();
      }
      const appVerifier = window.recaptchaVerifier;

      signInWithPhoneNumber(auth, phoneNumber, appVerifier)
        .then((result) => {
          console.log("[DEBUG] Firebase OTP Send Response:", result);
          confirmationResult = result;
          continueBtn.classList.remove('loading');
          otpSentNumber.textContent = `+91 ${mobileVal.substring(0, 5)} ${mobileVal.substring(5)}`;
          
          // Reset OTP inputs
          otpInputs.forEach(input => {
            input.value = '';
            input.classList.remove('error');
          });
          otpError.classList.add('hidden');

          authPage.classList.add('hidden');
          otpPage.classList.remove('hidden');
          
          // Toast Notification
          alert("OTP sent successfully to " + phoneNumber);
          
          startResendCountdown();
          setTimeout(() => otpInputs[0].focus(), 100);
        }).catch((error) => {
          console.error("[DEBUG] OTP Send Error:", error.code, error.message);
          continueBtn.classList.remove('loading');
          continueBtn.disabled = false;
          alert("Firebase Error (" + error.code + "):\n" + error.message);
          
          // Reset reCAPTCHA so user can try again
          if (window.recaptchaVerifier) {
            window.recaptchaVerifier.render().then(widgetId => grecaptcha.reset(widgetId));
          }
        });
    });
  }

  if (backToAuthBtn) {
    backToAuthBtn.addEventListener('click', () => {
      otpPage.classList.add('hidden');
      authPage.classList.remove('hidden');
      clearInterval(countdownTimer);
    });
  }

  if (resendBtn) {
    resendBtn.addEventListener('click', () => {
      if (resendAttempts >= MAX_RESEND_ATTEMPTS) return;
      resendAttempts++;
      
      // Simulate sending OTP again via Firebase
      startResendCountdown();
      otpInputs.forEach(input => {
        input.value = '';
        input.classList.remove('error');
      });
      otpError.classList.add('hidden');
      
      const phoneNumber = '+91' + mobileInput.value;
      const appVerifier = window.recaptchaVerifier;
      
      signInWithPhoneNumber(auth, phoneNumber, appVerifier)
        .then((result) => {
          confirmationResult = result;
          otpInputs[0].focus();
        }).catch((error) => {
          console.error("Resend SMS failed", error);
          alert("Firebase Error: " + error.message);
        });
    });
  }

  // Auto-advance OTP inputs
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

  // Verify OTP
  if (verifyOtpBtn) {
    verifyOtpBtn.addEventListener('click', () => {
      const otp = Array.from(otpInputs).map(input => input.value).join('');
      
      if (otp.length < 6) {
        otpInputs.forEach(input => input.classList.add('error'));
        otpError.textContent = "Please enter the complete 6-digit OTP";
        otpError.classList.remove('hidden');
        return;
      }

      verifyOtpBtn.classList.add('loading');
      verifyOtpBtn.disabled = true;
      console.log("[DEBUG] Verification started with OTP:", otp);
      
      if (confirmationResult) {
        confirmationResult.confirm(otp).then((result) => {
          console.log("[DEBUG] Verification result SUCCESS:", result);
          verifyOtpBtn.classList.remove('loading');
          verifyOtpBtn.disabled = false;
          
          // Transition UI for all users upon successful OTP match
          authPage.classList.add('hidden');
          otpPage.classList.add('hidden');
          if(appContainer) appContainer.style.display = 'flex';
          
        }).catch((error) => {
          console.error("[DEBUG] Verification error:", error.code, error.message);
          verifyOtpBtn.classList.remove('loading');
          verifyOtpBtn.disabled = false;
          otpInputs.forEach(input => input.classList.add('error'));
          
          let errorMessage = "Invalid OTP. Please try again.";
          if (error.code === 'auth/invalid-verification-code') {
            errorMessage = "Invalid OTP. Please check and try again.";
          } else if (error.code === 'auth/code-expired') {
            errorMessage = "OTP expired. Please request a new OTP.";
          } else if (error.code === 'auth/too-many-requests') {
            errorMessage = "Too many attempts. Please try again later.";
          } else {
            errorMessage = "Verification failed: " + error.message;
          }
          
          otpError.textContent = errorMessage;
          otpError.classList.remove('hidden');
        });
      } else {
        console.warn("[DEBUG] confirmationResult is null");
        verifyOtpBtn.classList.remove('loading');
        verifyOtpBtn.disabled = false;
        alert("Session expired. Please request a new OTP.");
      }
    });
  }

  // --- LOGOUT LOGIC ---
  if (logoutBtn) {
    logoutBtn.addEventListener('click', () => {
      if (auth) {
        signOut(auth).then(() => {
          if (profilePage) profilePage.classList.add('hidden');
          // onAuthStateChanged handles showing the auth screen
        }).catch((error) => {
          console.error("Sign out error", error);
        });
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
