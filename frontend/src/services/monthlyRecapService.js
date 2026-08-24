import {
  loadStudentMonthlyRecords,
  loadCourseClasses,
} from "../datadummy.js";
import { getStudentFinanceSummary } from "./financeService.js";

export async function getStudentMonthlyRecap(studentId, month, role = "teacher") {
  const classGroup = loadCourseClasses().find((item) => item.members?.some((student) => student.id === studentId));
  const student = classGroup?.members?.find((item) => item.id === studentId);
  if (!classGroup || !student) throw new Error("Data siswa tidak ditemukan pada rombel aktif.");

  const attendanceRecord = loadStudentMonthlyRecords().find((item) => item.studentId === studentId && item.month === month) || {
    attendance: { totalSessions: 0, present: 0, permit: 0, sick: 0, absent: 0, attendanceRate: 0 },
  };
  const payment = getStudentFinanceSummary(studentId, month);

  const canViewPaymentDetails = role === "admin";
  return {
    student: { ...student },
    class: { id: classGroup.id, name: classGroup.name, level: classGroup.level },
    studentId,
    month,
    payment: canViewPaymentDetails
      ? { ...payment }
      : { status: payment.status, feeCategoryId: payment.feeCategoryId, feeCategoryName: payment.feeCategoryName, amount: null, paidAmount: null, paidAt: null, method: null, note: null },
    attendance: { ...attendanceRecord.attendance },
    permissions: { canViewPaymentDetails },
  };
}
