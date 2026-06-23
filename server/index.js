require('dotenv').config();
const express = require('express');
const session = require('express-session');
const cors = require('cors');
const crypto = require('crypto');

const {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchAccountValidationRules,
  setValidationRuleActive,
} = require('./salesforce');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL,
    credentials: true,
  })
);
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: 'lax',
      secure: false,
      maxAge: 1000 * 60 * 60 * 2,
    },
  })
);

function requireAuth(req, res, next) {
  if (!req.session.sfToken) {
    return res.status(401).json({ error: 'Not logged in to Salesforce' });
  }
  next();
}

app.get('/auth/login', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;

  const { url, codeVerifier } = buildAuthorizeUrl(state);
  req.session.codeVerifier = codeVerifier;

  res.redirect(url);
});

app.get('/oauth/callback', async (req, res) => {
  const { code, state } = req.query;

  if (!state || state !== req.session.oauthState) {
    return res.status(403).send('State mismatch — login aborted.');
  }

  try {
    const tokenData = await exchangeCodeForToken(code, req.session.codeVerifier);
    req.session.sfToken = {
      accessToken: tokenData.access_token,
      instanceUrl: tokenData.instance_url,
    };
    req.session.sfIdentityUrl = tokenData.id;
    delete req.session.codeVerifier;

    res.redirect(`${process.env.CLIENT_URL}?loggedIn=true`);
  } catch (err) {
    console.error('OAuth callback failed:', err.response?.data || err.message);
    res.redirect(`${process.env.CLIENT_URL}?loggedIn=false`);
  }
});

app.get('/api/me', requireAuth, async (req, res) => {
  res.json({ loggedIn: true, instanceUrl: req.session.sfToken.instanceUrl });
});

app.post('/auth/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/validation-rules', requireAuth, async (req, res) => {
  try {
    const rules = await fetchAccountValidationRules(req.session.sfToken);
    res.json({ rules });
  } catch (err) {
    console.error('Fetch rules failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to fetch validation rules' });
  }
});

app.post('/api/validation-rules/:id/toggle', requireAuth, async (req, res) => {
  const { id } = req.params;
  const { active } = req.body;

  try {
    await setValidationRuleActive({
      ...req.session.sfToken,
      ruleId: id,
      active,
    });
    res.json({ ok: true, id, active });
  } catch (err) {
    console.error('Toggle failed:', err.response?.data || err.message);
    res.status(500).json({ error: 'Failed to update validation rule' });
  }
});

app.post('/api/validation-rules/deploy', requireAuth, async (req, res) => {
  const { changes } = req.body;

  if (!Array.isArray(changes) || changes.length === 0) {
    return res.status(400).json({ error: 'No changes provided' });
  }

  const results = [];
  for (const change of changes) {
    try {
      await setValidationRuleActive({
        ...req.session.sfToken,
        ruleId: change.id,
        active: change.active,
      });
      results.push({ id: change.id, ok: true });
    } catch (err) {
      console.error(`Deploy failed for rule ${change.id}:`, err.response?.data || err.message);
      results.push({ id: change.id, ok: false, error: err.response?.data?.[0]?.message || 'Unknown error' });
    }
  }

  const allOk = results.every((r) => r.ok);
  res.status(allOk ? 200 : 207).json({ results });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
