# DEX Web

Build: 0.9.0-plan14. GitHub Pages interface with optional encrypted summary reading.
The private daily workflow publishes only data/dex-snapshot.json (AES-256-GCM).
Never upload a decryption key, credentials, private source or plaintext financial data.

Link each browser/PWA once using the separate snapshot key. It is stored as a
non-exportable CryptoKey in IndexedDB alongside the latest encrypted summary.
Reopening requires no Google login. Offline reading retains the last publication
date. Browser storage removal requires pairing again. This is not a password lock:
anyone using the linked browser can read the summary, as can malicious same-origin code.

Google consent is requested only for optional salary/deduction/planning edits, or legacy
unpaired reading. Tokens remain in memory. Signing out of Google keeps device
reading; Forget device removes the local key and encrypted copy.
Edit requests wait for the daily writer or a manual private workflow run.
Public ciphertext may remain in Git history; key rotation cannot revoke old copies.

Configure Pages from main/root. The private repository requires DEX_SNAPSHOT_KEY,
DEX_PUBLIC_DEPLOY_KEY (SSH deploy key, write access only to this repository), and
DEX_PUBLIC_SNAPSHOT=enabled. The deploy key has no scheduled expiration.
No personal access token, GitHub App or new backend service is required.

Institution marks belong to their respective owners; no affiliation is implied.
Official assets, retrieved 2026-09-23:
- BAC: https://www.baccredomatic.com/themes/custom/bac_theme/images/bac_logo.svg
- MultiMoney: https://nextgen-mmcr.cdn.prismic.io/nextgen-mmcr/1c7e2936-efe4-4074-904d-1dd46c451d08_LogoSmileMM.svg
- Interactive Brokers: https://www.interactivebrokers.com/images/web/favicons/home-screen-icon-192x192.png
- Binance: https://bin.bnbstatic.com/static/images/common/favicon.ico
