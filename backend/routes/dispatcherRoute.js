import express from 'express';
import {
  getQueue,
  getDriverQueueEntry,
  joinDriverQueue,
  assignQueuedDriver,
  autoAssignDriver,
  removeFromQueue,
  markOnTrip,
  markAvailable,
  getDispatcherConfig,
  updateDispatcherConfig,
  getDispatchLogs,
  getDispatcherStats,
  getQueueSessions,
} from '../Controllers/dispatcherController.js';
import { protect } from '../auth/auth.js';

const router = express.Router();

// ── Queue ──────────────────────────────────────────────────────
router.get('/queue',                             getQueue);
router.get('/queue/sessions',                   protect, getQueueSessions);
router.get('/queue/driver/:driverId',           protect, getDriverQueueEntry);
router.post('/queue/join',                      protect, joinDriverQueue);
router.put('/queue/auto-assign',                protect, autoAssignDriver);
router.put('/queue/:id/assign',                 protect, assignQueuedDriver);
router.put('/queue/driver/:driverId/on-trip',   protect, markOnTrip);
router.put('/queue/driver/:driverId/available', protect, markAvailable);
router.delete('/queue/:id',                     protect, removeFromQueue);

// ── Config ─────────────────────────────────────────────────────
router.get('/config', protect, getDispatcherConfig);
router.put('/config', protect, updateDispatcherConfig);

// ── Logs & Stats ───────────────────────────────────────────────
router.get('/logs',  protect, getDispatchLogs);
router.get('/stats', protect, getDispatcherStats);

export default router;