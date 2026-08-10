const API_BASE = 'http://localhost:5000/api';

// Admin APIs
export const ADMIN_API = {
  login: `${API_BASE}/admin/login`,
  dashboard: `${API_BASE}/admin/dashboard`,
  users: `${API_BASE}/admin/users`,
  deposits: `${API_BASE}/admin/deposits`,
  withdrawals: `${API_BASE}/admin/withdrawals`,
  gameSettings: `${API_BASE}/admin/game-settings`,
  giftCodes: `${API_BASE}/admin/gift-codes`,
  bonuses: `${API_BASE}/admin/bonuses`,
};