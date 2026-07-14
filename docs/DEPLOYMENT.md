# Self-Hosted Deployment Guide

This document lists requirements and steps to run Translation Bot fully local and offline.

## System Prerequisites

- **OS**: Windows, Linux, or macOS.
- **Node.js**: v18.0.0 or higher.
- **Python**: v3.10 or higher.
- **MongoDB**: v5.0+ running locally.
- **Dependencies**: LibreTranslate local server and Piper voice model binaries installed.

## Environment Configuration (`.env`)

```ini
# Database
MONGO_URI=mongodb://localhost:27017/translation_bot

# Services Urls
LIBRETRANSLATE_URL=http://localhost:5000
PIPER_MODEL_PATH=models/en-us

# Security
JWT_SECRET=super-secure-local-secret-key-phrase
ADMIN_JWT_SECRET=another-super-secure-admin-secret
```

## Running the Servers Locally

### 1. Launch MongoDB & AI Services
Ensure local MongoDB, LibreTranslate, and Piper services are active.

### 2. Launch Backend Server
```powershell
cd backend
pip install -r requirements.txt
uvicorn app.main:app --port 8000 --reload
```

### 3. Launch Admin Backend
```powershell
cd admin-backend
pip install -r requirements.txt
uvicorn app.main:app --port 8888 --reload
```

### 4. Build and Run Client Frontend
```powershell
cd frontend
npm install
npm run dev
```
