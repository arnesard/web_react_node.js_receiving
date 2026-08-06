// src/repositories/ProductRepository.js
// Equivalen Repository Pattern di Laravel
// Fungsinya: pisahin logic query dari controller
// Controller ga boleh tau soal SQL — itu urusan Repository

const ProductModel = require("../models/ProductModel");

class ProductRepository {
  // Ambil semua produk
  async getAll() {
    return await ProductModel.getAll();
  }

  // Ambil by ID, lempar error kalau ga ada
  async findById(id) {
    const product = await ProductModel.findById(id);
    if (!product) {
      throw new Error(`Produk dengan ID ${id} tidak ditemukan`);
    }
    return product;
  }

  // Buat produk baru
  async create(data) {
    // Bisa tambah validasi di sini sebelum ke Model
    return await ProductModel.create(data);
  }

  // Update produk
  async update(id, data) {
    // Cek dulu ada ga
    await this.findById(id); // ← kalau ga ada, lempar error otomatis
    return await ProductModel.update(id, data);
  }

  // Hapus produk
  async delete(id) {
    await this.findById(id);
    return await ProductModel.delete(id);
  }
}

// Export sebagai instance — kayak singleton
module.exports = new ProductRepository();
