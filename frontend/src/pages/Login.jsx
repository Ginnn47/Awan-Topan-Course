import React, { useState } from "react";
import { Icon } from "../components/ui.jsx";

export default function Login({ onLogin }) {
  const [role, setRole] = useState("admin");
  const [showPassword, setShowPassword] = useState(false);

  return (
    <main className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-surface px-6 text-on-surface">
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute left-[-8%] top-[-10%] h-[48%] w-[52%] rounded-full bg-primary-fixed/20 blur-[100px]" />
        <div className="absolute bottom-[-10%] right-[-8%] h-[40%] w-[42%] rounded-full bg-secondary-fixed/30 blur-[90px]" />
      </div>

      <section className="glass-panel relative z-10 flex w-full max-w-md flex-col gap-8 rounded-xl p-8 shadow-lift transition hover:scale-[1.01]">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-primary-container text-primary shadow-sm">
            <Icon name="cloud" className="text-4xl" />
          </div>
          <div>
            <h1 className="mb-1 text-[32px] font-bold leading-10 text-primary md:text-[34px]">Awan Topan</h1>
            <p className="text-sm text-on-surface-variant">Selamat Datang Kembali</p>
          </div>
        </div>

        <form
          className="flex flex-col gap-6"
          onSubmit={(event) => {
            event.preventDefault();
            onLogin(role);
          }}
        >
          <div className="grid grid-cols-2 rounded-full bg-surface-container-low p-1">
            {["admin", "teacher"].map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setRole(item)}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  role === item ? "bg-primary text-on-primary shadow-sm" : "text-on-surface-variant"
                }`}
              >
                {item === "admin" ? "Admin" : "Guru"}
              </button>
            ))}
          </div>

          <label className="relative block">
            <span className="absolute -top-2 left-4 z-10 bg-surface-container-lowest px-1 text-xs font-medium text-primary">Email Akademik</span>
            <input className="pill-input py-4 pl-6 pr-12" placeholder="nama@awantopan.edu" type="email" required />
            <Icon name="mail" className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant" />
          </label>

          <label className="relative block">
            <span className="absolute -top-2 left-4 z-10 bg-surface-container-lowest px-1 text-xs font-medium text-primary">Kata Sandi</span>
            <input className="pill-input py-4 pl-6 pr-12" placeholder="........" type={showPassword ? "text" : "password"} required />
            <button
              className="absolute right-4 top-1/2 -translate-y-1/2 text-outline-variant hover:text-primary"
              type="button"
              onClick={() => setShowPassword(!showPassword)}
              aria-label="Toggle password visibility"
            >
              <Icon name={showPassword ? "visibility_off" : "visibility"} />
            </button>
          </label>

          <div className="flex items-center justify-between px-2 text-xs font-medium">
            <label className="flex items-center gap-2 text-on-surface-variant">
              <input className="h-4 w-4 rounded border-outline-variant text-primary focus:ring-primary" type="checkbox" />
              Ingat saya
            </label>
            <a className="text-primary" href="#forgot">
              Lupa sandi?
            </a>
          </div>

          <button className="primary-button w-full py-4 text-xl" type="submit">
            Masuk <Icon name="arrow_forward" />
          </button>
        </form>

        <p className="text-center text-xs font-medium text-on-surface-variant">Sistem Manajemen Akademik 2026</p>
      </section>
    </main>
  );
}
