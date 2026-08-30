const mocksEnabled = import.meta.env.VITE_ENABLE_MOCKS === "true";

if (import.meta.env.PROD && mocksEnabled) {
  throw new Error("VITE_ENABLE_MOCKS tidak boleh aktif pada build production.");
}

export const appConfig = { mocksEnabled };
