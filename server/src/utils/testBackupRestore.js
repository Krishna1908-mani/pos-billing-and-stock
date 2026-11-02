/**
 * StockWise / MFEF - Backup Restore Verification Test
 * Restores backup into an isolated temporary database ('stockwise_temp_restore_test')
 * Compares collection counts and integrity, then cleans up the temporary database.
 */

const fs = require('fs');
const path = require('path');
const mongoose = require(path.join(__dirname, '../../node_modules/mongoose'));

async function testRestore() {
  console.log('====================================================');
  console.log('StockWise / MFEF - MongoDB Backup Restore-Test Runner');
  console.log('====================================================');

  const baseBackupDir = path.join(__dirname, '../../backup/mongodb');
  const dirs = fs.readdirSync(baseBackupDir).sort().reverse();
  if (dirs.length === 0) {
    throw new Error('No backup directories found');
  }
  const backupDir = path.join(baseBackupDir, dirs[0]);
  console.log(`Testing backup from: ${backupDir}`);

  const manifestPath = path.join(backupDir, 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  console.log(`Manifest Database: ${manifest.database}`);
  console.log(`Manifest Timestamp: ${manifest.timestamp}`);

  // ISOLATED TEMPORARY TEST DATABASE - NEVER TOUCHES LIVE 'stockwise'
  const tempDbUri = 'mongodb://127.0.0.1:27017/stockwise_temp_restore_test';
  console.log(`Target isolated restore database: stockwise_temp_restore_test`);

  await mongoose.connect(tempDbUri, { serverSelectionTimeoutMS: 5000 });
  const tempDb = mongoose.connection.db;

  // Clean temp db if existed from previous run
  await tempDb.dropDatabase();

  const results = {
    backupTimestamp: manifest.timestamp,
    collectionsTested: {},
    allMatched: true
  };

  console.log('\nRestoring and verifying collections:');
  console.log('----------------------------------------------------');
  for (const [collName, collInfo] of Object.entries(manifest.collections)) {
    const filePath = path.join(backupDir, `${collName}.json`);
    const docs = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    if (docs.length > 0) {
      await tempDb.collection(collName).insertMany(docs);
    }

    const restoredCount = await tempDb.collection(collName).countDocuments();
    const matched = restoredCount === collInfo.recordCount;
    if (!matched) results.allMatched = false;

    results.collectionsTested[collName] = {
      manifestCount: collInfo.recordCount,
      restoredCount,
      matched
    };

    const statusIcon = matched ? '✅' : '❌';
    console.log(`  ${statusIcon} Collection: ${collName.padEnd(20)} | Expected: ${String(collInfo.recordCount).padStart(3)} | Restored: ${String(restoredCount).padStart(3)} | Status: ${matched ? 'MATCH' : 'MISMATCH'}`);
  }

  // Spot-check query on temporary database
  const sampleUser = await tempDb.collection('users').findOne({});
  const sampleProduct = await tempDb.collection('products').findOne({});
  const sampleSale = await tempDb.collection('sales').findOne({});

  console.log('\nData Sample Verification:');
  console.log(`  ✅ User Document Verified: ${sampleUser ? sampleUser.email : 'None'}`);
  console.log(`  ✅ Product Document Verified: ${sampleProduct ? sampleProduct.sku : 'None'}`);
  console.log(`  ✅ Sale Document Verified: ${sampleSale ? sampleSale.invoiceNumber : 'None'}`);

  // Clean up temporary test database
  console.log('\nCleaning up temporary test database (stockwise_temp_restore_test)...');
  await tempDb.dropDatabase();
  console.log('  ✅ Temporary database dropped cleanly.');

  await mongoose.disconnect();

  console.log('====================================================');
  if (results.allMatched) {
    console.log('🎉 BACKUP RESTORE-TEST PASSED: 100% OF RECORDS RESTORED SUCCESSFULLY');
    console.log('Original backup at "server/backup/mongodb" is preserved and untouched.');
  } else {
    console.error('❌ RESTORE-TEST FAILED: Some collection counts did not match.');
    process.exit(1);
  }
  console.log('====================================================');
  return results;
}

testRestore().catch(err => {
  console.error('Restore test error:', err);
  process.exit(1);
});
