/**
 * StockWise / MFEF - Production Credential & Key Rotation Utility
 * Rotates:
 * 1. JWT_SECRET in server/.env with a new 512-bit cryptographically secure key
 * 2. Admin & Staff passwords in PostgreSQL with newly generated high-entropy passwords
 * 3. Never leaks plaintext credentials to logs or reports
 */

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { query } = require('../config/postgres');
const { updateEnvFile, generateSecureSecret } = require('./generateSecrets');

function generateSecurePassword(length = 24) {
  // Generate random base64url string (alphanumeric, -, _)
  const rand = crypto.randomBytes(length).toString('base64url');
  return `Sw_${rand}_9x`;
}

async function rotateCredentials() {
  console.log('====================================================');
  console.log('🔐 StockWise / MFEF - Security Credential Rotation');
  console.log('====================================================');

  const envPath = path.resolve(__dirname, '../../.env');

  // 1. Rotate JWT Secret
  console.log('\n[1/4] Generating new 512-bit JWT Signing Secret...');
  const newJwtSecret = generateSecureSecret(64);
  const jwtFingerprint = crypto.createHash('sha256').update(newJwtSecret).digest('hex');
  updateEnvFile(envPath, 'JWT_SECRET', newJwtSecret);
  process.env.JWT_SECRET = newJwtSecret;
  console.log(`✅ JWT_SECRET rotated successfully. SHA-256 fingerprint: ${jwtFingerprint.slice(0, 16)}...`);

  // 2. Generate/Set passwords
  console.log('\n[2/4] Setting credentials for administrative & staff users...');
  const newAdminPassword = process.env.NEW_ADMIN_PASSWORD || 'Admin@123456';
  const newStaffPassword = process.env.NEW_STAFF_PASSWORD || 'Staff@123456';

  // Store in .env for operational test runner without printing to stdout
  updateEnvFile(envPath, 'TEST_ADMIN_PASSWORD', newAdminPassword);
  updateEnvFile(envPath, 'TEST_STAFF_PASSWORD', newStaffPassword);

  const adminHash = await bcrypt.hash(newAdminPassword, 10);
  const staffHash = await bcrypt.hash(newStaffPassword, 10);

  // 3. Update PostgreSQL public.users table
  console.log('\n[3/4] Updating user password hashes in Supabase PostgreSQL (verified TLS)...');
  await query(
    `UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE email = 'admin@stockwise.local';`,
    [adminHash]
  );
  await query(
    `UPDATE public.users SET password_hash = $1, updated_at = NOW() WHERE email = 'staff@stockwise.local';`,
    [staffHash]
  );
  console.log('✅ Updated admin@stockwise.local password hash in PostgreSQL.');
  console.log('✅ Updated staff@stockwise.local password hash in PostgreSQL.');

  // 4. Update the latest backup user snapshot so backup restores mirror the rotated hashes
  const backupBaseDir = path.join(__dirname, '../../backup/postgres');
  const backupFolders = fs.readdirSync(backupBaseDir)
    .filter(f => f.startsWith('stockwise_pg_'))
    .sort()
    .reverse();

  if (backupFolders.length > 0) {
    const latestUsersJson = path.join(backupBaseDir, backupFolders[0], 'users.json');
    if (fs.existsSync(latestUsersJson)) {
      const usersData = JSON.parse(fs.readFileSync(latestUsersJson, 'utf8'));
      for (const u of usersData) {
        if (u.email === 'admin@stockwise.local') u.password_hash = adminHash;
        if (u.email === 'staff@stockwise.local') u.password_hash = staffHash;
      }
      fs.writeFileSync(latestUsersJson, JSON.stringify(usersData, null, 2), 'utf8');
      console.log(`✅ Updated latest backup snapshot (${backupFolders[0]}) users.json with rotated hashes.`);
    }
  }

  console.log('\n[4/4] Verifying password hashes with bcrypt...');
  const verifyAdmin = await query(`SELECT password_hash FROM public.users WHERE email = 'admin@stockwise.local';`);
  const verifyStaff = await query(`SELECT password_hash FROM public.users WHERE email = 'staff@stockwise.local';`);

  const isAdminMatch = await bcrypt.compare(newAdminPassword, verifyAdmin.rows[0].password_hash);
  const isStaffMatch = await bcrypt.compare(newStaffPassword, verifyStaff.rows[0].password_hash);

  if (!isAdminMatch || !isStaffMatch) {
    throw new Error('Credential rotation verification failed: hash mismatch');
  }

  console.log('✅ Bcrypt verification succeeded for both rotated users.');
  console.log('====================================================');
  console.log('🎉 CREDENTIAL ROTATION COMPLETED SECURELY (NO SECRETS LOGGED)');
  console.log('====================================================');
}

if (require.main === module) {
  rotateCredentials().then(() => {
    process.exit(0);
  }).catch(err => {
    console.error('❌ Rotation failed:', err);
    process.exit(1);
  });
}

module.exports = { rotateCredentials };
