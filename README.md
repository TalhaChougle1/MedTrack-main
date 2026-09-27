# MedTrack Pharmacy Management System 🏥

A modern, full-stack pharmacy inventory, expiry compliance, barcode scanner, and audit management application built with **Next.js**, **React 19**, **Drizzle ORM**, and **Turso / LibSQL (SQLite)**.

---

## 🔑 Default Login Credentials

Upon database initialization or seeding, the following default accounts are created:

| Role | Email | Password | Access Rights |
| :--- | :--- | :--- | :--- |
| **Pharmacy Owner (Admin)** | `admin@medtrack.com` | `admin123` | Full administrative access, audit trail export, system settings |
| **Lead Pharmacist (Staff)** | `pharmacist@medtrack.com` | `pharmacist123` | Inventory management, sales, barcode scan stock-in |

---

## ⚡ Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

### 3. Initialize & Seed Database
Run the database seed CLI script to initialize schema and populate sample medicines, inventory batches, and default user accounts:
```bash
npm run db:seed
```

### 4. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## ☁️ Option B: Turso Cloud DB Setup Guide

MedTrack natively supports **Turso Cloud DB** (LibSQL), allowing cloud-hosted, multi-device, and serverless synchronization.

### Step 1: Create a Turso Cloud Database
1. Sign up or log in at [https://turso.tech](https://turso.tech) (or install the [Turso CLI](https://docs.turso.tech/cli/introduction)).
2. Create a new database:
   ```bash
   turso db create medtrack-db
   ```

### Step 2: Get Your Database URL & Auth Token
1. Get Database URL:
   ```bash
   turso db show medtrack-db --url
   # Output: libsql://medtrack-db-yourusername.turso.io
   ```
2. Generate Database Auth Token:
   ```bash
   turso db tokens create medtrack-db
   # Output: eyJhbGciOi...
   ```

### Step 3: Configure `.env.local`
In `.env.local`, set:
```env
DATABASE_URL=libsql://medtrack-db-yourusername.turso.io
DATABASE_AUTH_TOKEN=eyJhbGciOi...
```

### Step 4: Seed Turso Cloud DB
Run the seed command to push tables and initial pharmacy records directly to your Turso Cloud database:
```bash
npm run db:seed
```

---

## 📂 Option A: Local SQLite File (Zero Config Fallback)

If `DATABASE_URL` is omitted, MedTrack automatically falls back to an embedded SQLite database stored locally in `medtrack.db`.

---

## 🚀 Deploying to Vercel

1. Push your repository to GitHub.
2. Import the project into Vercel.
3. In Environment Variables, add:
   - `NEXTAUTH_URL`: `https://your-app.vercel.app`
   - `NEXTAUTH_SECRET`: your secret key
   - `DATABASE_URL`: `libsql://medtrack-db-yourusername.turso.io`
   - `DATABASE_AUTH_TOKEN`: `eyJhbGciOi...`
4. Deploy!

---

## 📋 Available Commands

- `npm run dev` — Start development server
- `npm run build` — Build production application
- `npm run start` — Run production server
- `npm run db:seed` — Initialize schema & seed default data
- `npm run lint` — Run ESLint check
