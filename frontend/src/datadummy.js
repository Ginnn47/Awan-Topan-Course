import { readStorageJSON, writeStorageJSON } from "./services/dataStore.js";
import { normalizeFeeConfiguration } from "./services/feeCategoryService.js";

const COURSE_STORAGE_KEY = "awan-topan-course-sessions-v4";
const SUBJECT_STORAGE_KEY = "awan-topan-course-subjects-v1";
const CLASS_STORAGE_KEY = "awan-topan-course-classes-v3";
const MONTHLY_RECAP_STORAGE_KEY = "awan-topan-student-monthly-records-v3";
export const DEFAULT_MONTHLY_FEE = 500000;

const pad = (value) => String(value).padStart(2, "0");

export function toISODate(value) {
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function addDays(value, amount) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + amount);
  return date;
}

export function startOfWeek(value = new Date()) {
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T12:00:00`);
  const day = date.getDay();
  date.setDate(date.getDate() - (day === 0 ? 6 : day - 1));
  date.setHours(12, 0, 0, 0);
  return date;
}

export const courseTeachers = [
  { id: "teacher-topan", name: "Mas Topan", initials: "MT", subject: "Matematika", title: "Koordinator Pengajar", phone: "0812 4400 1201", color: "bg-emerald-100 text-emerald-800" },
  { id: "teacher-layla", name: "Mbak Layla", initials: "ML", subject: "Matematika", title: "Pengajar SD", phone: "0812 4400 1202", color: "bg-blue-100 text-blue-700" },
  { id: "teacher-bella", name: "Mbak Bella", initials: "MB", subject: "B. Inggris", title: "Pengajar Bahasa Inggris", phone: "0812 4400 1203", color: "bg-purple-100 text-purple-700" },
  { id: "teacher-niah", name: "Mbak Ni'ah", initials: "MN", subject: "Biologi", title: "Pengajar Sains", phone: "0812 4400 1204", color: "bg-lime-100 text-lime-800" },
  { id: "teacher-dian", name: "Mbak Dian", initials: "MD", subject: "Kimia", title: "Pengajar Sains", phone: "0812 4400 1205", color: "bg-red-100 text-red-700" },
  { id: "teacher-ardya", name: "Mbak Ardya", initials: "MA", subject: "Fisika", title: "Pengajar Sains", phone: "0812 4400 1206", color: "bg-orange-100 text-orange-700" },
  { id: "teacher-jihan", name: "Mbak Jihan", initials: "MJ", subject: "B. Indonesia", title: "Pengajar Bahasa", phone: "0812 4400 1207", color: "bg-amber-100 text-amber-800" },
  { id: "teacher-nuha", name: "Mbak Nuha", initials: "MNu", subject: "IPA", title: "Pengajar SD dan SMP", phone: "0812 4400 1208", color: "bg-cyan-100 text-cyan-700" },
];

export const nganjukSchools = [
  "SD Negeri 1 Begadung",
  "SD Negeri 1 Ganungkidul",
  "SD Muhammadiyah Nganjuk",
  "SD Aisyiyah 1 Nganjuk",
  "SMP Negeri 1 Nganjuk",
  "SMP Negeri 2 Nganjuk",
  "SMP Negeri 3 Nganjuk",
  "SMP Islam Baitul Izzah Nganjuk",
  "SMA Negeri 1 Nganjuk",
  "SMA Negeri 1 Loceret Nganjuk",
  "SMK PGRI 1 Nganjuk",
  "SMK Nasional Nganjuk",
];

export const courseSubjects = [
  { id: "subject-matematika", name: "Matematika", tone: "blue" },
  { id: "subject-fisika", name: "Fisika", tone: "orange" },
  { id: "subject-kimia", name: "Kimia", tone: "red" },
  { id: "subject-inggris", name: "B. Inggris", tone: "purple" },
  { id: "subject-biologi", name: "Biologi", tone: "green" },
  { id: "subject-ipa", name: "IPA", tone: "teal" },
  { id: "subject-indonesia", name: "B. Indonesia", tone: "amber" },
];

export const studentNameGroups = {
  "Pemain Sepakbola": [
    "Lionel Messi", "Cristiano Ronaldo", "Neymar Junior", "Kylian Mbappe", "Erling Haaland",
    "Kevin De Bruyne", "Luka Modric", "Mohamed Salah", "Son Heung-min", "Jude Bellingham",
    "Vinicius Junior", "Rodri Hernandez", "Robert Lewandowski", "Harry Kane", "Antoine Griezmann",
  ],
  "Karakter Anime MC": [
    "Naruto Uzumaki", "Monkey D. Luffy", "Ichigo Kurosaki", "Tanjiro Kamado", "Izuku Midoriya",
    "Eren Yeager", "Edward Elric", "Gon Freecss", "Saitama Hero", "Yuji Itadori",
    "Denji Hayakawa", "Senku Ishigami", "Light Yagami", "Subaru Natsuki", "Natsu Dragneel",
  ],
  "Member JKT48": [
    "Shania Gracia", "Angelina Christy", "Freya Jayawardana", "Feni Fitriyanti", "Mutiara Azzahra",
    "Cornelia Vanisa", "Helisma Putri", "Kathrina Irene", "Marsha Lenathea", "Gita Sekar",
    "Jesslyn Elly", "Lulu Salsabila", "Amanda Sukma", "Indah Cahya", "Ni Made Aurellia",
  ],
  "Artis Indonesia": [
    "Raisa Andriana", "Maudy Ayunda", "Dian Sastrowardoyo", "Nicholas Saputra", "Reza Rahadian",
    "Chelsea Islan", "Tara Basro", "Iqbaal Ramadhan", "Isyana Sarasvati", "Ardhito Pramono",
    "Bunga Citra Lestari", "Vidi Aldiano", "Prilly Latuconsina", "Angga Yunanda", "Putri Marino",
  ],
  "Serapan Pokemon": [
    "Pikachu Pratama", "Eevee Lestari", "Bulbasaur Nugraha", "Charmander Putra", "Squirtle Aulia",
    "Jigglypuff Sari", "Snorlax Mahendra", "Lucario Wijaya", "Gengar Saputra", "Lapras Permata",
    "Vulpix Ananda", "Riolu Akbar", "Chikorita Ayu", "Mudkip Fadli", "Sprigatito Zahra",
  ],
  "Trainer Pokemon": [
    "Ash Ketchum", "Misty Cerulean", "Brock Pewter", "May Maple", "Dawn Berlitz",
    "Serena Kalos", "Iris Opelucid", "Cilan Striaton", "Lillie Aether", "Mallow Alola",
    "Kiawe Akala", "Goh Cerise", "Chloe Cerise", "Nemona Paldea", "Cynthia Sinnoh",
  ],
  "Hero Mobile Legends": [
    "Alucard Wisesa", "Miya Larasati", "Layla Nirmala", "Gusion Pranata", "Kagura Ayumi",
    "Hayabusa Kenzaki", "Fanny Wertz", "Lancelot Baroque", "Odette Regina", "Claude Dexter",
    "Lunox Aurora", "Chou Fighter", "Beatrix Renner", "Xavier Defiant", "Granger Bardic",
  ],
  "Nama Jepang Indonesia": [
    "Haruto Prasetyo", "Sakura Maharani", "Ren Saputra", "Aoi Lestari", "Yuki Ramadhan",
    "Riku Hidayat", "Mei Kusuma", "Sora Nugroho", "Hana Wijaya", "Kaito Santoso",
    "Akira Wulandari", "Natsuki Permata", "Keiko Ananda", "Daichi Kurniawan", "Emi Puspitasari",
  ],
};

const studentNameSeeder = Object.entries(studentNameGroups).flatMap(([seedGroup, names]) => (
  names.map((name) => ({ name, seedGroup }))
));
let studentNameCursor = 0;

function schoolsForLevel(level) {
  if (level === "SD") return nganjukSchools.slice(0, 4);
  if (level === "9 SMP") return nganjukSchools.slice(4, 8);
  return nganjukSchools.slice(8);
}

function makeMembers(prefix, names, total = names.length, level = "SD") {
  const schools = schoolsForLevel(level);
  const roster = Array.from({ length: total }, () => studentNameSeeder[studentNameCursor++]);
  return roster.map(({ name, seedGroup }, index) => ({
    id: `${prefix}-${index + 1}`,
    name,
    initials: name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(),
    status: "Aktif",
    school: schools[index % schools.length],
    seedGroup,
  }));
}

export const courseClasses = [
  { id: "class-sd-4", level: "SD", name: "Kelas 4 SD", totalStudents: 10, members: makeMembers("sd4", ["Aira Putri", "Bintang Rama", "Caca Nuraini", "Dito Alfarizi"], 10, "SD") },
  { id: "class-sd-6", level: "SD", name: "Kelas 6 SD", totalStudents: 12, members: makeMembers("sd6", ["Elang Pradana", "Farah Aulia", "Ghani Akbar", "Hana Safitri"], 12, "SD") },
  { id: "class-9a", level: "9 SMP", name: "Kelas 9 SMP A", totalStudents: 14, members: makeMembers("smp9a", ["Indra Wijaya", "Jihan Amalia", "Keenan Putra", "Laila Zahra"], 14, "9 SMP") },
  { id: "class-9b", level: "9 SMP", name: "Kelas 9 SMP B", totalStudents: 12, members: makeMembers("smp9b", ["Miko Saputra", "Nadia Putri", "Omar Fadli", "Prita Ayu"], 12, "9 SMP") },
  { id: "class-10a", level: "10 SMA", name: "Kelas 10 SMA A", totalStudents: 14, members: makeMembers("sma10a", ["Qori Rahma", "Raka Mahendra", "Salsa Nabila", "Tio Prasetyo"], 14, "10 SMA") },
  { id: "class-10b", level: "10 SMA", name: "Kelas 10 SMA B", totalStudents: 12, members: makeMembers("sma10b", ["Ulya Kartika", "Vino Aditya", "Wina Maharani", "Yoga Saputra"], 12, "10 SMA") },
  { id: "class-11-ipa", level: "11 SMA", name: "Kelas 11 SMA IPA", totalStudents: 12, members: makeMembers("sma11ipa", ["Alya Putri", "Bima Arya", "Citra Lestari", "Dimas Pratama"], 12, "11 SMA") },
  { id: "class-11-ips", level: "11 SMA", name: "Kelas 11 SMA IPS", totalStudents: 10, members: makeMembers("sma11ips", ["Fahri Maulana", "Galang Saputra", "Keisha Ananda", "Mira Amelia"], 10, "11 SMA") },
  { id: "class-12-ipa", level: "12 SMA", name: "Kelas 12 SMA IPA", totalStudents: 14, members: makeMembers("sma12ipa", ["Naura Syifa", "Rafi Akbar", "Salsa Putri", "Kevin Halim"], 14, "12 SMA") },
  { id: "class-12-ips", level: "12 SMA", name: "Kelas 12 SMA IPS", totalStudents: 10, members: makeMembers("sma12ips", ["Arga Wijaya", "Nadia Rahma", "Rizky Maulana", "Zahra Fitri"], 10, "12 SMA") },
];

function cloneSubjects() {
  return courseSubjects.map((subject) => ({ ...subject }));
}

function cloneClasses() {
  return courseClasses.map((classGroup) => normalizeFeeConfiguration({
    ...classGroup,
    monthlyFee: classGroup.monthlyFee || DEFAULT_MONTHLY_FEE,
    members: classGroup.members.map((member) => ({ ...member })),
  }));
}

export function loadCourseSubjects() {
  if (typeof window === "undefined") return cloneSubjects();
  const stored = readStorageJSON(SUBJECT_STORAGE_KEY, null);
  if (Array.isArray(stored) && stored.length > 0) return stored;
  const seed = cloneSubjects();
  writeStorageJSON(SUBJECT_STORAGE_KEY, seed, { domain: "catalog", action: "seed", notify: false });
  return seed;
}

export function saveCourseSubjects(records, change = {}) {
  writeStorageJSON(SUBJECT_STORAGE_KEY, records, { domain: "catalog", action: "replace", ...change });
  return records;
}

export function loadCourseClasses() {
  if (typeof window === "undefined") return cloneClasses();
  const stored = readStorageJSON(CLASS_STORAGE_KEY, null);
  if (Array.isArray(stored) && stored.length > 0) {
    const normalized = stored.map((classGroup) => normalizeFeeConfiguration({
      ...classGroup,
      monthlyFee: Number(classGroup.monthlyFee) || DEFAULT_MONTHLY_FEE,
      totalStudents: classGroup.members?.length || 0,
      members: classGroup.members || [],
    }));
    writeStorageJSON(CLASS_STORAGE_KEY, normalized, { domain: "roster", action: "normalize", notify: false });
    return normalized;
  }
  const seed = cloneClasses();
  writeStorageJSON(CLASS_STORAGE_KEY, seed, { domain: "roster", action: "seed", notify: false });
  return seed;
}

export function saveCourseClasses(records, change = {}) {
  const normalized = records.map((classGroup) => normalizeFeeConfiguration({
    ...classGroup,
    monthlyFee: Number(classGroup.monthlyFee) || DEFAULT_MONTHLY_FEE,
    totalStudents: classGroup.members?.length || 0,
    members: classGroup.members || [],
  }));
  writeStorageJSON(CLASS_STORAGE_KEY, normalized, { domain: "roster", action: "replace", ...change });
  return normalized;
}

function studentRecordHash(value) {
  return [...value].reduce((total, character) => ((total * 31) + character.charCodeAt(0)) % 10007, 17);
}

function makeMonthlyRecap(student, month) {
  const hash = studentRecordHash(`${student.id}-${month}`);
  const paymentVariant = hash % 10;
  const paymentStatus = paymentVariant < 7 ? "Lunas" : paymentVariant < 9 ? "Sebagian" : "Belum Bayar";
  const totalSessions = 8 + (hash % 5);
  const absent = hash % 4 === 0 ? 1 : 0;
  const sick = hash % 5 === 0 ? 1 : 0;
  const permit = hash % 6 === 0 ? 1 : 0;
  const present = Math.max(0, totalSessions - absent - sick - permit);
  const invoiceAmount = 500000;
  const paidAmount = paymentStatus === "Lunas" ? invoiceAmount : paymentStatus === "Sebagian" ? 250000 : 0;

  return {
    id: `${student.id}-${month}`,
    studentId: student.id,
    month,
    payment: {
      status: paymentStatus,
      amount: invoiceAmount,
      paidAmount,
      paidAt: paymentStatus === "Belum Bayar" ? null : `${month}-${pad(3 + (hash % 18))}`,
      method: paymentStatus === "Belum Bayar" ? null : hash % 2 === 0 ? "Transfer" : "Tunai",
      note: paymentStatus === "Lunas" ? "Iuran bulan ini sudah diterima." : paymentStatus === "Sebagian" ? "Pembayaran belum lunas." : "Belum ada pembayaran yang tercatat.",
    },
    attendance: {
      totalSessions,
      present,
      permit,
      sick,
      absent,
      attendanceRate: totalSessions ? Math.round((present / totalSessions) * 100) : 0,
    },
  };
}

export function loadStudentMonthlyRecords() {
  if (typeof window === "undefined") return [];
  const stored = readStorageJSON(MONTHLY_RECAP_STORAGE_KEY, []);
  return Array.isArray(stored) ? stored : [];
}

export function saveStudentMonthlyRecords(records, change = {}) {
  writeStorageJSON(MONTHLY_RECAP_STORAGE_KEY, records, { domain: "attendance", action: "replace", ...change });
  return records;
}

export function ensureStudentMonthlyRecords(month, change = {}) {
  const records = loadStudentMonthlyRecords();
  const existingKeys = new Set(records.map((record) => `${record.studentId}:${record.month}`));
  const students = loadCourseClasses().flatMap((classGroup) => classGroup.members || []);
  const additions = students
    .filter((student) => !existingKeys.has(`${student.id}:${month}`))
    .map((student) => makeMonthlyRecap(student, month));
  return additions.length
    ? saveStudentMonthlyRecords([...records, ...additions], { action: "reconcile", entityIds: additions.map((record) => record.studentId), ...change })
    : records;
}

const currentWeek = startOfWeek(new Date());
const subjectTone = { Matematika: "blue", Fisika: "orange", Kimia: "red", "B. Inggris": "purple", Biologi: "green", IPA: "teal", "B. Indonesia": "amber" };

const sessionPlan = [
  { day: 0, startTime: "15:30", endTime: "17:00", classes: [
    ["class-9a", "Matematika", "teacher-topan", "R. Anggrek"],
    ["class-9b", "Biologi", "teacher-niah", "R. Melati"],
    ["class-10a", "B. Inggris", "teacher-bella", "R. Cendana"],
    ["class-sd-6", "Matematika", "teacher-layla", "R. Kenanga"],
  ] },
  { day: 0, startTime: "17:00", endTime: "18:30", classes: [
    ["class-10b", "Matematika", "teacher-topan", "R. Anggrek"],
    ["class-11-ipa", "Biologi", "teacher-niah", "Lab Biologi"],
    ["class-12-ipa", "Fisika", "teacher-ardya", "Lab Fisika"],
  ] },
  { day: 1, startTime: "14:00", endTime: "15:30", classes: [
    ["class-sd-4", "IPA", "teacher-nuha", "R. Kenanga"],
    ["class-9a", "B. Indonesia", "teacher-jihan", "R. Anggrek"],
    ["class-10a", "Kimia", "teacher-dian", "Lab Kimia"],
    ["class-11-ips", "B. Inggris", "teacher-bella", "R. Melati"],
  ] },
  { day: 1, startTime: "15:30", endTime: "17:00", classes: [
    ["class-sd-6", "Matematika", "teacher-layla", "R. Kenanga"],
    ["class-10b", "Biologi", "teacher-niah", "Lab Biologi"],
    ["class-12-ips", "Matematika", "teacher-topan", "R. Cendana"],
  ] },
  { day: 2, startTime: "14:00", endTime: "15:30", classes: [
    ["class-sd-4", "Matematika", "teacher-layla", "R. Kenanga"],
    ["class-9b", "IPA", "teacher-nuha", "R. Anggrek"],
    ["class-11-ipa", "Kimia", "teacher-dian", "Lab Kimia"],
    ["class-12-ips", "B. Inggris", "teacher-bella", "R. Melati"],
  ] },
  { day: 2, startTime: "15:30", endTime: "17:00", classes: [
    ["class-sd-6", "IPA", "teacher-nuha", "R. Kenanga"],
    ["class-10a", "Matematika", "teacher-topan", "R. Anggrek"],
    ["class-10b", "B. Indonesia", "teacher-jihan", "R. Cendana"],
    ["class-12-ipa", "Biologi", "teacher-niah", "Lab Biologi"],
  ] },
  { day: 2, startTime: "17:00", endTime: "18:30", classes: [
    ["class-11-ips", "B. Inggris", "teacher-bella", "R. Melati"],
    ["class-12-ipa", "Fisika", "teacher-ardya", "Lab Fisika"],
  ] },
  { day: 3, startTime: "15:30", endTime: "17:00", classes: [
    ["class-9a", "Matematika", "teacher-topan", "R. Anggrek"],
    ["class-9b", "B. Inggris", "teacher-bella", "R. Melati"],
    ["class-11-ipa", "Fisika", "teacher-ardya", "Lab Fisika"],
    ["class-12-ips", "Kimia", "teacher-dian", "Lab Kimia"],
  ] },
  { day: 3, startTime: "17:00", endTime: "18:30", classes: [
    ["class-sd-4", "B. Indonesia", "teacher-jihan", "R. Kenanga"],
    ["class-10a", "Biologi", "teacher-niah", "Lab Biologi"],
    ["class-11-ips", "B. Inggris", "teacher-bella", "R. Cendana"],
  ] },
  { day: 4, startTime: "15:00", endTime: "16:30", classes: [
    ["class-sd-6", "IPA", "teacher-nuha", "R. Kenanga"],
    ["class-10b", "Matematika", "teacher-topan", "R. Anggrek"],
    ["class-12-ipa", "Kimia", "teacher-dian", "Lab Kimia"],
  ] },
  { day: 4, startTime: "16:30", endTime: "18:00", classes: [
    ["class-9a", "IPA", "teacher-nuha", "R. Anggrek"],
    ["class-11-ipa", "Biologi", "teacher-niah", "Lab Biologi"],
    ["class-12-ips", "B. Inggris", "teacher-bella", "R. Melati"],
  ] },
];

export const courseSessionSeeder = sessionPlan.flatMap((slot, slotIndex) =>
  slot.classes.map(([classId, subject, teacherId, room], classIndex) => {
    const classGroup = courseClasses.find((item) => item.id === classId);
    const teacher = courseTeachers.find((item) => item.id === teacherId);
    return {
      id: `session-${slotIndex + 1}-${classIndex + 1}`,
      seriesId: `series-${slotIndex + 1}-${classIndex + 1}`,
      occurrenceIndex: 0,
      repeatWeeks: 5,
      date: toISODate(addDays(currentWeek, slot.day)),
      subject,
      classId,
      className: classGroup.name,
      startTime: slot.startTime,
      endTime: slot.endTime,
      teacherId,
      teacher: teacher.name,
      room,
      tone: subjectTone[subject] || "blue",
      recurrence: "5 minggu ke depan",
      material: `${subject}: pembahasan materi inti dan latihan soal ${classGroup.name}.`,
      conflict: false,
    };
  }),
);

function cloneSeed() {
  return courseSessionSeeder.map((session) => ({ ...session }));
}

export function loadCourseSessions() {
  if (typeof window === "undefined") return cloneSeed();
  const records = readStorageJSON(COURSE_STORAGE_KEY, null);
  if (Array.isArray(records)) return records;
  const seed = cloneSeed();
  writeStorageJSON(COURSE_STORAGE_KEY, seed, { domain: "schedule", action: "seed", notify: false });
  return seed;
}

export function saveCourseSessions(records, change = {}) {
  writeStorageJSON(COURSE_STORAGE_KEY, records, { domain: "schedule", action: "replace", ...change });
  return records;
}

export function resetCourseSessions() {
  const seed = cloneSeed();
  saveCourseSessions(seed);
  return seed;
}
