const axios = require('axios');
const crypto = require('crypto');
require('dotenv').config();

const {
  SF_CLIENT_ID,
  SF_CLIENT_SECRET,
  SF_CALLBACK_URL,
  SF_LOGIN_URL,
} = process.env;

const API_VERSION = 'v60.0';

function generateCodeVerifier() {
  return crypto.randomBytes(32).toString('base64url');
}

function generateCodeChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

function buildAuthorizeUrl(state) {
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SF_CLIENT_ID,
    redirect_uri: SF_CALLBACK_URL,
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
  });

  return {
    url: `${SF_LOGIN_URL}/services/oauth2/authorize?${params.toString()}`,
    codeVerifier,
  };
}

async function exchangeCodeForToken(code, codeVerifier) {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: SF_CLIENT_ID,
    client_secret: SF_CLIENT_SECRET,
    redirect_uri: SF_CALLBACK_URL,
    code_verifier: codeVerifier,
  });

  const response = await axios.post(
    `${SF_LOGIN_URL}/services/oauth2/token`,
    params.toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
  );

  return response.data;
}

async function fetchAccountValidationRules({ instanceUrl, accessToken }) {
  const soql = `
    SELECT Id, ValidationName, Active, ErrorMessage, Description
    FROM ValidationRule
    WHERE EntityDefinition.QualifiedApiName = 'Account'
    ORDER BY ValidationName
  `.replace(/\s+/g, ' ').trim();

  const url = `${instanceUrl}/services/data/${API_VERSION}/tooling/query/?q=${encodeURIComponent(soql)}`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return response.data.records.map((r) => ({
    id: r.Id,
    name: r.ValidationName,
    active: r.Active,
    errorMessage: r.ErrorMessage,
    description: r.Description,
  }));
}

async function getValidationRuleMetadata({ instanceUrl, accessToken, ruleId }) {
  const url = `${instanceUrl}/services/data/${API_VERSION}/tooling/sobjects/ValidationRule/${ruleId}`;

  const response = await axios.get(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  return response.data.Metadata;
}

async function setValidationRuleActive({ instanceUrl, accessToken, ruleId, active }) {
  const currentMetadata = await getValidationRuleMetadata({ instanceUrl, accessToken, ruleId });

  const url = `${instanceUrl}/services/data/${API_VERSION}/tooling/sobjects/ValidationRule/${ruleId}`;

  await axios.patch(
    url,
    {
      Metadata: {
        ...currentMetadata,
        active,
      },
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );
}

module.exports = {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchAccountValidationRules,
  setValidationRuleActive,
};
