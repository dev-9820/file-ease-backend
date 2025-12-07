# Secure Drive Backend

## Overview
Backend for a secure file-sharing app using Node/Express and MongoDB (GridFS). Features:
- User signup/login (JWT)
- Bulk file upload with validation (GridFS)
- File metadata listing
- Sharing: per-user permissions and shareable links (account-only)
- Link & permission expiry (TTL)
- Owner-only revoke/delete

## Setup
1. Install dependencies:
   npm install
2. Paste the Respective `.env` files in the folders.
3. Start server:
   npm run dev

## How expiry is defined
- Permission and ShareLink documents accept `expiresAt`.
- TTL indexes delete expired permission/link documents automatically.
- Authorization checks read existing Permission/ShareLink documents; if expired (deleted), access is denied.

## Handling unordered events & malformed events
- This backend is synchronous for file operations. For events (if using notifications), store event timestamps and deduplicate by unique event id to handle unordered delivery.
- Malformed requests are validated by schema checks and multer fileFilter; endpoints return 4xx for input validation failures.
