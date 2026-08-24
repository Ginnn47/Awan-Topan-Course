import {
  ensureStudentMonthlyRecords,
  loadStudentMonthlyRecords,
  loadCourseClasses,
  loadCourseSessions,
  saveCourseSessions,
} from "../datadummy.js";
import { synchronizeFinanceWithRoster } from "./financeService.js";
import { subscribeDataChanges } from "./dataStore.js";

let synchronizationQueued = false;
let synchronizationRunning = false;

function queueReconciliation() {
  if (synchronizationQueued) return;
  synchronizationQueued = true;
  queueMicrotask(() => {
    synchronizationQueued = false;
    reconcileRosterDependencies();
  });
}

export function reconcileRosterDependencies() {
  if (synchronizationRunning) return null;
  synchronizationRunning = true;
  try {
    const classes = loadCourseClasses();
    const classById = new Map(classes.map((classGroup) => [classGroup.id, classGroup]));
    const sessions = loadCourseSessions();
    let scheduleUpdated = 0;
    const synchronizedSessions = sessions.map((session) => {
      const classGroup = classById.get(session.classId);
      if (!classGroup) {
        if (session.rosterStatus === "removed") return session;
        scheduleUpdated += 1;
        return { ...session, rosterStatus: "removed" };
      }
      const { rosterStatus, ...activeSession } = session;
      if (rosterStatus || activeSession.className !== classGroup.name) {
        scheduleUpdated += 1;
        return { ...activeSession, className: classGroup.name };
      }
      return session;
    });
    if (scheduleUpdated > 0) {
      saveCourseSessions(synchronizedSessions, { origin: "system-reconcile" });
    }

    const finance = synchronizeFinanceWithRoster();
    const existingMonths = [...new Set(loadStudentMonthlyRecords().map((record) => record.month).filter(Boolean))];
    existingMonths.forEach((month) => ensureStudentMonthlyRecords(month, { origin: "system-reconcile" }));
    return { scheduleUpdated, finance };
  } finally {
    synchronizationRunning = false;
  }
}

export function startApplicationDataSynchronization() {
  queueReconciliation();
  return subscribeDataChanges((change) => {
    if (change.origin === "system-reconcile") return;
    queueReconciliation();
  }, ["roster"]);
}
