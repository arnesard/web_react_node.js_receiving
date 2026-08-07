// src/utils/concurrency.js
// Jalanin `mapper` ke tiap item di `items`, maksimal `limit` request
// bersamaan — biar gak nembak puluhan/ratusan request ke server luar
// (Cross Docking, dsb) sekaligus dan bikin dia keteteran/nge-rate-limit
// kita. Dipake bareng oleh CrossDockingController (enrich bc_collie) dan
// KarawangController (target/dashboard live dari Cross Docking).
async function mapWithConcurrency(items, limit, mapper) {
  const results = new Array(items.length);
  let nextIndex = 0;
  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await mapper(items[current], current);
    }
  }
  const workerCount = Math.min(limit, items.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

module.exports = { mapWithConcurrency };
