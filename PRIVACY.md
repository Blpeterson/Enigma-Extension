# Drive Vault Privacy Policy

Effective date: September 16, 2026

Drive Vault encrypts and decrypts user-selected text and files locally in the browser. It does not operate a remote service and does not send user content, passwords, encryption keys, browsing activity, or usage analytics to the developer or to third parties.

## Data processed

Drive Vault can process:

- Text that the user enters for encryption.
- Encrypted text detected on pages where the extension is enabled.
- User-selected local files and their file names and media types.
- Personal and named shared passwords entered by the user.
- The URL or origin of a page used to route the side panel and remember optional site access.

This processing provides the extension's user-facing encryption and decryption features. Drive Vault does not use this information for advertising, profiling, analytics, or any unrelated purpose. It does not sell or transfer user data and does not permit humans to read user content.

## Local storage and retention

- In session-only mode, passwords are kept in Chrome extension session storage and are removed when the browser session ends or the vault locks.
- In encrypted-local mode, passwords are encrypted with the user's master password before the resulting ciphertext is stored in Chrome extension local storage. The master password is not stored there.
- The currently selected encrypted payload and its decrypted result can remain temporarily in extension session storage so the Read tab can display it. The user can clear it, and it is removed when the vault locks.
- Optional enabled-site origins can be stored locally so the extension can restore the user's choices.
- Selected files are processed in memory. Drive Vault does not persist their plaintext or ciphertext unless the user downloads the result.

The encrypted local vault can be deleted from the extension. Removing the extension also removes its Chrome-managed local data.

## Page access

Drive Vault has built-in access to Gmail and Google Calendar so it can detect Drive Vault ciphertext and insert user-requested ciphertext. Access to other websites is optional and must be granted by the user. Plaintext created in the side panel is not inserted into Gmail or Google Calendar.

## Security

Drive Vault uses browser cryptography locally, but no browser extension can protect information from a compromised browser, another sufficiently privileged extension, operating-system compromise, screenshots, or physical access while the vault is unlocked. There is no password-recovery service.

## Limited Use

Drive Vault's use of information obtained from Google services complies with the Chrome Web Store User Data Policy, including its Limited Use requirements. Information is used only to provide the extension's encryption and decryption features.

## Changes and contact

Material changes to this policy will be published with an updated effective date. Privacy questions can be sent through the support contact listed on Drive Vault's Chrome Web Store page.
