export const DEFAULT_FEE_CATEGORIES = [
  { key: "legacy", name: "Anak Lama", amount: 150000 },
  { key: "new", name: "Anak Baru", amount: 200000 },
];

const categoryId = (classId, key) => `${classId}-fee-${key}`;

export function createDefaultFeeCategories(classId) {
  return DEFAULT_FEE_CATEGORIES.map((category) => ({
    id: categoryId(classId, category.key),
    name: category.name,
    amount: category.amount,
  }));
}

export function normalizeFeeConfiguration(classGroup) {
  const fallback = createDefaultFeeCategories(classGroup.id);
  const source = Array.isArray(classGroup.feeCategories) && classGroup.feeCategories.length
    ? classGroup.feeCategories
    : fallback;
  const seen = new Set();
  const feeCategories = source.map((category, index) => {
    let id = String(category.id || categoryId(classGroup.id, `custom-${index + 1}`));
    while (seen.has(id)) id = `${id}-${index + 1}`;
    seen.add(id);
    return {
      id,
      name: String(category.name || `Kategori ${index + 1}`).trim(),
      amount: Math.max(1, Number(category.amount) || Number(classGroup.monthlyFee) || fallback[0].amount),
    };
  });
  const validIds = new Set(feeCategories.map((category) => category.id));
  const members = (classGroup.members || []).map((student, index) => ({
    ...student,
    feeCategoryId: validIds.has(student.feeCategoryId)
      ? student.feeCategoryId
      : feeCategories[index % 4 === 3 && feeCategories[1] ? 1 : 0].id,
  }));

  return { ...classGroup, feeCategories, members };
}

export function resolveStudentFee(classGroup, student) {
  const normalized = normalizeFeeConfiguration(classGroup);
  const category = normalized.feeCategories.find((item) => item.id === student?.feeCategoryId) || null;
  if (!category) return null;
  return { id: category.id, name: category.name, amount: Number(category.amount) };
}

export function validateFeeConfiguration(classGroup) {
  const categories = classGroup.feeCategories || [];
  const errors = [];
  if (!categories.length) errors.push("Rombel wajib memiliki minimal satu kategori iuran.");

  const normalizedNames = categories.map((category) => String(category.name || "").trim().toLowerCase());
  if (normalizedNames.some((name) => !name)) errors.push("Nama kategori iuran wajib diisi.");
  if (new Set(normalizedNames).size !== normalizedNames.length) errors.push("Nama kategori iuran harus unik dalam satu rombel.");
  if (categories.some((category) => !Number.isFinite(Number(category.amount)) || Number(category.amount) <= 0)) {
    errors.push("Nominal kategori iuran harus berupa Rupiah positif.");
  }
  const ids = categories.map((category) => category.id);
  if (ids.some((id) => !id) || new Set(ids).size !== ids.length) errors.push("ID kategori iuran tidak valid atau duplikat.");
  const validIds = new Set(ids);
  const invalidStudents = (classGroup.members || []).filter((student) => student.status !== "Nonaktif" && !validIds.has(student.feeCategoryId));
  if (invalidStudents.length) errors.push(`${invalidStudents.length} siswa aktif belum memiliki kategori iuran yang valid.`);

  return { valid: errors.length === 0, errors, invalidStudents };
}
