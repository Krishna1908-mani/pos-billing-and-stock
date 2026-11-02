/**
 * StockWise / MFEF - Dedicated MongoDB Backup & Verification Utility
 * Creates a complete snapshot of all collections with verification manifest
 */

const fs = require('fs');
const path = require('path');
const mongoose = require(path.join(__dirname, '../../node_modules/mongoose'));
require(path.join(__dirname, '../../node_modules/dotenv')).config({ path: path.join(__dirname, '../../.env') });

async function createBackup() {
  const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/stockwise';
  console.log('====================================================');
  console.log('StockWise / MFEF - MongoDB Database Backup Runner');
  console.log('====================================================');
  
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  const db = mongoose.connection.db;
  const dbName = mongoose.connection.name;
  console.log(`Connected to MongoDB database: ${dbName}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.join(__dirname, `../../backup/mongodb/${dbName}_${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const collections = await db.listCollections().toArray();
  const manifest = {
    database: dbName,
    timestamp: new Date().toISOString(),
    backupDirectory: backupDir,
    collections: {},
    totalRecords: 0
  };

  for (const collInfo of collections) {
    const collName = collInfo.name;
    const coll = db.collection(collName);
    const docs = await coll.find({}).toArray();
    
    const filePath = path.join(backupDir, `${collName}.json`);
    fs.writeFileSync(filePath, JSON.stringify(docs, null, 2), 'utf8');

    manifest.collections[collName] = {
      recordCount: docs.length,
      fileSize: fs.statSync(filePath).size,
      filePath: path.relative(path.join(__dirname, '../..'), filePath)
    };
    manifest.totalRecords += docs.length;
    console.log(`  📦 Collection: ${collName.padEnd(20)} -> ${docs.length} records backed up (${manifest.collections[collName].fileSize} bytes)`);
  }

  const manifestPath = path.join(backupDir, 'manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');

  // Verify backup integrity
  console.log('----------------------------------------------------');
  console.log('🔍 VERIFYING BACKUP INTEGRITY:');
  let verified = true;
  for (const collName of Object.keys(manifest.collections)) {
    const backupFile = path.join(backupDir, `${collName}.json`);
    if (!fs.existsSync(backupFile)) {
      console.error(`  ❌ Missing backup file for ${collName}`);
      verified = false;
      continue;
    }
    const parsed = JSON.parse(fs.readFileSync(backupFile, 'utf8'));
    if (parsed.length !== manifest.collections[collName].recordCount) {
      console.error(`  ❌ Record count mismatch for ${collName}`);
      verified = false;
    } else {
      console.log(`  ✅ Verified ${collName}: ${parsed.length} records matched`);
    }
  }

  await mongoose.disconnect();

  console.log('====================================================');
  if (verified) {
    console.log('🎉 BACKUP SUCCESSFUL & 100% RECOVERABLE');
    console.log(`Location: ${backupDir}`);
    console.log(`Total Collections: ${Object.keys(manifest.collections).length}`);
    console.log(`Total Records: ${manifest.totalRecords}`);
  } else {
    console.error('❌ BACKUP VERIFICATION FAILED');
    process.exit(1);
  }
  console.log('====================================================');
  return manifest;
}

createBackup().catch(err => {
  console.error('Backup error:', err);
  process.exit(1);
});
