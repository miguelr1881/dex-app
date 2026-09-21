# DEX Web

Build: 0.7.0-crypto4. GitHub Pages interface with optional encrypted summary reading.
The private daily workflow publishes only data/dex-snapshot.json (AES-256-GCM).
Never upload a decryption key, credentials, private source or plaintext financial data.

Link each browser/PWA once using the separate snapshot key. It is stored as a
non-exportable CryptoKey in IndexedDB alongside the latest encrypted summary.
Reopening requires no Google login. Offline reading retains the last publication
date. Browser storage removal requires pairing again. This is not a password lock:
anyone using the linked browser can read the summary, as can malicious same-origin code.

Google consent is requested only for optional salary/deduction edits, or legacy
unpaired reading. Tokens remain in memory. Signing out of Google keeps device
reading; Forget device removes the local key and encrypted copy.
Edit requests wait for the daily writer or a manual private workflow run.
Public ciphertext may remain in Git history; key rotation cannot revoke old copies.

Configure Pages from main/root. The private repository requires DEX_SNAPSHOT_KEY,
DEX_PUBLIC_DEPLOY_KEY (SSH deploy key, write access only to this repository), and
DEX_PUBLIC_SNAPSHOT=enabled. The deploy key has no scheduled expiration.
No personal access token, GitHub App or new backend service is required.
