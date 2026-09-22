# Drive Vault Browser Extension

A Chromium Manifest V3 extension for local `GVDV1` encryption and decryption. It works without Google APIs or OAuth.

## What is included

- Automatic encrypted-text detection on Gmail and Google Calendar, including envelopes split across inline formatting such as Gmail's word-break elements. A nearby **Decrypt** button opens plaintext in the side panel.
- A Read-tab decryption-key selector with automatic detection plus direct personal or shared-profile retry.
- Per-site opt-in for other HTTP/HTTPS sites.
- A personal password and named shared-password profiles.
- Session-only storage or an encrypted local password vault.
- Configurable automatic locking from 1 to 59 minutes.
- Extension-origin side-panel composition for Gmail and Calendar.
- Local file encryption and decryption through browser file pickers.
- Compatibility with the Drive Vault `GVDV1:` text envelope and `.gvdv` binary package layout.

## Privacy boundary

Gmail plaintext composed in the side panel is never inserted into Gmail; only the completed ciphertext is sent to the page content script. Calendar location and description values follow the same rule, and title insertion is omitted when **Encrypt title** is switched off. Detected ciphertext remains unchanged in the page. Clicking its **Decrypt** button opens the result in the side panel's **Read** tab, so decrypted text is not written into Gmail or Calendar's DOM.

The side panel follows the active site: Gmail selects **Compose**, Calendar selects **Calendar**, and a page decrypt action selects **Read**. Chromium requires a user gesture to open a closed side panel, so page detection cannot silently open or expand it; the injected **Decrypt** control provides that gesture.

For Calendar, the insertion adapter supports both the quick event dialog and fullscreen editor. When the quick dialog hides location or description, it reveals those fields in place and never clicks **More options** or changes editor modes automatically.

An extension cannot protect data from a compromised browser, malicious extension with sufficient privileges, operating system compromise, screenshots, or physical access while the vault is unlocked. The encrypted local vault has no password-recovery mechanism.

## Development

Requirements: Node.js 20 or newer, npm, and a Chromium-based browser such as
Google Chrome or Microsoft Edge.

Clone the repository, install the locked dependencies, and run the checks:

```powershell
git clone https://github.com/Blpeterson/browser-extension.git
cd browser-extension
npm ci
npm run build
npm test
npm run smoke
```

`npm run smoke` loads `dist` into an isolated temporary Chromium profile, checks the locked and unlocked extension pages, opens the side panel repeatedly, verifies the page-to-Read-tab decrypt handoff, and exercises stored-vault, text, and file roundtrips. Screenshots are written under `artifacts/smoke`.

Then open `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the generated `dist` folder.

## Chrome Web Store package

On Windows, create a Store-ready ZIP with:

```powershell
npm ci
npm run check
npm run smoke
npm run package:store
```

The package is written to `artifacts/package/drive-vault-<version>-chrome.zip`. The script builds the production extension and verifies that `manifest.json` is at the ZIP root. Upload that ZIP in the Chrome Developer Dashboard; do not zip the `dist` directory itself as a containing folder.

Before every update, increase `version` in `public/manifest.json`. Chrome requires every uploaded version to be higher than the previous one. The current Web Store package limit is 2 GB, which is separate from Drive Vault's in-browser file-processing limit.

For Store review:

- Host [PRIVACY.md](PRIVACY.md) at a public URL, add that URL in the dashboard, and replace the support contact with your published support channel.
- In **Privacy practices**, disclose that the extension handles authentication information, personal communications, website content, and user-provided files locally.
- Explain the required permissions: `activeTab` identifies the invoked tab; `alarms` enforces auto-lock; `scripting` installs approved optional-site support; `sidePanel` hosts the secure workspace; and `storage` holds settings, session state, and the encrypted local vault.
- Explain that Gmail and Google Calendar host access provides ciphertext detection and user-requested insertion. Other HTTP/HTTPS access is optional and granted per site.
- Test the exact ZIP with a fresh Chrome profile before upload, then provide accurate screenshots, support details, and listing copy in the dashboard.

Google's current packaging and submission guidance is available in [Prepare your extension](https://developer.chrome.com/docs/webstore/prepare/) and [Publish in the Chrome Web Store](https://developer.chrome.com/docs/webstore/publish/).

## Password storage

- **Session only:** passwords are held in Chromium's extension session storage and disappear when the browser session ends.
- **Stored locally:** the password collection is serialized and encrypted as a `GVDV1:` payload with the master password. Only that ciphertext is written to local extension storage.
- In either mode, unlocked material is removed after the selected 1–59 minute interval. Using an encryption action restarts the current countdown; passive page scanning does not.

## Current limitations

- Gmail and Calendar are private, frequently changing DOM applications. Their insertion adapters are deliberately defensive but may need selector maintenance.
- Optional-site decryption begins after the user grants access and may require a page reload on pages that reject script injection.
- File processing is in memory and is limited to 40 MiB per file. Files are base64-encoded for Chrome extension messaging, so this leaves headroom below Chrome's 64 MiB message limit.
- Firefox support is not included in this Chromium-first release.

## License

Released under the [MIT License](LICENSE). Copyright (c) 2026 Bracken Peterson.
