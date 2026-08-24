import React, { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import Shell from "./components/Shell.jsx";
import Course from "./pages/Course.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Finance from "./pages/Finance.jsx";
import Login from "./pages/Login.jsx";
import Rombel from "./pages/Rombel.jsx";
import SessionDetail from "./pages/SessionDetail.jsx";
import { startApplicationDataSynchronization } from "./services/applicationSyncService.js";

const ROLE_STORAGE_KEY = "awan-topan-current-role";

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState(() => window.localStorage.getItem(ROLE_STORAGE_KEY));

  useEffect(() => startApplicationDataSynchronization(), []);

  const handleLogin = (selectedRole) => {
    window.localStorage.setItem(ROLE_STORAGE_KEY, selectedRole);
    setRole(selectedRole);
    navigate("/dashboard", { replace: true });
  };

  const handleLogout = () => {
    window.localStorage.removeItem(ROLE_STORAGE_KEY);
    setRole(null);
    navigate("/login", { replace: true });
  };

  if (!role) {
    return (
      <Routes>
        <Route path="*" element={<Login onLogin={handleLogin} />} />
      </Routes>
    );
  }

  const activePage = location.pathname.startsWith("/course")
    ? "course"
    : location.pathname.startsWith("/rombel")
      ? "rombel"
    : location.pathname.startsWith("/finance")
      ? "finance"
      : "dashboard";
  const navigateToPage = (page) => navigate(`/${page}`);

  return (
    <Shell role={role} activePage={activePage} onNavigate={navigateToPage} onLogout={handleLogout}>
      <Routes>
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard role={role} onNavigate={navigateToPage} />} />
        <Route path="/course" element={<Course role={role} />} />
        <Route path="/course/sessions/:sessionId" element={<SessionDetail role={role} />} />
        <Route path="/rombel" element={<Rombel role={role} />} />
        <Route path="/finance" element={role === "admin" ? <Finance /> : <Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Shell>
  );
}
