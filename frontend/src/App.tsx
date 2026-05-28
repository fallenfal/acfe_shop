import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ProtectedRoute } from "./components/auth/ProtectedRoute";
import { AppShell } from "./components/layout/AppShell";
import { AuthProvider } from "./contexts/AuthContext";
import { LocationProvider } from "./contexts/LocationContext";
import { LoginPage } from "./pages/LoginPage";
import { SettingsPage } from "./pages/SettingsPage";
import { MemoCreate } from "./pages/memos/MemoCreate";
import { MemoDetail } from "./pages/memos/MemoDetail";
import { MemoFeed } from "./pages/memos/MemoFeed";
import { MemoForm } from "./pages/memos/MemoForm";
import { StockItemDetail } from "./pages/inventory/StockItemDetail";
import { StockOverview } from "./pages/inventory/StockOverview";
import { StockTakeFlow } from "./pages/inventory/StockTakeFlow";
import { SalesDashboard } from "./pages/sales/SalesDashboard";
import { WasteLog } from "./pages/waste/WasteLog";
import { DateCheckDashboard } from "./pages/datechecks/DateCheckDashboard";
import { DateCheckDetail } from "./pages/datechecks/DateCheckDetail";
import { DateCheckFlow } from "./pages/datechecks/DateCheckFlow";
import { DateCheckSettings } from "./pages/datechecks/DateCheckSettings";
import { ProgrammeBuilder } from "./pages/training/ProgrammeBuilder";
import { ProgrammeProgress } from "./pages/training/ProgrammeProgress";
import { TrainingLibrary } from "./pages/training/TrainingLibrary";
import { TrainingTimeline } from "./pages/training/TrainingTimeline";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route
              element={
                <LocationProvider>
                  <AppShell />
                </LocationProvider>
              }
            >
              <Route path="/" element={<Navigate to="/dashboard" replace />} />
              <Route path="/dashboard" element={<SalesDashboard />} />
              <Route path="/memos" element={<MemoFeed />} />
              <Route path="/memos/new" element={<MemoCreate />} />
              <Route path="/memos/:id/edit" element={<MemoForm />} />
              <Route path="/memos/:id" element={<MemoDetail />} />
              <Route path="/inventory" element={<StockOverview />} />
              <Route path="/inventory/stock-take" element={<StockTakeFlow />} />
              <Route path="/inventory/:id" element={<StockItemDetail />} />
              <Route path="/waste" element={<WasteLog />} />
              <Route path="/date-checks" element={<DateCheckDashboard />} />
              <Route path="/date-checks/new" element={<DateCheckFlow />} />
              <Route path="/date-checks/settings" element={<DateCheckSettings />} />
              <Route path="/date-checks/:id" element={<DateCheckDetail />} />
              <Route path="/training" element={<TrainingLibrary />} />
              <Route path="/training/new" element={<ProgrammeBuilder />} />
              <Route
                path="/training/:programmeId/edit"
                element={<ProgrammeBuilder />}
              />
              <Route
                path="/training/:programmeId/progress"
                element={<ProgrammeProgress />}
              />
              <Route path="/training/:programmeId" element={<TrainingTimeline />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
