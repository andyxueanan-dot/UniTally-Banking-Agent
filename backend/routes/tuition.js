const express = require('express');
const { DomainError } = require('../sandbox/service');

function dollarsToCents(value, field) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || Math.abs(number * 100 - Math.round(number * 100)) > 1e-6) {
    throw new DomainError('INVALID_AMOUNT', `${field} must be a non-negative amount with at most two decimals.`);
  }
  return Math.round(number * 100);
}

function getToken(req) {
  const header = req.get('authorization') || '';
  return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function createTuitionRouter(service) {
  const router = express.Router();

  router.post('/sessions', (req, res, next) => {
    try {
      res.status(201).json(service.createSession(req.body?.label));
    } catch (error) { next(error); }
  });

  router.get('/state', (req, res, next) => {
    try {
      res.json(service.getState(getToken(req)));
    } catch (error) { next(error); }
  });

  router.post('/reset', (req, res, next) => {
    try {
      res.json(service.reset(getToken(req), {
        cnyCents: dollarsToCents(req.body?.cnyBalance ?? 10000, 'CNY balance'),
        myrCents: dollarsToCents(req.body?.myrBalance ?? 2000, 'MYR balance'),
      }));
    } catch (error) { next(error); }
  });

  router.post('/quotes', (req, res, next) => {
    try {
      res.status(201).json(service.createQuote(getToken(req), {
        recipientId: req.body?.recipientId,
        tuitionMyrCents: dollarsToCents(req.body?.tuitionMyr, 'Tuition'),
        reserveMyrCents: dollarsToCents(req.body?.reserveMyr, 'Reserve'),
        deadline: req.body?.deadline,
        quoteMode: req.body?.quoteMode,
        simulateOutcome: req.body?.simulateOutcome,
      }));
    } catch (error) { next(error); }
  });

  router.post('/confirmations', (req, res, next) => {
    try {
      res.status(201).json(service.confirm(getToken(req), req.body?.quoteId));
    } catch (error) { next(error); }
  });

  router.post('/payments', (req, res, next) => {
    try {
      res.status(201).json(service.pay(getToken(req), req.body?.confirmationId, {
        recipientId: req.body?.intent?.recipientId,
        tuitionMyrCents: dollarsToCents(req.body?.intent?.tuitionMyr, 'Tuition'),
        reserveMyrCents: dollarsToCents(req.body?.intent?.reserveMyr, 'Reserve'),
        deadline: req.body?.intent?.deadline,
      }));
    } catch (error) { next(error); }
  });

  router.get('/orders/:orderId', (req, res, next) => {
    try {
      res.json(service.getOrder(getToken(req), req.params.orderId));
    } catch (error) { next(error); }
  });

  router.get('/ai/status', (_req, res) => {
    res.json(service.getAiStatus());
  });

  router.post('/ai/plan', (_req, res) => {
    res.status(503).json({
      error: 'AI_NOT_CONFIGURED',
      message: 'No authorized model is configured. Use the auditable structured sandbox flow instead.',
    });
  });

  router.use((error, _req, res, _next) => {
    if (error instanceof DomainError) {
      return res.status(error.status).json({ error: error.code, message: error.message, details: error.details });
    }
    console.error(error);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: 'Unexpected local sandbox error.' });
  });

  return router;
}

module.exports = createTuitionRouter;
