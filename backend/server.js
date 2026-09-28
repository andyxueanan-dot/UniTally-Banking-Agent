const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();
const { createFileStore } = require('./sandbox/store');
const { TuitionSandboxService } = require('./sandbox/service');
const createTuitionRouter = require('./routes/tuition');

const app = express();

// Middleware
app.use(cors({
  origin: ['http://localhost:8080', 'http://localhost:8081', 'http://127.0.0.1:8080', 'http://127.0.0.1:8081'],
  credentials: true
}));
app.use(express.json());

// Request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// In-memory database
const db = {
  users: []
};

// Pass db to routes
app.use('/api/auth', (req, res, next) => {
  req.db = db;
  next();
}, require('./routes/auth'));

const sandboxStore = createFileStore(
  process.env.TUITION_SANDBOX_DATA_PATH || path.join(__dirname, 'data', 'tuition-sandbox.json')
);
const tuitionService = new TuitionSandboxService({ store: sandboxStore });
app.use('/api/tuition', createTuitionRouter(tuitionService));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'unitally-local-sandbox' });
});

// Start server
const PORT = process.env.PORT || 5000;
if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`Server running on http://127.0.0.1:${PORT}`);
    console.log(`Tuition sandbox state: ${sandboxStore.filePath}`);
  });
}

module.exports = { app, tuitionService };
