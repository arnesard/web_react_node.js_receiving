// src/App.jsx
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AppLayout from "./components/Layout/AppLayout";
import PilihMenu from "./pages/pilih-menu/PilihMenuPage";
import Dashboard from "./pages/penerimaan-produksi/dashboard/DashboardPage";
import ProductionInput from "./pages/penerimaan-produksi/input/InputPage";
import ProductionEdit from "./pages/penerimaan-produksi/input/Edit";
import Settings from "./pages/penerimaan-produksi/input/Pengaturan";
import Reports from "./pages/penerimaan-produksi/laporan/LaporanPage";
import TransferDashboard from "./pages/monitoring-transfer/dashboard/DashboardPage";
import TransferMonitoring from "./pages/monitoring-transfer/input/InputPage";
import TransferLaporan from "./pages/monitoring-transfer/laporan/LaporanPage";
import TransferPengaturan from "./pages/monitoring-transfer/pengaturan/PengaturanPage";
import Overtime from "./pages/input-lembur/InputLemburPage";
import Employees from "./pages/karyawan/KaryawanPage";
import ControlStock from "./pages/control-stock/ControlStockPage";
import KarawangScan from "./pages/stok-opname-karawang/ScanPage";
import KarawangDashboard from "./pages/stok-opname-karawang/DashboardPage";
import KarawangBarcode from "./pages/stok-opname-karawang/BarcodePage";
import KarawangCrossDocking from "./pages/stok-opname-karawang/CrossDockingPage";
import KarawangFifo from "./pages/stok-opname-karawang/FifoPage";
import KarawangTransferPlan from "./pages/stok-opname-karawang/TransferPlanPage";
import BarcodeTracer from "./pages/barcode/BarcodeTracerPage";
import TubeHome from "./pages/tube-barcode/TubeBarcodeHome";
import TubeScan from "./pages/tube-barcode/ScanCollie";
import TubeReceive from "./pages/tube-barcode/Receive";
import TubeTransfer from "./pages/tube-barcode/Transfer";
import TubeMonitoring from "./pages/tube-barcode/Monitoring";
import "./App.css";

const currentUser = { name: "Admin GT" };

function LayoutRoutes() {
  return (
    <AppLayout user={currentUser}>
      <Routes>
        <Route path="/overtime" element={<Overtime />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/production" element={<ProductionInput />} />
        <Route
          path="/production/edit/:plant/:id"
          element={<ProductionEdit />}
        />
        <Route path="/employees" element={<Employees />} />
        <Route path="/reports" element={<Reports />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="/transfer" element={<TransferMonitoring />} />
        <Route path="/transfer/dashboard" element={<TransferDashboard />} />
        <Route path="/transfer/laporan" element={<TransferLaporan />} />
        <Route path="/transfer/pengaturan" element={<TransferPengaturan />} />
        <Route path="/control-stock" element={<ControlStock />} />
        <Route path="/karawang" element={<KarawangScan />} />
        <Route path="/karawang/dashboard" element={<KarawangDashboard />} />
        <Route path="/karawang/barcode" element={<KarawangBarcode />} />
        <Route path="/karawang/cross-docking" element={<KarawangCrossDocking />} />
        <Route path="/karawang/fifo" element={<KarawangFifo />} />
        <Route
          path="/karawang/transfer-plan"
          element={<KarawangTransferPlan />}
        />
        <Route path="/barcode" element={<BarcodeTracer />} />
        <Route path="/tube-barcode" element={<TubeHome />} />
        <Route path="/tube-barcode/scan" element={<TubeScan />} />
        <Route path="/tube-barcode/receive" element={<TubeReceive />} />
        <Route path="/tube-barcode/transfer" element={<TubeTransfer />} />
        <Route path="/tube-barcode/monitoring" element={<TubeMonitoring />} />
      </Routes>
    </AppLayout>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Full screen, tanpa layout */}
        <Route path="/" element={<PilihMenu />} />

        {/* Semua halaman lain pakai AppLayout */}
        <Route path="/*" element={<LayoutRoutes />} />
      </Routes>
    </BrowserRouter>
  );
}
