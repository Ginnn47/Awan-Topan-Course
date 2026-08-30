import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useAuth } from "./auth/AuthProvider";
import { RequirePermission } from "./auth/RequirePermission";
import ShellApi from "./components/ShellApi";
import CourseApi from "./pages/CourseApi";
import DashboardApi from "./pages/DashboardApi";
import FinanceApi from "./pages/FinanceApi";
import LoginApi from "./pages/LoginApi";
import PaymentsApi from "./pages/PaymentsApi";
import RombelApi from "./pages/RombelApi";
import SessionDetailApi from "./pages/SessionDetailApi";
import TeachersApi from "./pages/TeachersApi";

function LoadingScreen() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background text-sm font-semibold text-primary">
      Menyiapkan Awan Topan Course...
    </div>
  );
}

export default function App() {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  if (loading) return <LoadingScreen />;
  if (!user)
    return (
      <Routes>
        <Route path="*" element={<LoginApi />} />
      </Routes>
    );

  const activePage = location.pathname.startsWith("/course")
    ? "course"
    : location.pathname.startsWith("/database") ||
        location.pathname.startsWith("/rombel")
      ? "database"
      : location.pathname.startsWith("/finance")
        ? "finance"
        : location.pathname.startsWith("/payments")
          ? "payments"
          : "dashboard";
  const navigatePage = (page: string) =>
    navigate(page.startsWith("/") ? page : `/${page}`);
  const handleLogout = async () => {
    try {
      await logout();
    } finally {
      window.location.replace("/login");
    }
  };

  return (
    <ShellApi
      user={user}
      activePage={activePage}
      onNavigate={navigatePage}
      onLogout={() => void handleLogout()}
    >
      <Routes>
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<DashboardApi />} />
        <Route path="/course" element={<CourseApi />} />
        <Route
          path="/course/sessions/:sessionId"
          element={<SessionDetailApi />}
        />
        <Route
          path="/rombel"
          element={<Navigate to="/database/students" replace />}
        />
        <Route
          path="/database"
          element={<Navigate to="/database/students" replace />}
        />
        <Route
          path="/database/students"
          element={
            <RequirePermission permission="manage_academics">
              <RombelApi />
            </RequirePermission>
          }
        />
        <Route
          path="/database/teachers"
          element={
            <RequirePermission permission="manage_academics">
              <TeachersApi />
            </RequirePermission>
          }
        />
        <Route
          path="/payments"
          element={
            <RequirePermission permission="record_assigned_payments">
              <PaymentsApi />
            </RequirePermission>
          }
        />
        <Route
          path="/finance"
          element={
            <RequirePermission permission="manage_finance">
              <FinanceApi />
            </RequirePermission>
          }
        />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </ShellApi>
  );
}
