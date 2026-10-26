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
  const [logoLoaded, setLogoLoaded] = useState(true);

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
    <main className="flex min-h-[100dvh] items-center justify-center bg-background px-4 py-8 text-on-surface sm:px-6">
      <section className="glass-panel w-full max-w-md rounded-2xl border border-outline-variant bg-white p-6 shadow-lift sm:p-8">
        <div className="flex flex-col items-center gap-3 text-center">
          {logoLoaded ? (
            <img
              src="/logo.png"
              alt="Awan Topan Logo"
              className="h-16 w-16 object-contain rounded-xl"
              onError={() => setLogoLoaded(false)}
            />
          ) : (
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#18191B] text-amber-400 shadow-sm">
              <Icon name="school" className="text-3xl" />
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold leading-tight text-on-surface sm:text-3xl">
              Awan Topan Course
            </h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-wider text-amber-500">
              Academic Management System
            </p>
          </div>
        </div>
        <form className="mt-8 flex flex-col gap-5" onSubmit={submit}>
          <label className="relative block">
            <span className="absolute -top-2 left-4 z-10 bg-white px-1 text-xs font-semibold text-on-surface-variant">
              Email Akademik
            </span>
            <input
              className="pill-input py-3.5 pl-5 pr-12 text-sm"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nama@awantopan.local"
              type="email"
              autoComplete="email"
              required
            />
            <Icon
              name="mail"
              className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant text-base"
            />
          </label>
          <label className="relative block">
            <span className="absolute -top-2 left-4 z-10 bg-white px-1 text-xs font-semibold text-on-surface-variant">
              Kata Sandi
            </span>
            <input
              className="pill-input py-3.5 pl-5 pr-12 text-sm"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
            />
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface"
              type="button"
              onClick={() => setShowPassword((value) => !value)}
              aria-label="Tampilkan atau sembunyikan kata sandi"
            >
              <Icon name={showPassword ? "visibility_off" : "visibility"} className="text-base" />
            </button>
          </label>
          {error && (
            <div
              className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-xs font-semibold text-red-700"
              role="alert"
            >
              {error}
            </div>
          )}
          <button
            className="primary-button w-full py-3.5 text-sm font-bold shadow-md disabled:cursor-wait disabled:opacity-60"
            type="submit"
            disabled={working}
          >
            {working ? "Memeriksa..." : "Masuk Sistem"} <Icon name="arrow_forward" className="text-base" />
          </button>
        </form>
        <p className="mt-8 text-center text-xs font-medium text-on-surface-variant">
          Awan Topan Academic MS &copy; 2026
        </p>
      </section>
    </main>
  );
}
