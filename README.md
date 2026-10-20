# Yardjobsja starter

Mobile-first Jamaica marketplace scaffold using Node.js, Express, Prisma, PostgreSQL, GitHub and Railway.

## Included
- Responsive landing page.
- Customer/tasker registration and login API; password hashing and HTTP-only session cookie.
- Unique account IDs (`CT-...` customers, `TK-...` taskers).
- PostgreSQL schema for tasks, offers, payment tickets, payouts, batches and admin audit logs.
- Task posting and worker offer endpoints.
- 10% commission calculation added to a tasker's requested price.
- Admin-protected payment-ticket review endpoints.
- Railway deployment configuration.

## Important: development scaffold only
Email notifications are not connected; API responses explicitly say so. The admin invitation/first-admin provisioning flow is not implemented yet, so admin endpoints cannot be used until a secure admin bootstrap is added. CIBC's official batch-file format has not been confirmed; this project does not yet generate a CIBC-approved upload file. Do not use this scaffold for live bank account storage, real payments or payouts before security review and testing.

## Local setup
Requires Node.js 20+ and PostgreSQL.
1. Copy `.env.example` to `.env`.
2. Set `DATABASE_URL` and a random `JWT_SECRET` of at least 32 characters.
3. Run `npm install`.
4. Run `npx prisma migrate dev --name initial`.
5. Run `npm run dev` and open `http://localhost:3000`.

## GitHub + Railway
Create a GitHub repository named `yardjobsja` and push these files (never commit `.env`). Connect the repository to Railway, add a PostgreSQL service, and set `DATABASE_URL` to Railway's database reference variable. Set `JWT_SECRET`, `APP_URL`, `TICKET_NOTIFICATION_EMAIL=yardjobsja@gmail.com`, and `NODE_ENV=production` in Railway Variables. The deployment start command is `npm start`.

## Next work before production
1. Secure admin setup for the approved admin email addresses, with MFA and audit logging.
2. Email provider integration for payment-ticket notifications.
3. Customer/tasker account dashboards, offer selection, customer-approved scheduling and booking states.
4. Payment verification workflow; receipts are not proof of payment.
5. Earnings ledger, disputes/holds, weekly Tuesday payout calculations, manual withdrawals (J$2,000 minimum), atomic batch locking and reconciliation.
6. Confirm CIBC Caribbean Jamaica's exact corporate bulk-payment file requirements before creating bank upload files.
7. Verification, password reset, account management, privacy safeguards, monitoring, backups, tests and legal review.
