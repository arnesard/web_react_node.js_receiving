// src/controllers/EmployeeController.js
const EmployeeModel = require("../../models/karyawan/EmployeeModel");
const response = require("../../utils/response");
const ExcelJS = require("exceljs");

class EmployeeController {
  // GET /api/employees
  async index(req, res) {
    try {
      const employees = await EmployeeModel.getAll();
      return response.success(res, employees);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/employees/export
  // Query: search, plant, group, bagian — filter sama persis kayak yang
  // lagi aktif di halaman Karyawan, jadi hasil export = apa yang lagi
  // dilihat user.
  async exportExcel(req, res) {
    try {
      const { search = "", plant = "", group = "", bagian = "" } = req.query;
      const q = search.trim().toLowerCase();

      let employees = await EmployeeModel.getAll();
      employees = employees.filter((e) => {
        const matchSearch =
          !q ||
          (e.name || "").toLowerCase().includes(q) ||
          (e.employee_id || "").toLowerCase().includes(q);
        const matchPlant = !plant || e.plant === plant;
        const matchGroup = !group || e.group === group;
        const matchBagian = !bagian || e.bagian === bagian;
        return matchSearch && matchPlant && matchGroup && matchBagian;
      });

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Karyawan");

      const columns = [
        { header: "No", key: "no", width: 6 },
        { header: "Nama Lengkap", key: "name", width: 26 },
        { header: "ID Karyawan", key: "employee_id", width: 14 },
        { header: "Plant", key: "plant", width: 10 },
        { header: "Grup", key: "group", width: 10 },
        { header: "Bagian", key: "bagian", width: 14 },
        { header: "Department", key: "department", width: 16 },
        { header: "Position", key: "position", width: 16 },
        { header: "Status", key: "default_status", width: 16 },
        { header: "Pekerjaan Utama", key: "primary_job_type", width: 20 },
        { header: "Tanggal Masuk", key: "hire_date", width: 14 },
        { header: "Telepon", key: "phone", width: 16 },
        { header: "Alamat", key: "address", width: 30 },
      ];
      ws.columns = columns;

      const headerRow = ws.getRow(1);
      headerRow.height = 20;
      headerRow.eachCell((cell) => {
        cell.font = { bold: true, size: 10, name: "Arial", color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2563EB" } };
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = {
          top: { style: "thin" },
          bottom: { style: "thin" },
          left: { style: "thin" },
          right: { style: "thin" },
        };
      });

      employees.forEach((emp, i) => {
        const row = ws.addRow({
          no: i + 1,
          name: emp.name,
          employee_id: emp.employee_id,
          plant: emp.plant,
          group: emp.group,
          bagian: emp.bagian || "-",
          department: emp.department || "-",
          position: emp.position || "-",
          default_status: emp.default_status,
          primary_job_type: emp.primary_job_type,
          hire_date: emp.hire_date ? String(emp.hire_date).split("T")[0] : "-",
          phone: emp.phone || "-",
          address: emp.address || "-",
        });
        row.eachCell((cell) => {
          cell.font = { size: 9, name: "Arial" };
          cell.alignment = { vertical: "middle" };
          cell.border = {
            top: { style: "thin", color: { argb: "FFCCCCCC" } },
            bottom: { style: "thin", color: { argb: "FFCCCCCC" } },
            left: { style: "thin", color: { argb: "FFCCCCCC" } },
            right: { style: "thin", color: { argb: "FFCCCCCC" } },
          };
        });
      });

      const parts = [
        "karyawan",
        plant || "semua-plant",
        group || "semua-grup",
        bagian || "semua-bagian",
      ];
      const filename = `${parts.join("_")}.xlsx`.replace(/\s+/g, "-");

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      await wb.xlsx.write(res);
      res.end();
    } catch (err) {
      console.error("EmployeeController.exportExcel:", err);
      return response.error(res, err.message);
    }
  }

  // POST /api/employees
  async store(req, res) {
    try {
      const {
        name,
        employee_id,
        plant,
        group,
        department,
        position,
        default_status,
        primary_job_type,
        phone,
        address,
        hire_date,
      } = req.body;

      // Validasi required — equivalen $request->validate() di Laravel
      if (
        !name ||
        !employee_id ||
        !plant ||
        !group ||
        !department ||
        !position ||
        !default_status ||
        !primary_job_type ||
        !hire_date
      ) {
        return response.error(res, "Semua field wajib diisi", 422);
      }

      // Cek duplicate employee_id
      const isDuplicate =
        await EmployeeModel.checkDuplicateEmployeeId(employee_id);
      if (isDuplicate) {
        return response.error(res, "ID Karyawan sudah digunakan", 422);
      }

      const data = await EmployeeModel.create(req.body);
      return response.success(res, data, "Karyawan berhasil ditambahkan", 201);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // GET /api/employees/:id
  async show(req, res) {
    try {
      const employee = await EmployeeModel.findByPk(req.params.id);
      if (!employee) return response.notFound(res, "Karyawan tidak ditemukan");
      return response.success(res, employee);
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // PUT /api/employees/:id
  async update(req, res) {
    try {
      const { id } = req.params;
      const employee = await EmployeeModel.findByPk(id);
      if (!employee) return response.notFound(res, "Karyawan tidak ditemukan");

      // Cek duplicate employee_id kecuali milik sendiri
      const isDuplicate = await EmployeeModel.checkDuplicateEmployeeId(
        req.body.employee_id,
        id,
      );
      if (isDuplicate) {
        return response.error(res, "ID Karyawan sudah digunakan", 422);
      }

      await EmployeeModel.update(id, req.body);
      return response.success(res, null, "Data karyawan berhasil diperbarui");
    } catch (err) {
      return response.error(res, err.message);
    }
  }

  // DELETE /api/employees/:id
  async destroy(req, res) {
    try {
      const employee = await EmployeeModel.findByPk(req.params.id);
      if (!employee) return response.notFound(res, "Karyawan tidak ditemukan");
      await EmployeeModel.delete(req.params.id);
      return response.success(res, null, "Karyawan berhasil dihapus");
    } catch (err) {
      return response.error(res, err.message);
    }
  }
}

module.exports = new EmployeeController();
