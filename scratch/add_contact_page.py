import os

with open('index.html', 'r') as f:
    content = f.read()

# Add the new page after trusted-contacts-page
add_contact_html = """
  <!-- Add Contact Page Overlay -->
  <div id="add-contact-page" class="page-overlay push-overlay hidden" style="background-color: #F8F9FA; height: 100vh; z-index: 5001; display: flex; flex-direction: column;">
    <!-- Header -->
    <div class="top-bar" style="background: #F8F9FA; position: sticky; top: 0; z-index: 10; display: flex; align-items: center; padding: 16px 20px;">
      <button id="back-add-contact" class="back-btn" style="background: #FFFFFF; border-radius: 50%; width: 40px; height: 40px; display: flex; align-items: center; justify-content: center; border: 1px solid #E5E7EB; cursor: pointer; box-shadow: 0 1px 2px rgba(0,0,0,0.05);">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#111827" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <line x1="19" y1="12" x2="5" y2="12"></line>
          <polyline points="12 19 5 12 12 5"></polyline>
        </svg>
      </button>
      <div style="flex: 1; display: flex; justify-content: center; padding-right: 40px;">
        <span class="dashboard-title" style="font-weight: 600; font-size: 16px; color: #374151;">Add Contact</span>
      </div>
    </div>

    <!-- Form Content -->
    <div style="padding: 24px 20px; flex: 1; display: flex; flex-direction: column; gap: 20px;">
      
      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label for="new-contact-name" style="font-weight: 600; font-size: 14px; color: #374151;">Contact Name</label>
        <input type="text" id="new-contact-name" placeholder="Enter name" style="width: 100%; padding: 16px; border: 1px solid #E5E7EB; border-radius: 12px; font-size: 16px; font-family: inherit; outline: none; transition: border-color 0.2s;" onfocus="this.style.borderColor='#2563EB'" onblur="this.style.borderColor='#E5E7EB'">
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <label for="new-contact-phone" style="font-weight: 600; font-size: 14px; color: #374151;">Mobile Number</label>
        <div style="display: flex; width: 100%; border: 1px solid #E5E7EB; border-radius: 12px; overflow: hidden; transition: border-color 0.2s;" id="phone-input-container">
          <div style="padding: 16px; background: #F9FAFB; border-right: 1px solid #E5E7EB; font-weight: 600; color: #4B5563; font-size: 16px;">
            +91
          </div>
          <input type="tel" id="new-contact-phone" placeholder="Enter mobile number" maxlength="10" style="flex: 1; padding: 16px; border: none; font-size: 16px; font-family: inherit; outline: none;" onfocus="document.getElementById('phone-input-container').style.borderColor='#2563EB'" onblur="document.getElementById('phone-input-container').style.borderColor='#E5E7EB'">
        </div>
      </div>

    </div>

    <!-- Footer Save Button -->
    <div style="padding: 20px; padding-bottom: 40px; background: #FFFFFF; border-top: 1px solid #F3F4F6;">
      <button id="save-new-contact-btn" disabled style="width: 100%; background: #2563EB; color: white; border: none; padding: 16px; border-radius: 12px; font-weight: 600; font-size: 16px; cursor: pointer; transition: opacity 0.2s; opacity: 0.5;">
        Save Contact
      </button>
    </div>
  </div>
"""

insert_pos = "  <!-- Auth Page Overlay (Mobile Number) -->"
content = content.replace(insert_pos, add_contact_html + '\n' + insert_pos)

with open('index.html', 'w') as f:
    f.write(content)

with open('js/sheet.js', 'r') as f:
    sheet_content = f.read()

# Update sheet.js Add Contact logic
import re

# Find the add contact event listener inside if (addContactBtn && contactList) { ... }
match = re.search(r'(addContactBtn\.addEventListener\(\'pointerdown\', async \(\) => \{)(.*?)(    \}\);\n\n    function bindDeleteButtons)', sheet_content, re.DOTALL)

if match:
    new_logic = """addContactBtn.addEventListener('pointerdown', () => {
      const addContactPage = document.getElementById('add-contact-page');
      if(addContactPage) {
        addContactPage.classList.remove('hidden');
        document.getElementById('new-contact-name').focus();
      }
    });

    const addContactPage = document.getElementById('add-contact-page');
    const backAddContactBtn = document.getElementById('back-add-contact');
    const newContactName = document.getElementById('new-contact-name');
    const newContactPhone = document.getElementById('new-contact-phone');
    const saveNewContactBtn = document.getElementById('save-new-contact-btn');

    if(addContactPage && backAddContactBtn && newContactName && newContactPhone && saveNewContactBtn) {
      
      const closeAddContactPage = () => {
        addContactPage.classList.add('hidden');
        newContactName.value = '';
        newContactPhone.value = '';
        validateForm();
      };

      backAddContactBtn.addEventListener('pointerdown', closeAddContactPage);

      const validateForm = () => {
        const nameValid = newContactName.value.trim().length > 0;
        const phoneVal = newContactPhone.value.replace(/\D/g, '');
        newContactPhone.value = phoneVal;
        const phoneValid = phoneVal.length === 10;
        
        if(nameValid && phoneValid) {
          saveNewContactBtn.disabled = false;
          saveNewContactBtn.style.opacity = '1';
        } else {
          saveNewContactBtn.disabled = true;
          saveNewContactBtn.style.opacity = '0.5';
        }
      };

      newContactName.addEventListener('input', validateForm);
      newContactPhone.addEventListener('input', validateForm);

      saveNewContactBtn.addEventListener('pointerdown', async () => {
        if(saveNewContactBtn.disabled) return;
        
        saveNewContactBtn.disabled = true;
        saveNewContactBtn.innerText = 'Saving...';
        
        const name = newContactName.value.trim();
        const phone = newContactPhone.value;
        const newContact = {
          id: Date.now().toString(),
          name,
          phone
        };

        currentContacts.push(newContact);
        renderContacts();

        const user = auth.currentUser;
        if (user) {
          try {
            await updateDoc(doc(db, 'users', user.uid), {
              trustedContacts: arrayUnion(newContact)
            });
          } catch (error) {
            console.error("Error adding trusted contact:", error);
          }
        } else {
          localStorage.setItem('trustedContacts', JSON.stringify(currentContacts));
        }

        saveNewContactBtn.innerText = 'Save Contact';
        closeAddContactPage();
      });
    }

"""
    sheet_content = sheet_content[:match.start(1)] + new_logic + sheet_content[match.end(2):]
    
    with open('js/sheet.js', 'w') as f:
        f.write(sheet_content)
    print("Updated sheet.js perfectly!")
else:
    print("Regex failed to match in sheet.js")
