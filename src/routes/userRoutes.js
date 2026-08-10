const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const userController = require('../controllers/userController');

router.get('/profile', auth, userController.getProfile);
router.put('/profile', auth, userController.updateProfile);
router.put('/change-password', auth, userController.changePassword);
router.get('/referrals', auth, userController.getMyReferrals); // NEW
router.put('/update-email', auth, userController.updateEmail);
router.get('/withdraw-accounts', auth, userController.getWithdrawAccounts);
router.post('/withdraw-accounts', auth, userController.saveWithdrawAccount);

module.exports = router;