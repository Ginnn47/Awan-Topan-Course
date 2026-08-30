import { expect, test, type APIRequestContext } from "@playwright/test";
import {
  adminEmail,
  adminPassword,
  apiLogin,
  jakartaDate,
  mutationHeaders,
  otherTeacherEmail,
  requireCredentials,
  responseData,
  teacherEmail,
  teacherPassword,
  uiLogin,
  uniqueSuffix,
} from "./helpers";

interface Identifier {
  id: string;
}

interface ClassGroup extends Identifier {
  name: string;
  fee_plans: Array<Identifier>;
}

interface Occurrence extends Identifier {
  version: number;
}

interface Session extends Identifier {
  version: number;
  occurrence_status: string;
  student_attendance: Array<{ id: string }>;
}

interface Period extends Identifier {
  month: string;
}

interface Invoice extends Identifier {
  amount_due_rupiah: number;
}

interface Payment extends Identifier {
  version: number;
  status: string;
}

async function getList<T>(request: APIRequestContext, path: string) {
  return responseData<T[]>(await request.get(path));
}

test.beforeEach(({ page }, testInfo) => {
  void page;
  test.skip(
    testInfo.project.name === "mobile",
    "Alur mutasi penuh dijalankan sekali pada desktop.",
  );
  requireCredentials();
});

test("@smoke admin login dan mengelola rombel serta siswa", async ({
  page,
}) => {
  await uiLogin(page, adminEmail, adminPassword);
  await expect(page.getByRole("button", { name: "Finance" })).toBeVisible();

  const suffix = uniqueSuffix();
  const headers = await mutationHeaders(page.request);
  const rooms = await getList<Identifier>(
    page.request,
    "/api/v1/rooms/?page_size=100",
  );
  const createdClass = await responseData<ClassGroup>(
    await page.request.post("/api/v1/class-groups/", {
      headers,
      data: {
        name: `Rombel E2E ${suffix}`,
        level: "9 SMP",
        default_room: rooms[0].id,
        is_active: true,
      },
    }),
  );
  await responseData(
    await page.request.post("/api/v1/enrollments/roster-batch/", {
      headers: await mutationHeaders(page.request),
      data: {
        class_group_id: createdClass.id,
        items: [
          {
            full_name: `Siswa E2E ${suffix}`,
            school: "SMP Negeri 1 Nganjuk",
            grade_level: "9 SMP",
            fee_plan_id: createdClass.fee_plans[0].id,
            started_on: jakartaDate(),
            action: "upsert",
          },
        ],
      },
    }),
  );

  await page.getByRole("button", { name: "Student" }).click();
  await expect(page).toHaveURL(/\/rombel$/);
  await expect(
    page.getByText(createdClass.name, { exact: true }),
  ).toBeVisible();
  await page.getByText(createdClass.name, { exact: true }).click();
  await expect(
    page.getByText(`Siswa E2E ${suffix}`, { exact: true }),
  ).toBeVisible();
});

test("admin membuat jadwal berulang dan bentrok ditolak dengan 409", async ({
  request,
}) => {
  await apiLogin(request, adminEmail, adminPassword);
  const [classes, subjects, teachers, rooms] = await Promise.all([
    getList<Identifier>(request, "/api/v1/class-groups/?page_size=100"),
    getList<Identifier>(request, "/api/v1/subjects/?page_size=100"),
    getList<Identifier>(request, "/api/v1/teachers/?page_size=100"),
    getList<Identifier>(request, "/api/v1/rooms/?page_size=100"),
  ]);
  const suffix = uniqueSuffix();
  const secondOfDay = Math.floor(Date.now() / 1000) % 80_000;
  const hour = Math.floor(secondOfDay / 3600);
  const minute = Math.floor((secondOfDay % 3600) / 60);
  const second = secondOfDay % 60;
  const time = [hour, minute, second]
    .map((value) => String(value).padStart(2, "0"))
    .join(":");
  const endTime = new Date(`2031-01-06T${time}+07:00`);
  endTime.setUTCSeconds(endTime.getUTCSeconds() + 30);
  const start = `2031-01-06T${time}+07:00`;
  const end = endTime.toISOString();
  const payload = {
    class_group: classes[0].id,
    subject: subjects[0].id,
    teacher: teachers[0].id,
    room: rooms[0].id,
    start_at: start,
    end_at: end,
    interval_weeks: 1,
    occurrence_count: 3,
  };
  const created = await responseData<{ occurrences: Occurrence[] }>(
    await request.post("/api/v1/schedule-series/", {
      headers: await mutationHeaders(request, `e2e-series-${suffix}`),
      data: payload,
    }),
  );
  expect(created.occurrences).toHaveLength(3);

  const collision = await request.post("/api/v1/schedule-series/", {
    headers: await mutationHeaders(request, `e2e-collision-${suffix}`),
    data: payload,
  });
  expect(collision.status()).toBe(409);
  expect((await collision.json()).error.code).toBe("SCHEDULE_CONFLICT");
});

test("guru menjalankan sesi sampai selesai dan guru lain ditolak", async ({
  playwright,
}) => {
  const baseURL = "http://127.0.0.1:5173";
  const admin = await playwright.request.newContext({ baseURL });
  const assigned = await playwright.request.newContext({ baseURL });
  const other = await playwright.request.newContext({ baseURL });
  try {
    await apiLogin(admin, adminEmail, adminPassword);
    const [classes, subjects, teachers, rooms] = await Promise.all([
      getList<Identifier>(admin, "/api/v1/class-groups/?page_size=100"),
      getList<Identifier>(admin, "/api/v1/subjects/?page_size=100"),
      getList<Identifier & { email: string }>(
        admin,
        "/api/v1/teachers/?page_size=100",
      ),
      getList<Identifier>(admin, "/api/v1/rooms/?page_size=100"),
    ]);
    const selectedTeacher = teachers.find(
      (item) => item.email === teacherEmail,
    )!;
    const suffix = uniqueSuffix();
    const today = jakartaDate();
    const sessionSecond = Math.floor(Date.now() / 1000) % 50;
    const sessionStart = `00:00:${String(sessionSecond).padStart(2, "0")}`;
    const sessionEnd = `00:00:${String(sessionSecond + 2).padStart(2, "0")}`;
    const created = await responseData<{ occurrences: Occurrence[] }>(
      await admin.post("/api/v1/schedule-series/", {
        headers: await mutationHeaders(admin, `e2e-session-series-${suffix}`),
        data: {
          class_group: classes[0].id,
          subject: subjects[0].id,
          teacher: selectedTeacher.id,
          room: rooms[0].id,
          start_at: `${today}T${sessionStart}+07:00`,
          end_at: `${today}T${sessionEnd}+07:00`,
          occurrence_count: 1,
          interval_weeks: 1,
        },
      }),
    );
    const occurrence = created.occurrences[0];

    await apiLogin(other, otherTeacherEmail, teacherPassword);
    const forbidden = await other.post(
      `/api/v1/schedule-occurrences/${occurrence.id}/start/`,
      {
        headers: await mutationHeaders(other, `e2e-other-${suffix}`),
        data: { expected_version: occurrence.version },
      },
    );
    expect(forbidden.status()).toBe(403);

    await apiLogin(assigned, teacherEmail, teacherPassword);
    let session = await responseData<Session>(
      await assigned.post(
        `/api/v1/schedule-occurrences/${occurrence.id}/start/`,
        {
          headers: await mutationHeaders(assigned, `e2e-start-${suffix}`),
          data: { expected_version: occurrence.version },
        },
      ),
    );
    session = await responseData<Session>(
      await assigned.put(`/api/v1/sessions/${session.id}/lesson-report/`, {
        headers: await mutationHeaders(assigned),
        data: {
          expected_version: session.version,
          topic: "Materi E2E",
          material_description:
            "Catatan materi terintegrasi dari pengujian browser.",
          learning_notes: "Semua siswa mengikuti latihan.",
          homework: "Latihan mandiri.",
        },
      }),
    );
    session = await responseData<Session>(
      await assigned.put(`/api/v1/sessions/${session.id}/attendance/`, {
        headers: await mutationHeaders(assigned),
        data: {
          expected_version: session.version,
          attendance: session.student_attendance.map((row) => ({
            id: row.id,
            status: "PRESENT",
            note: "",
          })),
        },
      }),
    );
    session = await responseData<Session>(
      await assigned.post(`/api/v1/sessions/${session.id}/complete/`, {
        headers: await mutationHeaders(assigned, `e2e-complete-${suffix}`),
        data: { expected_version: session.version },
      }),
    );
    expect(session.occurrence_status).toBe("COMPLETED");

    const reopened = await responseData<Session>(
      await admin.post(`/api/v1/sessions/${session.id}/reopen/`, {
        headers: await mutationHeaders(admin),
        data: { reason: "Verifikasi koreksi E2E" },
      }),
    );
    expect(reopened.occurrence_status).toBe("IN_PROGRESS");
  } finally {
    await Promise.all([admin.dispose(), assigned.dispose(), other.dispose()]);
  }
});

test("admin membuat periode, mencatat cicilan, mengunggah bukti, dan memverifikasi", async ({
  request,
}) => {
  await apiLogin(request, adminEmail, adminPassword);
  const periods = await getList<Period>(
    request,
    "/api/v1/billing-periods/?page_size=100",
  );
  let year = 2032;
  while (periods.some((item) => item.month === `${year}-01-01`)) year += 1;
  const suffix = uniqueSuffix();
  const period = await responseData<Period>(
    await request.post("/api/v1/billing-periods/", {
      headers: await mutationHeaders(request, `e2e-period-${suffix}`),
      data: { month: `${year}-01-01`, due_date: `${year}-01-10` },
    }),
  );
  const invoices = await getList<Invoice>(
    request,
    `/api/v1/invoices/?period=${period.id}&page_size=100`,
  );
  expect(invoices.length).toBeGreaterThan(0);
  const invoice = invoices[0];
  const amount = Math.min(50_000, Math.floor(invoice.amount_due_rupiah / 2));
  const payment = await responseData<Payment>(
    await request.post("/api/v1/payment-transactions/", {
      headers: await mutationHeaders(request, `e2e-payment-${suffix}`),
      multipart: {
        invoice: invoice.id,
        amount_rupiah: String(amount),
        paid_on: `${year}-01-03`,
        method: "Transfer Bank",
        reference: `E2E-${suffix}`,
        note: "Cicilan pengujian end-to-end",
        proof_file: {
          name: "proof.png",
          mimeType: "image/png",
          buffer: Buffer.concat([
            Buffer.from("89504e470d0a1a0a", "hex"),
            Buffer.from("e2e-proof"),
          ]),
        },
      },
    }),
  );
  expect(payment.status).toBe("PENDING");
  const verified = await responseData<Payment>(
    await request.post(`/api/v1/payment-transactions/${payment.id}/verify/`, {
      headers: await mutationHeaders(request, `e2e-verify-${suffix}`),
      data: { expected_version: payment.version },
    }),
  );
  expect(verified.status).toBe("VERIFIED");
});

test("@smoke guru tidak dapat membuka Finance", async ({ page }) => {
  await uiLogin(page, teacherEmail, teacherPassword);
  await expect(page.getByRole("button", { name: "Finance" })).toHaveCount(0);
  await page.goto("/finance");
  await expect(page).toHaveURL(/\/dashboard$/);
});
