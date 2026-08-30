import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthProvider";
import { Icon } from "../components/ui";

export default function LoginApi() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  if (user && !working) return <Navigate to="/dashboard" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      await login(email, password);
      const target =
        (location.state as { from?: string } | null)?.from || "/dashboard";
      navigate(target, { replace: true });
    } catch (reason) {
      setError(
        reason instanceof ApiError
          ? reason.detail.message
          : "Tidak dapat terhubung ke server.",
      );
    } finally {
      setWorking(false);
    }
  };

  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#edf7f1] bg-[url('/assets/generated/dashboard-mint-canvas.png')] bg-cover bg-center px-3 py-6 text-on-surface sm:px-5">
      <section className="glass-panel w-full max-w-md rounded-[8px] p-5 shadow-lift sm:p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary text-white shadow-sm">
            <Icon name="school" className="text-2xl" />
          </div>
          <div>
            <h1 className="text-[32px] font-bold leading-10 text-primary">
              Awan Topan
            </h1>
            <p className="text-sm text-on-surface-variant">
              Selamat Datang Kembali
            </p>
          </div>
        </div>
        <form className="mt-7 flex flex-col gap-5 sm:mt-8" onSubmit={submit}>
          <label className="relative block">
            <span className="absolute -top-2 left-4 z-10 bg-white px-1 text-xs font-medium text-primary">
              Email Akademik
            </span>
            <input
              className="pill-input py-4 pl-6 pr-12"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@awantopan.local"
              type="email"
              autoComplete="email"
              required
            />
            <Icon
              name="mail"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant"
            />
          </label>
          <label className="relative block">
            <span className="absolute -top-2 left-4 z-10 bg-white px-1 text-xs font-medium text-primary">
              Kata Sandi
            </span>
            <input
              className="pill-input py-4 pl-6 pr-12"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-primary"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label="Tampilkan atau sembunyikan kata sandi"
            >
              <Icon name={showPassword ? "visibility_off" : "visibility"} />
            </button>
          </label>
          {error && (
            <div
              className="rounded-[8px] border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}
          <button
            className="primary-button w-full py-4 text-base disabled:cursor-wait disabled:opacity-60"
            type="submit"
            disabled={working}
          >
            {working ? "Memeriksa..." : "Masuk"} <Icon name="arrow_forward" />
          </button>
        </form>
        <p className="mt-7 text-center text-xs font-medium text-on-surface-variant">
          Sistem Manajemen Akademik 2026
        </p>
      </section>
    </main>
  );
}
