import express from 'express';
import AppController from '../controllers/AppController';
import UsersController from '../controllers/UsersController';
import AuthController from '../controllers/AuthController';

const router = express.Router();

// GET requests
router.get('/status', AppController.getStatus);
router.get('/stats', AppController.getStats);
router.get('/connect', AuthController.getConnect);
router.get('disconnect', AuthController.getDisconnect);

// POST requests
router.post('/users', UsersController.postNew);
router.post('/users/me', UsersController.getMe);

module.exports = router;
