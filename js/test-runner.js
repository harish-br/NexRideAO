// Inject a script to simulate the entire process
setTimeout(() => {
  console.log("=== AUTOMATED TEST SCRIPT INJECTED ===");
  // Simulate phone number input
  const mobileInput = document.getElementById('mobile-input');
  mobileInput.value = '0000000000';
  mobileInput.dispatchEvent(new Event('input'));
  
  // Click continue
  const continueBtn = document.getElementById('auth-continue-btn');
  continueBtn.click();
  
  setTimeout(() => {
    // We should be on OTP page now.
    // Let's enter a WRONG OTP (111111)
    const otpInputs = document.querySelectorAll('.otp-input');
    otpInputs.forEach(input => input.value = '1');
    
    // Click verify
    const verifyBtn = document.getElementById('verify-otp-btn');
    verifyBtn.click();
    
    setTimeout(() => {
      console.log("After Verify Click (Wrong OTP). App Container Display:", document.getElementById('app').style.display);
      console.log("OTP Error Text:", document.getElementById('otp-error').textContent);
      
      // Now let's try CORRECT OTP
      otpInputs.forEach(input => input.value = '');
      otpInputs[0].value = '1';
      otpInputs[1].value = '2';
      otpInputs[2].value = '3';
      otpInputs[3].value = '4';
      otpInputs[4].value = '5';
      otpInputs[5].value = '6';
      
      verifyBtn.click();
      
      setTimeout(() => {
        console.log("After Verify Click (Correct OTP). App Container Display:", document.getElementById('app').style.display);
      }, 1000);
      
    }, 1000);
  }, 1000);
}, 2000);
