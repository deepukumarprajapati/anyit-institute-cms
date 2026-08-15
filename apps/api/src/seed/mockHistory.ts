// @ts-nocheck
/**
 * Generates dense mock operational history for the last ~2 years through today.
 */
export function isoDate(d: Date) {
  return d.toISOString().slice(0, 10);
}

export function monthKey(d: Date) {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function addMonths(d: Date, n: number) {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  x.setUTCMonth(x.getUTCMonth() + n);
  return x;
}

export function eachMonthKeys(from: Date, to: Date) {
  const keys: string[] = [];
  let cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), 1));
  while (cur <= end) {
    keys.push(monthKey(cur));
    cur = addMonths(cur, 1);
  }
  return keys;
}

/** Weekdays (Mon–Fri) from fromDate..toDate inclusive (UTC date parts). */
export function eachWeekday(from: Date, to: Date, holidaySet: Set<string>) {
  const out: string[] = [];
  const cur = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cur <= end) {
    const dow = cur.getUTCDay();
    const key = isoDate(cur);
    if (dow !== 0 && dow !== 6 && !holidaySet.has(key)) out.push(key);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

export function sessionForDate(dateStr: string, sessions: { id: any; start: string; end: string }[]) {
  for (const s of sessions) {
    if (dateStr >= s.start && dateStr <= s.end) return s.id;
  }
  return sessions[sessions.length - 1]?.id;
}

export function gradeFromPct(pct: number) {
  if (pct >= 90) return 'A+';
  if (pct >= 80) return 'A';
  if (pct >= 70) return 'B+';
  if (pct >= 60) return 'B';
  if (pct >= 50) return 'C';
  return 'D';
}

export async function seedTwoYearHistory(ctx: {
  institute: any;
  campuses: Record<string, any>;
  sessions: { id: any; name: string; start: string; end: string; isActive?: boolean }[];
  classes: Record<string, any>;
  sectionsByClass: Record<string, Record<string, any>>;
  feeHeads: Record<string, any>;
  studentsByAdmission: Record<string, any>;
  studentDefs: {
    admissionNo: string;
    classCode: string;
    section: string;
    firstName: string;
  }[];
  staffByCode: Record<string, any>;
  salaryDefs: Record<
    string,
    { basic: number; allowances: { name: string; amount: number }[]; deductions: { name: string; amount: number }[] }
  >;
  FeeInvoice: any;
  FeePayment: any;
  StudentAttendance: any;
  StaffAttendance: any;
  Holiday: any;
  Event: any;
  EventParticipation: any;
  Complaint: any;
  MedicalRecord: any;
  AcademicMark: any;
  UnitTestReport: any;
  Payroll: any;
  transportAdmissionNos: string[];
}) {
  const {
    institute,
    campuses,
    sessions,
    classes,
    sectionsByClass,
    feeHeads,
    studentsByAdmission,
    studentDefs,
    staffByCode,
    salaryDefs,
    FeeInvoice,
    FeePayment,
    StudentAttendance,
    StaffAttendance,
    Holiday,
    Event,
    EventParticipation,
    Complaint,
    MedicalRecord,
    AcademicMark,
    UnitTestReport,
    Payroll,
    transportAdmissionNos,
  } = ctx;

  const today = new Date();
  const to = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const from = new Date(Date.UTC(to.getUTCFullYear() - 2, to.getUTCMonth(), to.getUTCDate()));

  console.log(`[seed] history window ${isoDate(from)} → ${isoDate(to)}`);

  // --- Holidays (both calendar years in range) ---
  const holidayDefs = [
    { name: 'Independence Day', date: '2024-08-15', type: 'holiday' },
    { name: 'Gandhi Jayanti', date: '2024-10-02', type: 'holiday' },
    { name: 'Diwali', date: '2024-10-31', type: 'holiday' },
    { name: 'Diwali Break', date: '2024-11-01', type: 'event_off' },
    { name: 'Christmas', date: '2024-12-25', type: 'holiday' },
    { name: 'Republic Day', date: '2025-01-26', type: 'holiday' },
    { name: 'Holi', date: '2025-03-14', type: 'holiday' },
    { name: 'Independence Day', date: '2025-08-15', type: 'holiday' },
    { name: 'Gandhi Jayanti', date: '2025-10-02', type: 'holiday' },
    { name: 'Diwali', date: '2025-10-20', type: 'holiday' },
    { name: 'Diwali Break', date: '2025-10-21', type: 'event_off' },
    { name: 'Christmas', date: '2025-12-25', type: 'holiday' },
    { name: 'Republic Day', date: '2026-01-26', type: 'holiday' },
    { name: 'Holi', date: '2026-03-03', type: 'holiday' },
    { name: 'Independence Day', date: '2026-08-15', type: 'holiday' },
  ];
  const holidaySet = new Set<string>();
  for (const h of holidayDefs) {
    holidaySet.add(h.date);
    await Holiday.findOneAndUpdate(
      { instituteId: institute._id, date: h.date },
      {
        $set: { name: h.name, type: h.type, deletedAt: null },
        $setOnInsert: { instituteId: institute._id, date: h.date },
      },
      { upsert: true }
    );
  }
  console.log('[seed] holidays upserted:', holidayDefs.length);

  // --- Events across 2 years + a couple upcoming ---
  const eventDefs = [
    {
      title: 'Sports Day 2024',
      description: 'Track and field events for all classes.',
      location: 'Main Campus Ground',
      startAt: new Date('2024-12-05T09:00:00+05:30'),
      endAt: new Date('2024-12-05T15:00:00+05:30'),
      audience: 'all',
      campusCode: 'MAIN',
    },
    {
      title: 'Annual Day 2024',
      description: 'Cultural night and prize distribution.',
      location: 'Main Campus Auditorium',
      startAt: new Date('2025-01-18T10:00:00+05:30'),
      endAt: new Date('2025-01-18T16:00:00+05:30'),
      audience: 'all',
      campusCode: 'MAIN',
    },
    {
      title: 'Science Fair 2025',
      description: 'Student project exhibition.',
      location: 'East Campus Lab Block',
      startAt: new Date('2025-02-14T09:30:00+05:30'),
      endAt: new Date('2025-02-14T15:00:00+05:30'),
      audience: 'students',
      campusCode: 'EAST',
    },
    {
      title: 'Parent-Teacher Meeting — Term 2 (2024-25)',
      description: 'Discuss academic progress.',
      location: 'Main Campus Classrooms',
      startAt: new Date('2025-02-28T09:00:00+05:30'),
      endAt: new Date('2025-02-28T13:00:00+05:30'),
      audience: 'parents',
      campusCode: 'MAIN',
    },
    {
      title: 'Staff Development Workshop 2025',
      description: 'Pedagogy workshop.',
      location: 'Main Campus Conference Room',
      startAt: new Date('2025-08-25T14:00:00+05:30'),
      endAt: new Date('2025-08-25T17:00:00+05:30'),
      audience: 'staff',
      campusCode: 'MAIN',
    },
    {
      title: 'Parent-Teacher Meeting — Term 1',
      description: 'Discuss academic progress for Classes 1–4.',
      location: 'Main Campus Classrooms',
      startAt: new Date('2025-09-20T09:00:00+05:30'),
      endAt: new Date('2025-09-20T13:00:00+05:30'),
      audience: 'parents',
      campusCode: 'MAIN',
    },
    {
      title: 'Science Fair',
      description: 'Student project exhibition and demos.',
      location: 'East Campus Lab Block',
      startAt: new Date('2025-11-08T09:30:00+05:30'),
      endAt: new Date('2025-11-08T15:00:00+05:30'),
      audience: 'students',
      campusCode: 'EAST',
    },
    {
      title: 'Annual Day 2025',
      description: 'Cultural performances and prize distribution.',
      location: 'Main Campus Auditorium',
      startAt: new Date('2025-12-12T10:00:00+05:30'),
      endAt: new Date('2025-12-12T16:00:00+05:30'),
      audience: 'all',
      campusCode: 'MAIN',
    },
    {
      title: 'Republic Day Parade Practice',
      description: 'Student march past rehearsal.',
      location: 'Main Campus Ground',
      startAt: new Date('2026-01-20T08:00:00+05:30'),
      endAt: new Date('2026-01-20T11:00:00+05:30'),
      audience: 'students',
      campusCode: 'MAIN',
    },
    {
      title: 'Inter-House Quiz 2026',
      description: 'Academic quiz across houses.',
      location: 'East Campus Hall',
      startAt: new Date('2026-07-18T10:00:00+05:30'),
      endAt: new Date('2026-07-18T13:00:00+05:30'),
      audience: 'students',
      campusCode: 'EAST',
    },
    {
      title: 'Parent Orientation 2026',
      description: 'Welcome session for parents.',
      location: 'Main Campus Auditorium',
      startAt: new Date('2026-08-20T10:00:00+05:30'),
      endAt: new Date('2026-08-20T12:00:00+05:30'),
      audience: 'parents',
      campusCode: 'MAIN',
    },
    {
      title: 'Teachers Day Celebration',
      description: 'Student performances for teachers.',
      location: 'Main Campus Auditorium',
      startAt: new Date('2026-09-05T11:00:00+05:30'),
      endAt: new Date('2026-09-05T14:00:00+05:30'),
      audience: 'all',
      campusCode: 'MAIN',
    },
  ];
  const eventsByTitle: Record<string, any> = {};
  for (const ev of eventDefs) {
    const doc = await Event.findOneAndUpdate(
      { instituteId: institute._id, title: ev.title },
      {
        $set: {
          description: ev.description,
          location: ev.location,
          startAt: ev.startAt,
          endAt: ev.endAt,
          audience: ev.audience,
          campusId: campuses[ev.campusCode]._id,
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, title: ev.title },
      },
      { upsert: true, new: true }
    );
    eventsByTitle[ev.title] = doc;
  }
  console.log('[seed] events upserted:', eventDefs.length);

  // --- Monthly fees for every student (2 years) ---
  const months = eachMonthKeys(from, to);
  const transportSet = new Set(transportAdmissionNos);
  let invoiceCount = 0;
  let paymentCount = 0;

  for (const [sIdx, def] of studentDefs.entries()) {
    const student = studentsByAdmission[def.admissionNo];
    for (const [mIdx, month] of months.entries()) {
      const [y, m] = month.split('-').map(Number);
      const midDate = `${month}-15`;
      const sessionId = sessionForDate(midDate, sessions);
      const invoiceNo = `INV-M-${def.admissionNo}-${month}`;
      const tuition = 4000 + (parseInt(def.classCode.replace('C', ''), 10) || 1) * 200;
      const items: any[] = [
        {
          name: 'Monthly Tuition',
          amount: tuition,
          category: 'tuition',
          feeHeadId: feeHeads.TUITION._id,
          billingMonth: month,
        },
      ];
      if (transportSet.has(def.admissionNo)) {
        items.push({
          name: 'Transport',
          amount: 1600 + (sIdx % 3) * 100,
          category: 'transport',
          feeHeadId: feeHeads.TRANSPORT._id,
          billingMonth: month,
        });
      }
      if (m === 4) {
        items.push({
          name: 'Annual charges',
          amount: 5000,
          category: 'annual',
          feeHeadId: feeHeads.ANNUAL._id,
          billingMonth: month,
        });
      }
      if (m === 7 || m === 12) {
        items.push({
          name: m === 12 ? 'Annual Day Event' : 'Sports Day Event',
          amount: 1000 + (sIdx % 4) * 100,
          category: 'event',
          feeHeadId: feeHeads.EVENT._id,
          billingMonth: month,
        });
      }
      if (m === 6 && sIdx % 2 === 0) {
        items.push({
          name: 'Dress / Uniform',
          amount: 2200,
          category: 'dress',
          feeHeadId: feeHeads.DRESS._id,
          billingMonth: month,
        });
      }

      const totalAmount = items.reduce((s, i) => s + i.amount, 0);
      const sessMeta = sessions.find((s) => String(s.id) === String(sessionId));
      const pastSession = Boolean(sessMeta && sessMeta.isActive === false);
      // Past academic years are closed on promotion — always fully paid in history.
      // Only the active (current) session keeps open / partial dues for demo.
      let status: 'paid' | 'partial' | 'issued' = 'paid';
      let paidAmount = totalAmount;
      if (!pastSession) {
        const age = months.length - 1 - mIdx;
        if (age <= 1) {
          status = 'issued';
          paidAmount = 0;
        } else if (age <= 3 || (sIdx + mIdx) % 7 === 0) {
          status = 'partial';
          paidAmount = Math.round(totalAmount * 0.4);
        }
      }

      const invoice = await FeeInvoice.findOneAndUpdate(
        { instituteId: institute._id, invoiceNo },
        {
          $set: {
            studentId: student._id,
            sessionId,
            billingMonth: month,
            dueDate: new Date(Date.UTC(y, m - 1, 10)),
            items,
            discount: 0,
            lateFee: 0,
            totalAmount,
            paidAmount,
            status,
            deletedAt: null,
          },
          $setOnInsert: { instituteId: institute._id, invoiceNo },
        },
        { upsert: true, new: true }
      );
      invoiceCount += 1;

      if (paidAmount > 0) {
        const receiptNo = `RCP-M-${def.admissionNo}-${month}`;
        const methods = ['upi', 'cash', 'card', 'bank'] as const;
        await FeePayment.findOneAndUpdate(
          { instituteId: institute._id, receiptNo },
          {
            $set: {
              invoiceId: invoice._id,
              studentId: student._id,
              amount: paidAmount,
              method: methods[(sIdx + mIdx) % methods.length],
              reference: status === 'paid' ? `AUTO-${month}-${def.admissionNo}` : undefined,
              paidAt: new Date(Date.UTC(y, m - 1, 12 + (sIdx % 10))),
              paymentBatchId: receiptNo,
              deletedAt: null,
            },
            $setOnInsert: { instituteId: institute._id, receiptNo },
          },
          { upsert: true }
        );
        paymentCount += 1;
      }
    }
  }
  console.log(`[seed] monthly fees upserted: invoices=${invoiceCount}, payments=${paymentCount}`);

  // --- Payroll every month for 2 years ---
  let payrollCount = 0;
  for (const [code, sal] of Object.entries(salaryDefs)) {
    const staff = staffByCode[code];
    if (!staff) continue;
    const allowancesTotal = sal.allowances.reduce((s, a) => s + a.amount, 0);
    const deductionsTotal = sal.deductions.reduce((s, d) => s + d.amount, 0);
    const netPay = sal.basic + allowancesTotal - deductionsTotal;
    for (const [mIdx, month] of months.entries()) {
      const age = months.length - 1 - mIdx;
      const isPaid = age >= 1;
      await Payroll.findOneAndUpdate(
        { instituteId: institute._id, staffId: staff._id, month },
        {
          $set: {
            basic: sal.basic,
            allowancesTotal,
            deductionsTotal,
            netPay,
            status: isPaid ? 'paid' : 'processed',
            paidAt: isPaid ? new Date(`${month}-28T00:00:00.000Z`) : undefined,
            deletedAt: null,
          },
          $setOnInsert: { instituteId: institute._id, staffId: staff._id, month },
        },
        { upsert: true }
      );
      payrollCount += 1;
    }
  }
  console.log('[seed] payroll months upserted:', payrollCount);

  // --- Attendance: all weekdays in window (sampled density for older months) ---
  const allWeekdays = eachWeekday(from, to, holidaySet);
  // Dense last 45 school days; earlier: Mon/Wed/Fri only to keep seed fast but still rich
  const recentCut = allWeekdays.slice(-45);
  const older = allWeekdays.slice(0, Math.max(0, allWeekdays.length - 45)).filter((d) => {
    const dow = new Date(`${d}T12:00:00.000Z`).getUTCDay();
    return dow === 1 || dow === 3 || dow === 5;
  });
  const attendanceDates = [...older, ...recentCut];
  const studentStatuses = ['present', 'present', 'present', 'late', 'present', 'absent', 'half_day'] as const;
  const staffStatuses = ['present', 'present', 'present', 'late', 'present', 'half_day'] as const;

  let studentAttendanceCount = 0;
  for (const [idx, def] of studentDefs.entries()) {
    const student = studentsByAdmission[def.admissionNo];
    for (const [dIdx, date] of attendanceDates.entries()) {
      const status = studentStatuses[(idx + dIdx) % studentStatuses.length];
      const sessionId = sessionForDate(date, sessions);
      // class based on current def (simplified)
      await StudentAttendance.findOneAndUpdate(
        { instituteId: institute._id, studentId: student._id, date },
        {
          $set: {
            sessionId,
            classId: classes[def.classCode]._id,
            sectionId: sectionsByClass[def.classCode][def.section]._id,
            status,
            remark: status === 'absent' ? 'Leave informed' : status === 'late' ? 'Arrived after assembly' : undefined,
            deletedAt: null,
          },
          $setOnInsert: { instituteId: institute._id, studentId: student._id, date },
        },
        { upsert: true }
      );
      studentAttendanceCount += 1;
    }
  }

  let staffAttendanceCount = 0;
  const staffCodes = Object.keys(staffByCode);
  for (const [idx, code] of staffCodes.entries()) {
    for (const [dIdx, date] of attendanceDates.entries()) {
      const status = staffStatuses[(idx + dIdx) % staffStatuses.length];
      await StaffAttendance.findOneAndUpdate(
        { instituteId: institute._id, staffId: staffByCode[code]._id, date },
        {
          $set: { status, deletedAt: null },
          $setOnInsert: { instituteId: institute._id, staffId: staffByCode[code]._id, date },
        },
        { upsert: true }
      );
      staffAttendanceCount += 1;
    }
  }
  console.log(
    `[seed] attendance upserted: students=${studentAttendanceCount}, staff=${staffAttendanceCount}, days=${attendanceDates.length}`
  );

  // --- Profile history for every student / both sessions ---
  const subjects = ['English', 'Mathematics', 'Science', 'EVS', 'Hindi'];
  const bloodGroups = ['A+', 'B+', 'O+', 'AB+', 'A-', 'B+'];
  let complaintCount = 0;
  let medicalCount = 0;
  let markCount = 0;
  let unitCount = 0;
  let participationCount = 0;

  for (const [sIdx, def] of studentDefs.entries()) {
    const student = studentsByAdmission[def.admissionNo];

    for (const sess of sessions) {
      // Medical once per session
      const medDate =
        sess.name === '2024-25'
          ? new Date('2024-09-10T00:00:00.000Z')
          : sess.name === '2025-26'
            ? new Date('2025-07-15T00:00:00.000Z')
            : new Date('2026-05-20T00:00:00.000Z');
      if (isoDate(medDate) <= isoDate(to) && isoDate(medDate) >= isoDate(from)) {
        await MedicalRecord.findOneAndUpdate(
          {
            instituteId: institute._id,
            studentId: student._id,
            sessionId: sess.id,
            recordDate: medDate,
          },
          {
            $set: {
              bloodGroup: bloodGroups[sIdx % bloodGroups.length],
              heightCm: 110 + sIdx * 3 + (sess.name === '2024-25' ? 0 : 4),
              weightKg: 20 + sIdx + (sess.name === '2024-25' ? 0 : 2),
              allergies: sIdx % 3 === 0 ? ['Peanuts'] : sIdx % 5 === 0 ? ['Dust'] : [],
              conditions: sIdx % 4 === 0 ? ['Mild asthma'] : [],
              medications: sIdx % 4 === 0 ? ['Inhaler as needed'] : [],
              notes: `Annual health check (${sess.name})`,
              doctorName: sIdx % 2 === 0 ? 'R. Sharma' : 'P. Mehta',
              deletedAt: null,
            },
            $setOnInsert: { instituteId: institute._id, studentId: student._id, sessionId: sess.id },
          },
          { upsert: true }
        );
        medicalCount += 1;
      }

      // Complaints (1–2 per session)
      const complaintTitles = [
        {
          title: `Homework follow-up (${sess.name})`,
          category: 'academic',
          status: 'resolved',
          raisedBy: 'Subject teacher',
        },
        {
          title: `Late arrival note (${sess.name})`,
          category: 'behavior',
          status: sIdx % 2 === 0 ? 'closed' : 'in_progress',
          raisedBy: 'Class teacher',
        },
        {
          title: `Transport query (${sess.name})`,
          category: 'transport',
          status: 'resolved',
          raisedBy: 'Parent',
        },
      ];
      const pick = complaintTitles.filter((_, i) => (sIdx + i) % 2 === 0).slice(0, 2);
      for (const [cIdx, c] of pick.entries()) {
        const raisedOn = new Date(sess.start);
        raisedOn.setUTCMonth(raisedOn.getUTCMonth() + 2 + cIdx);
        if (isoDate(raisedOn) > isoDate(to)) continue;
        await Complaint.findOneAndUpdate(
          {
            instituteId: institute._id,
            studentId: student._id,
            sessionId: sess.id,
            title: c.title,
          },
          {
            $set: {
              category: c.category,
              description: `${c.title} for ${def.firstName}. Auto-generated demo history.`,
              status: c.status,
              raisedBy: c.raisedBy,
              raisedOn,
              resolution: c.status === 'in_progress' ? undefined : 'Discussed with guardian',
              resolvedOn: c.status === 'in_progress' ? undefined : new Date(raisedOn.getTime() + 5 * 86400000),
              deletedAt: null,
            },
            $setOnInsert: { instituteId: institute._id },
          },
          { upsert: true }
        );
        complaintCount += 1;
      }

      // Marks — Term 1 / Term 2 / Final where dates fit
      const examPlan = [
        { examName: 'Term 1', examType: 'term', offsetMonths: 5 },
        { examName: 'Term 2', examType: 'term', offsetMonths: 9 },
        { examName: 'Final', examType: 'final', offsetMonths: 11 },
      ];
      for (const exam of examPlan) {
        const examDate = new Date(sess.start);
        examDate.setUTCMonth(examDate.getUTCMonth() + exam.offsetMonths);
        if (isoDate(examDate) > isoDate(to) || isoDate(examDate) < isoDate(from)) continue;
        for (const [subIdx, subject] of subjects.slice(0, 4).entries()) {
          const maxMarks = exam.examType === 'final' ? 100 : 50;
          const obtained = Math.min(
            maxMarks,
            Math.round(maxMarks * (0.55 + ((sIdx + subIdx) % 5) * 0.08 + (subIdx % 3) * 0.03))
          );
          await AcademicMark.findOneAndUpdate(
            {
              instituteId: institute._id,
              studentId: student._id,
              sessionId: sess.id,
              examName: exam.examName,
              subject,
            },
            {
              $set: {
                examType: exam.examType,
                maxMarks,
                obtainedMarks: obtained,
                grade: gradeFromPct((obtained / maxMarks) * 100),
                examDate,
                remarks: obtained / maxMarks >= 0.8 ? 'Good performance' : 'Needs practice',
                deletedAt: null,
              },
              $setOnInsert: { instituteId: institute._id },
            },
            { upsert: true }
          );
          markCount += 1;
        }
      }

      // Unit tests — 4 units
      for (let u = 1; u <= 4; u += 1) {
        const testDate = new Date(sess.start);
        testDate.setUTCMonth(testDate.getUTCMonth() + 1 + u * 2);
        if (isoDate(testDate) > isoDate(to) || isoDate(testDate) < isoDate(from)) continue;
        const subject = subjects[u % subjects.length];
        const maxMarks = 20;
        const obtained = 10 + ((sIdx + u) % 10);
        await UnitTestReport.findOneAndUpdate(
          {
            instituteId: institute._id,
            studentId: student._id,
            sessionId: sess.id,
            unitName: `Unit ${u}`,
            subject,
          },
          {
            $set: {
              testDate,
              maxMarks,
              obtainedMarks: obtained,
              rank: ((sIdx + u) % 10) + 1,
              teacherRemark: obtained >= 16 ? 'Excellent' : 'Keep practicing',
              deletedAt: null,
            },
            $setOnInsert: { instituteId: institute._id },
          },
          { upsert: true }
        );
        unitCount += 1;
      }
    }

    // Event participation for student-facing events in range
    for (const ev of eventDefs) {
      if (ev.audience === 'staff' || ev.audience === 'parents') continue;
      const eventDate = isoDate(ev.startAt);
      if (eventDate < isoDate(from) || eventDate > isoDate(to)) continue;
      if ((sIdx + eventDate.length) % 3 === 0 && ev.audience !== 'all') continue;
      const sessionId = sessionForDate(eventDate, sessions);
      const roles = ['participant', 'volunteer', 'winner', 'audience'] as const;
      const role = roles[(sIdx + ev.title.length) % roles.length];
      await EventParticipation.findOneAndUpdate(
        {
          instituteId: institute._id,
          studentId: student._id,
          sessionId,
          eventTitle: ev.title,
        },
        {
          $set: {
            eventId: eventsByTitle[ev.title]?._id,
            eventDate: ev.startAt,
            role,
            attendance: sIdx % 9 === 0 ? 'absent' : 'present',
            result: role === 'winner' ? '1st / distinction' : role === 'participant' ? 'Participated' : undefined,
            remarks: 'Demo participation history',
            deletedAt: null,
          },
          $setOnInsert: { instituteId: institute._id },
        },
        { upsert: true }
      );
      participationCount += 1;
    }
  }

  console.log(
    `[seed] profile history: complaints=${complaintCount}, medical=${medicalCount}, marks=${markCount}, units=${unitCount}, participation=${participationCount}`
  );

  return { from: isoDate(from), to: isoDate(to) };
}
