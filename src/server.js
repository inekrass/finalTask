const express = require('express');
const path = require('node:path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const requiredVariables = ['MOODLE_LOGIN', 'MOODLE_FULL_NAME', 'API_TOKEN'];
const missingVariables = requiredVariables.filter((name) => !process.env[name]?.trim());
if (missingVariables.length) {
  throw new Error(`Отсутствует обязательная конфигурация: ${missingVariables.join(', ')}.`);
}

const login = process.env.MOODLE_LOGIN;
const fullName = process.env.MOODLE_FULL_NAME;
const apiToken = process.env.API_TOKEN;
if (!/^[A-Za-z0-9\-._~+/]+=*$/.test(apiToken)) {
  throw new Error('API_TOKEN должен содержать допустимый Bearer-токен без пробелов.');
}

const app = express();

function requireAuthorization(req, res, next) {
  const match = /^Bearer ([A-Za-z0-9\-._~+/]+=*)$/i.exec(req.get('Authorization') || '');
  if (!match || match[1] !== apiToken) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
}

app.get('/login/', (req, res) => {
  res.type('text/plain').send(login);
});

app.use('/api', requireAuthorization);

app.get('/api/author/', (req, res) => {
  res.json({ login, fullName });
});

// Register future API routes above this final API fallback.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

module.exports = app;

if (require.main === module) {
  app.listen(process.env.PORT || 3000);
}
