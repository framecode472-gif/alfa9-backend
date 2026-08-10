const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('../models/User');

const ADMIN_EMAIL = 'admin@alfa9.com';
const ADMIN_PASSWORD = 'Admin@123';
const ADMIN_NAME = 'Alfa9 Admin';

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  let user = await User.findOne({ email: ADMIN_EMAIL });
  const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, 10);

  if (user) {
    user.password = hashedPassword;
    user.role = 'admin';
    await user.save();
    console.log('Existing user updated to admin:', ADMIN_EMAIL);
  } else {
    user = await User.create({
      name: ADMIN_NAME,
      email: ADMIN_EMAIL,
      password: hashedPassword,
      role: 'admin',
    });
    console.log('New admin user created:', ADMIN_EMAIL);
  }

  console.log('\nLogin with:');
  console.log('Email:', ADMIN_EMAIL);
  console.log('Password:', ADMIN_PASSWORD);

  await mongoose.disconnect();
  process.exit(0);
}

run().catch((err) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});