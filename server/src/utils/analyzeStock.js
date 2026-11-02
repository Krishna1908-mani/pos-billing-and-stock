const mongoose = require(require('path').join(__dirname, '../../node_modules/mongoose'));
const uri = 'mongodb://127.0.0.1:27017/stockwise';

async function main() {
  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const products = await db.collection('products').find({}).toArray();
  const movements = await db.collection('stockmovements').find({}).toArray();

  console.log('Total Products:', products.length);
  console.log('Total Movements:', movements.length);

  const typeCounts = {};
  movements.forEach(m => {
    typeCounts[m.movementType] = (typeCounts[m.movementType] || 0) + 1;
  });
  console.log('\nMovement types distribution:', typeCounts);

  console.log('\nProduct vs Movement Sum Analysis:');
  console.log('-----------------------------------------------------------------------------------------------------');
  console.log('SKU          | Name                      | CurStock | MoveSum | Diff | MoveCount | HasOpeningMovement');
  console.log('-----------------------------------------------------------------------------------------------------');
  let totalDiscrepancy = 0;
  for (const p of products) {
    const pMoves = movements.filter(m => m.product.toString() === p._id.toString());
    const sumDelta = pMoves.reduce((acc, m) => acc + (Number(m.quantityChanged) || 0), 0);
    const hasOpening = pMoves.some(m => m.movementType === 'OPENING_STOCK');
    const diff = p.stockQuantity - sumDelta;
    totalDiscrepancy += Math.abs(diff);
    console.log(
      `${p.sku.padEnd(12)} | ${p.name.slice(0, 25).padEnd(25)} | ${String(p.stockQuantity).padStart(8)} | ${String(sumDelta).padStart(7)} | ${String(diff).padStart(4)} | ${String(pMoves.length).padStart(9)} | ${hasOpening}`
    );
  }
  console.log('-----------------------------------------------------------------------------------------------------');
  console.log('Total absolute discrepancy across all products:', totalDiscrepancy);
  await mongoose.disconnect();
}

main().catch(console.error);
