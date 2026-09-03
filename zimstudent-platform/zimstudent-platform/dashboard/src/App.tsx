import { Routes, Route } from "react-router-dom";
import { RequireStaff } from "./lib/auth";
import { Layout } from "./components/Layout";
import { LoginPage } from "./pages/LoginPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DecisionQueuePage } from "./pages/DecisionQueuePage";
import { StudentDirectoryPage } from "./pages/StudentDirectoryPage";
import { StudentProfilePage } from "./pages/StudentProfilePage";
import { WelfareBoardPage } from "./pages/WelfareBoardPage";
import { ReportsPage } from "./pages/ReportsPage";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />

      <Route
        element={
          <RequireStaff>
            <Layout />
          </RequireStaff>
        }
      >
        <Route path="/" element={<DashboardPage />} />
        <Route path="/decisions" element={<DecisionQueuePage />} />
        <Route path="/students" element={<StudentDirectoryPage />} />
        <Route path="/students/:studentId" element={<StudentProfilePage />} />
        <Route path="/welfare" element={<WelfareBoardPage />} />
        <Route path="/reports" element={<ReportsPage />} />
      </Route>
    </Routes>
  );
}
