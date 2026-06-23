# Account Rule Console

Connects to a Salesforce org over OAuth 2.0, lists the Validation Rules on
the Account object using the Tooling API, and lets you toggle them on/off
and push the change back to the org.

```
sf-validation-toggle/
├── server/   Node + Express backend (OAuth, Tooling API)
└── client/   Vite + plain JS frontend
```

## Setup

### 1. Salesforce Developer Org
Sign up at https://developer.salesforce.com/signup, verify email, log in.

### 2. Validation Rules on Account
Setup → Object Manager → Account → Validation Rules → New. Create rules
like:

| Rule Name | Formula | Error Message |
|---|---|---|
| Phone_Required | `ISBLANK(Phone)` | Phone number is required |
| Website_Format | `AND(NOT(ISBLANK(Website)), NOT(REGEX(Website,"^(https?://).+")))` | Website must start with http:// or https:// |
| Industry_Required | `ISBLANK(TEXT(Industry))` | Please select an Industry |
| Annual_Revenue_Positive | `AnnualRevenue < 0` | Annual Revenue cannot be negative |
| Account_Name_Length | `LEN(Name) < 3` | Account Name must be at least 3 characters |

### 3. Connected App / External Client App
Setup → App Manager → New External Client App (or New Connected App,
depending on your org version).

- Enable OAuth Settings
- Callback URL: `http://localhost:3000/oauth/callback`
- Scopes: `api`, `refresh_token offline_access`, `full`
- Keep "Require Secret for Web Server Flow" checked
- Save, wait a few minutes, then open the app and copy the Consumer Key and
  Consumer Secret (you may need to verify your identity by email to reveal
  the secret)

Note: some orgs enforce PKCE on External Client Apps and won't let you turn
it off. This project's backend already implements PKCE alongside the
Client Secret flow, so it works either way.

### 4. Backend

```
cd server
cp .env.example .env
```

Fill in `.env`:
```
SF_CLIENT_ID=your consumer key
SF_CLIENT_SECRET=your consumer secret
SF_CALLBACK_URL=http://localhost:3000/oauth/callback
SF_LOGIN_URL=https://login.salesforce.com
SESSION_SECRET=any long random string
PORT=3000
CLIENT_URL=http://localhost:5173
```

```
npm install
npm start
```

### 5. Frontend

```
cd client
cp .env.example .env
npm install
npm run dev
```

Open http://localhost:5173, click Connect to Salesforce, log in, then Get
validation rules.

### 6. Deploy
Push to GitHub. Deploy `server/` to Render or Railway, `client/` to Vercel
or Netlify. Add the deployed backend's callback URL to the External Client
App's callback list in Salesforce.

## API

| Method | Route | Description |
|---|---|---|
| GET | /auth/login | redirects to Salesforce login |
| GET | /oauth/callback | exchanges code for token |
| POST | /auth/logout | clears session |
| GET | /api/me | current session status |
| GET | /api/validation-rules | lists Account validation rules |
| POST | /api/validation-rules/:id/toggle | sets one rule active/inactive |
| POST | /api/validation-rules/deploy | applies a batch of changes |


