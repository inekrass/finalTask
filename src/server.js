const express = require('express');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

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
app.enable('strict routing');
const pool = require('./db');

function validRunId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(value);
}

function taskJson(row) {
  return {
    id: row.id,
    ownerLogin: row.owner_login,
    title: row.title,
    done: row.done,
    runId: row.run_id,
    createdAt: row.created_at.toISOString(),
  };
}

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

app.post('/api/tasks/', express.json(), async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      Object.keys(body).length !== 2 ||
      !Object.hasOwn(body, 'title') || !Object.hasOwn(body, 'runId') ||
      typeof body.title !== 'string' || !validRunId(body.runId)) {
    return res.status(400).json({ error: 'Expected only title and valid runId' });
  }
  const title = body.title.trim();
  if (Array.from(title).length < 1 || Array.from(title).length > 200) {
    return res.status(400).json({ error: 'title must contain 1–200 characters after trim' });
  }

  try {
    const result = await pool.query(
      `INSERT INTO tasks (id, owner_login, title, done, run_id)
       VALUES ($1, $2, $3, FALSE, $4)
       RETURNING id, owner_login, title, done, run_id, created_at`,
      [randomUUID(), login, title, body.runId],
    );
    res.status(201).json(taskJson(result.rows[0]));
  } catch {
    res.status(503).json({ error: 'Database unavailable' });
  }
});

app.get('/api/tasks/', async (req, res) => {
  if (!validRunId(req.query.runId)) {
    return res.status(400).json({ error: 'Valid runId is required' });
  }
  try {
    const result = await pool.query(
      `SELECT id, owner_login, title, done, run_id, created_at
       FROM tasks WHERE run_id = $1 AND owner_login = $2
       ORDER BY created_at, id`,
      [req.query.runId, login],
    );
    res.json(result.rows.map(taskJson));
  } catch {
    res.status(503).json({ error: 'Database unavailable' });
  }
});

function requireTaskId(req, res, next) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(req.params.id)) {
    return res.status(400).json({ error: 'Invalid task UUID' });
  }
  next();
}

app.get('/api/tasks/:id/', requireTaskId, async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, owner_login, title, done, run_id, created_at
       FROM tasks WHERE id = $1 AND owner_login = $2`,
      [req.params.id, login],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(taskJson(result.rows[0]));
  } catch {
    res.status(503).json({ error: 'Database unavailable' });
  }
});

app.patch('/api/tasks/:id/', requireTaskId, express.json(), async (req, res) => {
  const body = req.body;
  if (!body || typeof body !== 'object' || Array.isArray(body) ||
      !Object.keys(body).length || Object.keys(body).some((key) => key !== 'title' && key !== 'done')) {
    return res.status(400).json({ error: 'Expected title and/or done only' });
  }
  const hasTitle = Object.hasOwn(body, 'title');
  const hasDone = Object.hasOwn(body, 'done');
  if (hasTitle && (typeof body.title !== 'string' ||
      Array.from(body.title.trim()).length < 1 || Array.from(body.title.trim()).length > 200)) {
    return res.status(400).json({ error: 'title must contain 1–200 characters after trim' });
  }
  if (hasDone && typeof body.done !== 'boolean') {
    return res.status(400).json({ error: 'done must be boolean' });
  }
  try {
    const result = await pool.query(
      `UPDATE tasks
       SET title = COALESCE($3::varchar, title), done = COALESCE($4::boolean, done)
       WHERE id = $1 AND owner_login = $2
       RETURNING id, owner_login, title, done, run_id, created_at`,
      [req.params.id, login, hasTitle ? body.title.trim() : null, hasDone ? body.done : null],
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Task not found' });
    res.json(taskJson(result.rows[0]));
  } catch {
    res.status(503).json({ error: 'Database unavailable' });
  }
});

app.delete('/api/tasks/:id/', requireTaskId, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM tasks WHERE id = $1 AND owner_login = $2',
      [req.params.id, login],
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Task not found' });
    res.status(204).end();
  } catch {
    res.status(503).json({ error: 'Database unavailable' });
  }
});

// Register future API routes above this final API fallback.
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

app.use('/api', (error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status >= 400 && error.status < 500 ? 400 : 500;
  res.status(status).json({ error: status === 400 ? 'Invalid JSON request' : 'Internal server error' });
});

app.use(express.static(path.join(__dirname, '..', 'public')));

module.exports = app;

if (require.main === module) {
  app.listen(process.env.PORT || 3000);
}
