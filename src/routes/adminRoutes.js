const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { admin } = require('../middleware/admin');
const adminController = require('../controllers/adminController');
const adminAuthController = require('../controllers/adminAuthController');

// Admin Auth
router.post('/login', adminAuthController.adminLogin);

// Dashboard Stats
router.get('/dashboard', auth, admin, adminController.getDashboardStats);

// Users Management
router.get('/users', auth, admin, adminController.getAllUsers);
router.get('/users/:userId', auth, admin, adminController.getUserById);
router.put('/users/:userId', auth, admin, adminController.updateUser);
router.delete('/users/:userId', auth, admin, adminController.deleteUser);

// Wagering / turnover requirement (withdrawal gate) — "need to bet before withdraw"
router.get('/users/:userId/wagering', auth, admin, adminController.getWagering);
router.put('/users/:userId/wagering', auth, admin, adminController.updateWagering);

// Deposits (for admin panel)
router.get('/deposits', auth, admin, adminController.getAllDeposits);
router.put('/deposits/:depositId/approve', auth, admin, adminController.approveDepositAdmin);
router.put('/deposits/:depositId/reject', auth, admin, adminController.rejectDepositAdmin);
router.post('/deposits/bulk-approve', auth, admin, adminController.bulkApproveDeposits);

// Withdrawals (for admin panel)
router.get('/withdrawals', auth, admin, adminController.getAllWithdrawals);
router.put('/withdrawals/:withdrawId/approve', auth, admin, adminController.approveWithdrawAdmin);
router.put('/withdrawals/:withdrawId/reject', auth, admin, adminController.rejectWithdrawAdmin);

// Game Settings
router.get('/game-settings', auth, admin, adminController.getGameSettings);
router.put('/game-settings/:gameName', auth, admin, adminController.updateGameSettings);

// Gift Codes
router.get('/gift-codes', auth, admin, adminController.getAllGiftCodes);
router.post('/gift-codes', auth, admin, adminController.createGiftCode);
router.put('/gift-codes/:code/toggle-claim', auth, admin, adminController.toggleGiftClaim);
router.delete('/gift-codes/:code', auth, admin, adminController.deleteGiftCode);

// Bonuses
router.get('/bonuses', auth, admin, adminController.getAllBonuses);
router.put('/bonuses/:key', auth, admin, adminController.updateBonus);

router.get('/users/lookup/:id', auth, admin, adminController.lookupUserById);
router.post('/users/give-points', auth, admin, adminController.givePointsToUser);

module.exports = router;