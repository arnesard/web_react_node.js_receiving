// src/controllers/barcode/BarcodeTracerController.js
// Modul "Barcode Tracer" — cari 1 barcode (Collie atau Pcs), balikin
// riwayat mutasi (timeline) lintas Plant & DC Karawang, lengkap deskripsi
// item, No. DN/Customer tujuan, dan nama operator.
const BarcodeTracerModel = require("../../models/barcode/BarcodeTracerModel");
const response = require("../../utils/response");

class BarcodeTracerController {
  // GET /api/barcode-tracer/search?barcode=xxxx
  async searchBarcode(req, res) {
    const { barcode } = req.query;

    if (!barcode || !String(barcode).trim()) {
      return response.error(res, "Barcode wajib diisi!", 400);
    }

    const cleanBarcode = String(barcode).trim();

    try {
      // 1. Cari semua barcode Pcs yang terlibat (baik input Collie maupun Pcs)
      const targetPcsArray =
        await BarcodeTracerModel.findRelatedPcsBarcodes(cleanBarcode);

      // 2. Tarik riwayat timeline dari kedua sumber (Plant & DC Karawang)
      const [resultPlant, resultKarawang] = await Promise.all([
        BarcodeTracerModel.searchTimelinePlant(targetPcsArray),
        BarcodeTracerModel.searchTimelineKarawang(targetPcsArray),
      ]);

      const rawCombinedResults = [...resultPlant, ...resultKarawang];

      if (rawCombinedResults.length === 0) {
        return response.success(res, { total: 0, data: [] });
      }

      // Dedup ketat (rack_bc_entried + scantime + loc_to)
      const uniqueMap = new Map();
      rawCombinedResults.forEach((row) => {
        const key = `${row.rack_bc_entried}_${row.scantime}_${row.loc_to}`;
        if (!uniqueMap.has(key)) uniqueMap.set(key, row);
      });
      const combinedResults = Array.from(uniqueMap.values());

      // 3. Deskripsi item unik
      const uniqueItems = [
        ...new Set(combinedResults.map((row) => row.item).filter(Boolean)),
      ];
      const itemDescMap =
        await BarcodeTracerModel.getItemDescriptions(uniqueItems);

      // 4. No. DN, Customer, dan Nama Operator
      const uniqueBarcodes = [
        ...new Set(
          combinedResults.map((row) => row.rack_bc_entried).filter(Boolean),
        ),
      ];
      const uniquePics = [
        ...new Set(
          combinedResults
            .map((row) => String(row.pic || "").trim())
            .filter(Boolean),
        ),
      ];

      const [doScanMap, operatorMap] = await Promise.all([
        BarcodeTracerModel.getDoScanInfo(uniqueBarcodes),
        BarcodeTracerModel.getOperatorInfo(uniquePics),
      ]);

      // 5. Mapping final
      const finalData = combinedResults.map((row) => {
        let doNumber = "-";
        let customerName = "-";
        let customerCity = "-";
        let doOperator = "-";

        const scanData = doScanMap[row.rack_bc_entried];
        if (scanData) {
          doNumber = scanData.do_number;
          customerName = scanData.cust_name;
          customerCity = scanData.cust_city;
          doOperator = scanData.operator;
        }

        const cleanPic = String(row.pic || "").trim();
        const oprData = operatorMap[cleanPic] || { nama: "-", plant_opr: "-" };

        return {
          ...row,
          description: itemDescMap[row.item] || "-",
          do_number: doNumber,
          customer: customerName,
          customer_city: customerCity,
          do_operator: doOperator,
          nama: oprData.nama,
          plant_opr: oprData.plant_opr,
        };
      });

      return response.success(res, {
        total: finalData.length,
        data: finalData,
      });
    } catch (error) {
      console.error("BarcodeTracerController.searchBarcode gagal:", error);
      return response.error(
        res,
        "Terjadi kesalahan pada server saat mencari barcode. " +
          error.message,
      );
    }
  }
}

module.exports = new BarcodeTracerController();
