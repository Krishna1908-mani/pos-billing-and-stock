/**
 * StockWise / MFEF - Production Cryptographic Secret Generator
 * Generates high-entropy cryptographic keys for JWT_SECRET and encryption
 * without leaking raw secret strings to console logs or reports.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function generateSecureSecret(byteLength = 64) {
  return crypto.randomBytes(byteLength).toString('hex');
}

function updateEnvFile(targetEnvPath, key, value) {
  let content = '';
  if (fs.existsSync(targetEnvPath)) {
    content = fs.readFileSync(targetEnvPath, 'utf8');
  }

  const regex = new RegExp(`^${key}=.*$`, 'm');
  if (regex.test(content)) {
    content = content.replace(regex, `${key}=${value}`);
  } else {
    content += (content.endsWith('\n') ? '' : '\n') + `${key}=${value}\n`;
  }

  fs.writeFileSync(targetEnvPath, content, { encoding: 'utf8', mode: 0o600 });
}

function main() {
  const args = process.argv.slice(2);
  const writeToEnv = args.includes('--write-env');
  const envPath = path.resolve(__dirname, '../../.env');

  console.log('====================================================');
  console.log('StockWise / MFEF - Cryptographic Key Generator');
  console.log('====================================================');

  const newSecret = generateSecureSecret(64); // 512 bits of entropy
  const fingerprint = crypto.createHash('sha256').update(newSecret).digest('hex');

  console.log(`✅ Generated 512-bit Cryptographically Secure Token`);
  console.log(`- Entropy: 512 bits (64 random bytes hex-encoded)`);
  console.log(`- SHA-256 Key Fingerprint: ${fingerprint}`);
  console.log(`- Raw Secret: [REDACTED FOR LOG SAFETY]`);

  if (writeToEnv) {
    updateEnvFile(envPath, 'JWT_SECRET', newSecret);
    console.log(`✅ Secret successfully written to ${path.relative(process.cwd(), envPath)} with restricted permissions.`);
  } else {
    console.log('\n[Tip] Pass --write-env to securely write this key directly to server/.env');
    console.log('Or copy into your cloud environment manager (Render/Vercel/Railway secrets).');
  }
  console.log('====================================================');
}

if (require.main === module) {
  main();
}

module.exports = { generateSecureSecret, updateEnvFile };
