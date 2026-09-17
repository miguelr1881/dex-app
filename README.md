# DEX Web

Public interface only. Financial data stays in private Google Sheets.
Google OAuth web client and Sheets file ID are entered in the browser, not in this repository.
No financial data or access tokens are cached. Reading is the default; optional Sheets write consent enables salary/deduction requests when the private backend is activated. Requests wait for the hourly runner and may be rejected on revision conflicts. Financial providers remain read-only.
