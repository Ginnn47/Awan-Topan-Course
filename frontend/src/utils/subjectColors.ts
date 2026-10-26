/**
 * Palette Floral Sunset Melody untuk Mata Pelajaran di Awan Topan Course
 * Berdasarkan identitas mata pelajaran (bukan indeks array, bukan posisi card).
 */

export interface SubjectColorTheme {
  name: string;
  hex: string;
  bgPastel: string;
  borderColor: string;
  accentColor: string;
  badgeBg: string;
  badgeText: string;
  textColor: string;
}

export const FLORAL_SUNSET_MELODY: Record<string, SubjectColorTheme> = {
  coralRose: {
    name: "Coral Rose",
    hex: "#F5C3C6",
    bgPastel: "#FDF2F3",
    borderColor: "#F5C3C6",
    accentColor: "#F5C3C6",
    badgeBg: "#FDE8EA",
    badgeText: "#741D24",
    textColor: "#8A2E35",
  },
  red: {
    name: "Red",
    hex: "#FF595E",
    bgPastel: "#FFF1F2",
    borderColor: "#FF595E",
    accentColor: "#FF595E",
    badgeBg: "#FFE4E6",
    badgeText: "#881337",
    textColor: "#991B1B",
  },
  sunsetOrange: {
    name: "Sunset Orange",
    hex: "#FF924C",
    bgPastel: "#FFF7ED",
    borderColor: "#FF924C",
    accentColor: "#FF924C",
    badgeBg: "#FFEDD5",
    badgeText: "#7C2D12",
    textColor: "#9A3412",
  },
  goldenYellow: {
    name: "Golden Yellow",
    hex: "#FFCA3A",
    bgPastel: "#FEFCE8",
    borderColor: "#FFCA3A",
    accentColor: "#FFCA3A",
    badgeBg: "#FEF08A",
    badgeText: "#713F12",
    textColor: "#854D0E",
  },
  oliveLime: {
    name: "Olive Lime",
    hex: "#C5CA30",
    bgPastel: "#F7F9E8",
    borderColor: "#C5CA30",
    accentColor: "#C5CA30",
    badgeBg: "#EDF1C0",
    badgeText: "#3F430C",
    textColor: "#4D5210",
  },
  freshGreen: {
    name: "Fresh Green",
    hex: "#8AC926",
    bgPastel: "#F2F9E9",
    borderColor: "#8AC926",
    accentColor: "#8AC926",
    badgeBg: "#DEF2BE",
    badgeText: "#1E4306",
    textColor: "#2A5A0A",
  },
  teal: {
    name: "Teal",
    hex: "#36949D",
    bgPastel: "#EFF8F9",
    borderColor: "#36949D",
    accentColor: "#36949D",
    badgeBg: "#CEEBEF",
    badgeText: "#0E3D42",
    textColor: "#155359",
  },
  oceanBlue: {
    name: "Ocean Blue",
    hex: "#1982C4",
    bgPastel: "#EFF7FC",
    borderColor: "#1982C4",
    accentColor: "#1982C4",
    badgeBg: "#CEE7F7",
    badgeText: "#0A3959",
    textColor: "#0E4B73",
  },
  royalBlue: {
    name: "Royal Blue",
    hex: "#4267AC",
    bgPastel: "#F0F4FA",
    borderColor: "#4267AC",
    accentColor: "#4267AC",
    badgeBg: "#D4E1F4",
    badgeText: "#142950",
    textColor: "#1E3A6E",
  },
  indigo: {
    name: "Indigo",
    hex: "#565AA0",
    bgPastel: "#F2F2F9",
    borderColor: "#565AA0",
    accentColor: "#565AA0",
    badgeBg: "#D9DAEE",
    badgeText: "#1D1F42",
    textColor: "#2A2D5C",
  },
  deepPurple: {
    name: "Deep Purple",
    hex: "#6A4C93",
    bgPastel: "#F5F2F9",
    borderColor: "#6A4C93",
    accentColor: "#6A4C93",
    badgeBg: "#E0D5ED",
    badgeText: "#2A1A40",
    textColor: "#3D275A",
  },
};

const PALETTE_KEYS = [
  "teal",
  "oceanBlue",
  "royalBlue",
  "indigo",
  "sunsetOrange",
  "red",
  "freshGreen",
  "goldenYellow",
  "oliveLime",
  "coralRose",
  "deepPurple",
] as const;

/**
 * Deterministic hash based on subject identity name string
 */
function hashString(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

/**
 * Dapatkan SubjectColorTheme konsisten berdasarkan identitas nama mata pelajaran.
 */
export function getSubjectTheme(subjectName?: string | null): SubjectColorTheme {
  if (!subjectName || !subjectName.trim()) {
    return FLORAL_SUNSET_MELODY.teal;
  }

  const normalized = subjectName.trim().toLowerCase();

  // 1. Explicit semantic subject mapping
  if (normalized.includes("pilihan") || normalized.includes("mapil")) {
    return FLORAL_SUNSET_MELODY.teal; // Teal #36949D
  }
  if (normalized.includes("dasar") || normalized.includes("wajib") || normalized.includes("sma") && normalized.includes("mat")) {
    return FLORAL_SUNSET_MELODY.royalBlue; // Royal Blue #4267AC
  }
  if (normalized.includes("matematika") || normalized.includes("mtk") || normalized.includes("math")) {
    return FLORAL_SUNSET_MELODY.oceanBlue; // Ocean Blue #1982C4
  }
  if (normalized.includes("inggris") || normalized.includes("english") || normalized.includes("big")) {
    return FLORAL_SUNSET_MELODY.indigo; // Indigo #565AA0
  }
  if (normalized.includes("indonesia") || normalized.includes("bindo") || normalized.includes("bahasa")) {
    return FLORAL_SUNSET_MELODY.sunsetOrange; // Sunset Orange #FF924C
  }
  if (normalized.includes("fisika") || normalized.includes("physics")) {
    return FLORAL_SUNSET_MELODY.red; // Red #FF595E
  }
  if (normalized.includes("kimia") || normalized.includes("chemistry")) {
    return FLORAL_SUNSET_MELODY.freshGreen; // Fresh Green #8AC926
  }
  if (normalized.includes("soal") || normalized.includes("latsol") || normalized.includes("tryout")) {
    return FLORAL_SUNSET_MELODY.goldenYellow; // Golden Yellow #FFCA3A
  }
  if (normalized.includes("biologi") || normalized.includes("ipa")) {
    return FLORAL_SUNSET_MELODY.oliveLime; // Olive Lime #C5CA30
  }
  if (normalized.includes("ekonomi") || normalized.includes("ips") || normalized.includes("akuntansi")) {
    return FLORAL_SUNSET_MELODY.coralRose; // Coral Rose #F5C3C6
  }
  if (normalized.includes("sejarah") || normalized.includes("sosiologi") || normalized.includes("geografi")) {
    return FLORAL_SUNSET_MELODY.deepPurple; // Deep Purple #6A4C93
  }

  // 2. Fallback deterministik berdasarkan identitas nama (bukan index urutan card)
  const index = hashString(normalized) % PALETTE_KEYS.length;
  const key = PALETTE_KEYS[index];
  return FLORAL_SUNSET_MELODY[key];
}
