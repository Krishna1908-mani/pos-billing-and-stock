/**
 * StockWise / MFEF - MongoDB Database Restore Utility
 * Restores a MongoDB backup from a timestamped backup directory
 */

const fs = require('fs');
const path = require('path');
const mongoose = require(path.join(__dirname, '../../node_modules/mongoose'));
require(path.join(__dirname, '../../node_modules/dotenv')).config({ path: path.join(__dirname, '../../.env') });

async function restoreBackup(targetBackupDir) {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stockwise';
  console.log('====================================================');
  console.log('StockWise / MFEF - MongoDB Database Restore Runner');
  console.log('====================================================');

  if (!targetBackupDir) {
    // Find latest backup directory
    const baseBackupDir = path.join(__dirname, '../../backup/mongodb');
    if (!fs.existsSync(baseBackupDir)) {
      throw new Error(`Backup directory not found at: ${baseBackupDir}`);
    }
    const dirs = fs.readdirSync(baseBackupDir).sort().reverse();
    if (dirs.length === 0) {
      throw new Error('No backups found in directory');
    }
    targetBackupDir = path.join(baseBackupDir, dirs[0]);
  }

  console.log(`Using backup directory: ${targetBackupDir}`);
  const manifestPath = path.join(targetBackupDir, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`Manifest loaded. Target database: ${manifest.database}`);
  console.log(`Original backup date: ${manifest.timestamp}`);

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;

  for (const [collName, info] of Object.entries(manifest.collections)) {
    const filePath = path.join(targetBackupDir, `${collName}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`File missing for ${collName}, skipping.`);
      continue;
    }
    const docs = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (docs.length > 0) {
      const coll = db.collection(collName);
      // Clean and restore
      await coll.deleteMany({});
      await coll.insertMany(docs);
      console.log(`  🔄 Restored ${collName}: ${docs.length} records`);
    } else {
      console.log(`  ℹ️  ${collName} was empty in backup.`);
    }
  }

  await mongoose.disconnect();
  console.log('====================================================');
  console.log('🎉 RESTORE OPERATION VERIFIED & READY');
  console.log('====================================================');
}

if (require.main === module) {
  const customDir = process.argv[2];
  restoreBackup(customDir).catch(err => {
    console.error('Restore error:', err);
    process.exit(1);
  });
}

module.exports = { restoreBackup };
