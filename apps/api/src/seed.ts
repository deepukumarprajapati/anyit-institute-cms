// @ts-nocheck
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { DEFAULT_ROLE_KEYS, ROLE_PERMISSION_MAP, Permission } from '@anyit/shared';
import { connectDb } from './db/connect';
import { env } from './config/env';
import { Institute } from './models/Institute';
import { Campus } from './models/Campus';
import { Role } from './models/Role';
import { User } from './models/User';
import { AcademicSession } from './models/AcademicSession';
import { SchoolClass, Section, Subject, Floor, Classroom } from './models/Academic';
import { FeeHead, FeeStructure, FeeInvoice, FeePayment } from './models/Fee';
import { Student, Enrollment } from './models/Student';
import { Staff } from './models/Staff';
import { StudentAttendance, StaffAttendance, Holiday } from './models/Attendance';
import { SalaryStructure, Payroll } from './models/Salary';
import { Vehicle, TransportRoute, StudentTransport, TransportFeeTier } from './models/Transport';
import { Event } from './models/Event';
import {
  AcademicMark,
  Complaint,
  EventParticipation,
  MedicalRecord,
  UnitTestReport,
} from './models/StudentProfile';
import { seedTwoYearHistory } from './seed/mockHistory';

function roleName(key: string) {
  return key
    .split('_')
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

async function wipeDatabase() {
  const db = mongoose.connection.db;
  if (!db) throw new Error('DB not connected');
  await db.dropDatabase();
  console.log('[seed] database wiped — all collections removed');
}

async function seed() {
  await connectDb();

  const reset =
    process.argv.includes('--reset') ||
    process.env.SEED_RESET === '1' ||
    process.env.SEED_RESET === 'true';
  if (reset) {
    await wipeDatabase();
  }

  let institute = await Institute.findOne({ code: 'ANYIT' });
  if (!institute) {
    institute = await Institute.create({
      name: env.bootstrapInstituteName,
      code: 'ANYIT',
      email: env.bootstrapAdminEmail,
      settings: { timezone: 'Asia/Kolkata', currency: 'INR', academicYearLabel: '2026-27' },
    });
    console.log('[seed] institute created');
  } else {
    console.log('[seed] institute exists');
  }

  const campusDefs = [
    {
      name: 'Main Campus',
      code: 'MAIN',
      isPrimary: true,
      address: '12 Knowledge Park, Sector 62, Noida',
      phone: '+91-120-4001000',
    },
    {
      name: 'East Campus',
      code: 'EAST',
      isPrimary: false,
      address: '45 Learning Avenue, Indirapuram, Ghaziabad',
      phone: '+91-120-4002000',
    },
  ];
  const campuses: Record<string, typeof Campus.prototype> = {};
  for (const def of campusDefs) {
    const campus = await Campus.findOneAndUpdate(
      { instituteId: institute._id, code: def.code },
      {
        $set: {
          name: def.name,
          isPrimary: def.isPrimary,
          address: def.address,
          phone: def.phone,
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, code: def.code },
      },
      { upsert: true, new: true }
    );
    campuses[def.code] = campus!;
  }
  const campus = campuses.MAIN;
  console.log('[seed] campuses upserted:', Object.keys(campuses).join(', '));

  for (const key of DEFAULT_ROLE_KEYS) {
    const perms = ROLE_PERMISSION_MAP[key];
    await Role.findOneAndUpdate(
      { instituteId: institute._id, key },
      {
        $set: {
          name: roleName(key),
          permissions: perms === '*' ? (['*'] as unknown as Permission[]) : perms,
          isSystem: true,
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, key },
      },
      { upsert: true }
    );
  }
  console.log('[seed] roles upserted');

  const superRole = await Role.findOne({ instituteId: institute._id, key: 'super_admin' });
  if (!superRole) throw new Error('super_admin role missing');

  const existingAdmin = await User.findOne({
    instituteId: institute._id,
    email: env.bootstrapAdminEmail.toLowerCase(),
  });
  if (!existingAdmin) {
    await User.create({
      instituteId: institute._id,
      campusId: campus._id,
      email: env.bootstrapAdminEmail.toLowerCase(),
      name: 'Super Admin',
      passwordHash: await bcrypt.hash(env.bootstrapAdminPassword, 10),
      roleId: superRole._id,
      isActive: true,
    });
    console.log('[seed] admin user created:', env.bootstrapAdminEmail);
  } else {
    console.log('[seed] admin user already exists');
  }

  const demoUsers: { email: string; name: string; roleKey: string; password: string }[] = [
    { email: 'teacher@anyit.local', name: 'Demo Teacher', roleKey: 'teacher', password: 'Teacher@123' },
    { email: 'accountant@anyit.local', name: 'Demo Accountant', roleKey: 'accountant', password: 'Account@123' },
    { email: 'receptionist@anyit.local', name: 'Demo Receptionist', roleKey: 'receptionist', password: 'Recept@123' },
    { email: 'principal@anyit.local', name: 'Demo Principal', roleKey: 'principal', password: 'Principal@123' },
  ];
  for (const du of demoUsers) {
    const role = await Role.findOne({ instituteId: institute._id, key: du.roleKey });
    if (!role) continue;
    await User.findOneAndUpdate(
      { instituteId: institute._id, email: du.email },
      {
        $set: {
          name: du.name,
          passwordHash: await bcrypt.hash(du.password, 10),
          roleId: role._id,
          campusId: campus._id,
          isActive: true,
          deletedAt: null,
        },
        $setOnInsert: {
          instituteId: institute._id,
          email: du.email,
        },
      },
      { upsert: true }
    );
  }
  console.log('[seed] demo role users upserted');

  let session2425 = await AcademicSession.findOne({ instituteId: institute._id, name: '2024-25' });
  if (!session2425) {
    session2425 = await AcademicSession.create({
      instituteId: institute._id,
      name: '2024-25',
      startDate: new Date('2024-04-01'),
      endDate: new Date('2025-03-31'),
      isActive: false,
    });
    console.log('[seed] session 2024-25 created');
  } else {
    await AcademicSession.updateOne({ _id: session2425._id }, { $set: { isActive: false } });
  }

  let session2526 = await AcademicSession.findOne({ instituteId: institute._id, name: '2025-26' });
  if (!session2526) {
    session2526 = await AcademicSession.create({
      instituteId: institute._id,
      name: '2025-26',
      startDate: new Date('2025-04-01'),
      endDate: new Date('2026-03-31'),
      isActive: false,
    });
    console.log('[seed] session 2025-26 created');
  } else {
    await AcademicSession.updateOne(
      { _id: session2526._id },
      { $set: { isActive: false, endDate: new Date('2026-03-31') } }
    );
  }

  let session = await AcademicSession.findOne({ instituteId: institute._id, name: '2026-27' });
  if (!session) {
    session = await AcademicSession.create({
      instituteId: institute._id,
      name: '2026-27',
      startDate: new Date('2026-04-01'),
      endDate: new Date('2027-03-31'),
      isActive: true,
    });
    console.log('[seed] session 2026-27 created (active)');
  } else {
    await AcademicSession.updateOne({ _id: session._id }, { $set: { isActive: true } });
    console.log('[seed] session 2026-27 exists (active)');
  }

  const priorSession = session2526;
  await Institute.updateOne(
    { _id: institute._id },
    { $set: { 'settings.academicYearLabel': '2026-27' } }
  );

  const classDefs = [
    { name: 'Class 1', code: 'C1', order: 1 },
    { name: 'Class 2', code: 'C2', order: 2 },
    { name: 'Class 3', code: 'C3', order: 3 },
    { name: 'Class 4', code: 'C4', order: 4 },
  ];
  const classes: Record<string, NonNullable<Awaited<ReturnType<typeof SchoolClass.findOne>>>> = {};
  const sectionsByClass: Record<string, Record<string, NonNullable<Awaited<ReturnType<typeof Section.findOne>>>>> =
    {};

  for (const def of classDefs) {
    const cls = await SchoolClass.findOneAndUpdate(
      { instituteId: institute._id, code: def.code },
      { $set: { ...def, deletedAt: null }, $setOnInsert: { instituteId: institute._id } },
      { upsert: true, new: true }
    );
    classes[def.code] = cls!;
    sectionsByClass[def.code] = {};
    for (const sectionName of ['A', 'B']) {
      const section = await Section.findOneAndUpdate(
        { instituteId: institute._id, classId: cls!._id, name: sectionName },
        {
          $set: { capacity: 40, deletedAt: null },
          $setOnInsert: { instituteId: institute._id, classId: cls!._id, name: sectionName },
        },
        { upsert: true, new: true }
      );
      sectionsByClass[def.code][sectionName] = section!;
    }
  }
  console.log('[seed] classes & sections upserted');

  // Floors & classrooms, then link sections to rooms
  const floorDefs = [
    { name: 'Ground Floor', code: 'GF', level: 0, building: 'Block A' },
    { name: 'First Floor', code: 'FF', level: 1, building: 'Block A' },
    { name: 'Second Floor', code: 'SF', level: 2, building: 'Block B' },
  ];
  const floorsByCode: Record<string, any> = {};
  for (const def of floorDefs) {
    const doc = await Floor.findOneAndUpdate(
      { instituteId: institute._id, code: def.code },
      {
        $set: {
          name: def.name,
          level: def.level,
          building: def.building,
          campusId: campuses.MAIN._id,
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, code: def.code },
      },
      { upsert: true, new: true }
    );
    floorsByCode[def.code] = doc!;
  }

  const roomDefs = [
    { code: 'R101', name: 'Room 101', floor: 'GF', capacity: 40 },
    { code: 'R102', name: 'Room 102', floor: 'GF', capacity: 40 },
    { code: 'R201', name: 'Room 201', floor: 'FF', capacity: 42 },
    { code: 'R202', name: 'Room 202', floor: 'FF', capacity: 42 },
    { code: 'LAB1', name: 'Science Lab 1', floor: 'SF', capacity: 30, roomType: 'lab' },
    { code: 'R301', name: 'Room 301', floor: 'SF', capacity: 40 },
  ];
  const roomsByCode: Record<string, any> = {};
  for (const def of roomDefs) {
    const doc = await Classroom.findOneAndUpdate(
      { instituteId: institute._id, code: def.code },
      {
        $set: {
          name: def.name,
          floorId: floorsByCode[def.floor]._id,
          capacity: def.capacity,
          roomType: def.roomType || 'classroom',
          campusId: campuses.MAIN._id,
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, code: def.code },
      },
      { upsert: true, new: true }
    );
    roomsByCode[def.code] = doc!;
  }

  const sectionRoomMap: Record<string, string> = {
    'C1:A': 'R101',
    'C1:B': 'R102',
    'C2:A': 'R201',
    'C2:B': 'R202',
    'C3:A': 'R301',
    'C3:B': 'LAB1',
    'C4:A': 'R301',
    'C4:B': 'LAB1',
  };
  for (const [key, roomCode] of Object.entries(sectionRoomMap)) {
    const [classCode, sectionName] = key.split(':');
    const section = sectionsByClass[classCode]?.[sectionName];
    if (!section || !roomsByCode[roomCode]) continue;
    await Section.updateOne(
      { _id: section._id },
      { $set: { classroomId: roomsByCode[roomCode]._id, capacity: roomsByCode[roomCode].capacity || 40 } }
    );
  }
  console.log('[seed] floors & classrooms upserted:', Object.keys(roomsByCode).length);

  for (const sub of [
    { name: 'Mathematics', code: 'MATH' },
    { name: 'English', code: 'ENG' },
    { name: 'Science', code: 'SCI' },
    { name: 'Computer Science', code: 'CS' },
    { name: 'Hindi', code: 'HIN' },
  ]) {
    await Subject.findOneAndUpdate(
      { instituteId: institute._id, code: sub.code },
      { $set: { name: sub.name, deletedAt: null }, $setOnInsert: { instituteId: institute._id, code: sub.code } },
      { upsert: true }
    );
  }
  console.log('[seed] subjects upserted');

  const classIdList = Object.values(classes).map((c) => c._id);
  const feeHeadDefs = [
    {
      name: 'Tuition',
      code: 'TUITION',
      category: 'tuition' as const,
      applicability: 'class' as const,
      defaultAmount: 5000,
    },
    {
      name: 'Transport',
      code: 'TRANSPORT',
      category: 'transport' as const,
      applicability: 'transport' as const,
      isOptional: true,
    },
    {
      name: 'Dress / Uniform',
      code: 'DRESS',
      category: 'dress' as const,
      applicability: 'class' as const,
      isOptional: true,
      defaultAmount: 2000,
    },
    {
      name: 'Event Fee',
      code: 'EVENT',
      category: 'event' as const,
      applicability: 'adhoc' as const,
      isOptional: true,
    },
    {
      name: 'Lab',
      code: 'LAB',
      category: 'lab' as const,
      applicability: 'class' as const,
      defaultAmount: 800,
    },
    {
      name: 'Library',
      code: 'LIBRARY',
      category: 'library' as const,
      applicability: 'class' as const,
      defaultAmount: 400,
    },
    {
      name: 'Exam',
      code: 'EXAM',
      category: 'exam' as const,
      applicability: 'class' as const,
      defaultAmount: 500,
    },
    {
      name: 'Annual',
      code: 'ANNUAL',
      category: 'annual' as const,
      applicability: 'class' as const,
      defaultAmount: 5000,
    },
    {
      name: 'Fine / Penalty',
      code: 'FINE',
      category: 'fine' as const,
      applicability: 'adhoc' as const,
      isOptional: true,
    },
  ];
  const feeHeads: Record<string, NonNullable<Awaited<ReturnType<typeof FeeHead.findOne>>>> = {};
  for (const head of feeHeadDefs) {
    const doc = await FeeHead.findOneAndUpdate(
      { instituteId: institute._id, code: head.code },
      {
        $set: {
          name: head.name,
          category: head.category,
          applicability: head.applicability,
          classIds: head.applicability === 'class' ? classIdList : [],
          defaultAmount: head.defaultAmount ?? 0,
          isOptional: head.isOptional ?? false,
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, code: head.code },
      },
      { upsert: true, new: true }
    );
    feeHeads[head.code] = doc!;
  }
  console.log('[seed] fee heads upserted');

  // --- Staff ---
  const staffDefs = [
    {
      employeeCode: 'EMP001',
      firstName: 'Priya',
      lastName: 'Sharma',
      email: 'priya.sharma@anyit.local',
      phone: '+91-9810001001',
      department: 'Academics',
      designation: 'Principal',
      joiningDate: new Date('2018-06-01'),
      campusCode: 'MAIN',
    },
    {
      employeeCode: 'EMP002',
      firstName: 'Rahul',
      lastName: 'Verma',
      email: 'rahul.verma@anyit.local',
      phone: '+91-9810001002',
      department: 'Mathematics',
      designation: 'Senior Teacher',
      joiningDate: new Date('2019-07-15'),
      campusCode: 'MAIN',
    },
    {
      employeeCode: 'EMP003',
      firstName: 'Ananya',
      lastName: 'Iyer',
      email: 'ananya.iyer@anyit.local',
      phone: '+91-9810001003',
      department: 'Science',
      designation: 'Teacher',
      joiningDate: new Date('2021-04-01'),
      campusCode: 'MAIN',
    },
    {
      employeeCode: 'EMP004',
      firstName: 'Vikram',
      lastName: 'Singh',
      email: 'vikram.singh@anyit.local',
      phone: '+91-9810001004',
      department: 'Accounts',
      designation: 'Accountant',
      joiningDate: new Date('2020-01-10'),
      campusCode: 'MAIN',
    },
    {
      employeeCode: 'EMP005',
      firstName: 'Neha',
      lastName: 'Gupta',
      email: 'neha.gupta@anyit.local',
      phone: '+91-9810001005',
      department: 'Administration',
      designation: 'Receptionist',
      joiningDate: new Date('2022-08-20'),
      campusCode: 'EAST',
    },
    {
      employeeCode: 'EMP006',
      firstName: 'Amit',
      lastName: 'Khan',
      email: 'amit.khan@anyit.local',
      phone: '+91-9810001006',
      department: 'Computer Science',
      designation: 'Teacher',
      joiningDate: new Date('2023-03-01'),
      campusCode: 'EAST',
    },
  ];

  const staffByCode: Record<string, NonNullable<Awaited<ReturnType<typeof Staff.findOne>>>> = {};
  for (const def of staffDefs) {
    const campusId = campuses[def.campusCode]._id;
    const doc = await Staff.findOneAndUpdate(
      { instituteId: institute._id, employeeCode: def.employeeCode },
      {
        $set: {
          firstName: def.firstName,
          lastName: def.lastName,
          email: def.email,
          phone: def.phone,
          department: def.department,
          designation: def.designation,
          joiningDate: def.joiningDate,
          campusId,
          status: 'active',
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, employeeCode: def.employeeCode },
      },
      { upsert: true, new: true }
    );
    staffByCode[def.employeeCode] = doc!;
  }
  console.log('[seed] staff upserted:', Object.keys(staffByCode).length);

  // --- Students + enrollments ---
  const studentDefs = [
    {
      admissionNo: 'ADM25001',
      firstName: 'Aarav',
      lastName: 'Mehta',
      gender: 'male',
      dob: new Date('2018-05-12'),
      phone: '+91-9876500001',
      email: 'parent.mehta@example.com',
      address: 'Flat 12, Green Residency, Noida',
      classCode: 'C1',
      section: 'A',
      rollNo: '1',
      campusCode: 'MAIN',
      guardian: { name: 'Suresh Mehta', relation: 'Father', phone: '+91-9876500001', isPrimary: true },
    },
    {
      admissionNo: 'ADM25002',
      firstName: 'Diya',
      lastName: 'Patel',
      gender: 'female',
      dob: new Date('2018-09-03'),
      phone: '+91-9876500002',
      address: 'B-44, Lotus Colony, Noida',
      classCode: 'C1',
      section: 'A',
      rollNo: '2',
      campusCode: 'MAIN',
      guardian: { name: 'Kavita Patel', relation: 'Mother', phone: '+91-9876500002', isPrimary: true },
    },
    {
      admissionNo: 'ADM25003',
      firstName: 'Ishaan',
      lastName: 'Reddy',
      gender: 'male',
      dob: new Date('2018-01-22'),
      phone: '+91-9876500003',
      address: '14 Palm Street, Indirapuram',
      classCode: 'C1',
      section: 'B',
      rollNo: '1',
      campusCode: 'EAST',
      guardian: { name: 'Ravi Reddy', relation: 'Father', phone: '+91-9876500003', isPrimary: true },
    },
    {
      admissionNo: 'ADM25004',
      firstName: 'Saanvi',
      lastName: 'Kapoor',
      gender: 'female',
      dob: new Date('2017-11-18'),
      phone: '+91-9876500004',
      address: 'C-8, Horizon Apartments, Noida',
      classCode: 'C2',
      section: 'A',
      rollNo: '1',
      campusCode: 'MAIN',
      guardian: { name: 'Anita Kapoor', relation: 'Mother', phone: '+91-9876500004', isPrimary: true },
    },
    {
      admissionNo: 'ADM25005',
      firstName: 'Kabir',
      lastName: 'Malhotra',
      gender: 'male',
      dob: new Date('2017-07-09'),
      phone: '+91-9876500005',
      address: '22 Oak Lane, Ghaziabad',
      classCode: 'C2',
      section: 'A',
      rollNo: '2',
      campusCode: 'MAIN',
      guardian: { name: 'Raj Malhotra', relation: 'Father', phone: '+91-9876500005', isPrimary: true },
    },
    {
      admissionNo: 'ADM25006',
      firstName: 'Myra',
      lastName: 'Joshi',
      gender: 'female',
      dob: new Date('2017-03-30'),
      phone: '+91-9876500006',
      address: 'House 9, Rose Garden, East Campus area',
      classCode: 'C2',
      section: 'B',
      rollNo: '1',
      campusCode: 'EAST',
      guardian: { name: 'Pooja Joshi', relation: 'Mother', phone: '+91-9876500006', isPrimary: true },
    },
    {
      admissionNo: 'ADM25007',
      firstName: 'Vihaan',
      lastName: 'Nair',
      gender: 'male',
      dob: new Date('2016-12-05'),
      phone: '+91-9876500007',
      address: '3 Maple Court, Noida',
      classCode: 'C3',
      section: 'A',
      rollNo: '1',
      campusCode: 'MAIN',
      guardian: { name: 'Sanjay Nair', relation: 'Father', phone: '+91-9876500007', isPrimary: true },
    },
    {
      admissionNo: 'ADM25008',
      firstName: 'Anaya',
      lastName: 'Das',
      gender: 'female',
      dob: new Date('2016-08-14'),
      phone: '+91-9876500008',
      address: 'A-21, Sunshine Towers, Noida',
      classCode: 'C3',
      section: 'A',
      rollNo: '2',
      campusCode: 'MAIN',
      guardian: { name: 'Meera Das', relation: 'Mother', phone: '+91-9876500008', isPrimary: true },
    },
    {
      admissionNo: 'ADM25009',
      firstName: 'Reyansh',
      lastName: 'Banerjee',
      gender: 'male',
      dob: new Date('2015-10-21'),
      phone: '+91-9876500009',
      address: '18 Lake View Road, Ghaziabad',
      classCode: 'C4',
      section: 'A',
      rollNo: '1',
      campusCode: 'EAST',
      guardian: { name: 'Arjun Banerjee', relation: 'Father', phone: '+91-9876500009', isPrimary: true },
    },
    {
      admissionNo: 'ADM25010',
      firstName: 'Kiara',
      lastName: 'Chopra',
      gender: 'female',
      dob: new Date('2015-04-02'),
      phone: '+91-9876500010',
      address: 'Villa 5, Orchid Enclave, Noida',
      classCode: 'C4',
      section: 'B',
      rollNo: '1',
      campusCode: 'MAIN',
      guardian: { name: 'Nikhil Chopra', relation: 'Father', phone: '+91-9876500010', isPrimary: true },
    },
  ];

  const studentsByAdmission: Record<string, NonNullable<Awaited<ReturnType<typeof Student.findOne>>>> = {};
  for (const def of studentDefs) {
    const student = await Student.findOneAndUpdate(
      { instituteId: institute._id, admissionNo: def.admissionNo },
      {
        $set: {
          firstName: def.firstName,
          lastName: def.lastName,
          gender: def.gender,
          dob: def.dob,
          phone: def.phone,
          email: def.email,
          address: def.address,
          photoUrl: `https://api.dicebear.com/7.x/avataaars/svg?seed=${def.admissionNo}`,
          campusId: campuses[def.campusCode]._id,
          status: 'active',
          guardians: [def.guardian],
          deletedAt: null,
        },
        $setOnInsert: {
          instituteId: institute._id,
          admissionNo: def.admissionNo,
          documents: [],
        },
      },
      { upsert: true, new: true }
    );
    studentsByAdmission[def.admissionNo] = student!;

    await Enrollment.findOneAndUpdate(
      { instituteId: institute._id, studentId: student!._id, sessionId: session._id },
      {
        $set: {
          classId: classes[def.classCode]._id,
          sectionId: sectionsByClass[def.classCode][def.section]._id,
          rollNo: def.rollNo,
          status: 'active',
          deletedAt: null,
        },
        $setOnInsert: {
          instituteId: institute._id,
          studentId: student!._id,
          sessionId: session._id,
        },
      },
      { upsert: true }
    );
  }
  console.log('[seed] students & enrollments upserted:', Object.keys(studentsByAdmission).length);

  // Historical enrollments (promoted classes) for prior sessions
  const classBefore: Record<string, string> = { C1: 'C1', C2: 'C1', C3: 'C2', C4: 'C3' };
  let priorEnrollmentCount = 0;
  for (const def of studentDefs) {
    const class2526 = classBefore[def.classCode] || def.classCode;
    const class2425 = classBefore[class2526] || class2526;

    for (const [sess, classCode, status] of [
      [session2425, class2425, 'completed'],
      [session2526, class2526, 'completed'],
    ] as const) {
      await Enrollment.findOneAndUpdate(
        { instituteId: institute._id, studentId: studentsByAdmission[def.admissionNo]._id, sessionId: sess._id },
        {
          $set: {
            classId: classes[classCode]._id,
            sectionId: sectionsByClass[classCode][def.section]._id,
            rollNo: def.rollNo,
            status,
            deletedAt: null,
          },
          $setOnInsert: {
            instituteId: institute._id,
            studentId: studentsByAdmission[def.admissionNo]._id,
            sessionId: sess._id,
          },
        },
        { upsert: true }
      );
      priorEnrollmentCount += 1;
    }
  }
  console.log('[seed] prior-year enrollments upserted:', priorEnrollmentCount);

  // --- Fee structures / invoices / payments ---
  const structureAmountByClass: Record<string, { tuition: number; lab: number; library: number; annual: number }> = {
    C1: { tuition: 25000, lab: 2000, library: 1000, annual: 5000 },
    C2: { tuition: 28000, lab: 2500, library: 1000, annual: 5000 },
    C3: { tuition: 30000, lab: 3000, library: 1200, annual: 5500 },
    C4: { tuition: 32000, lab: 3500, library: 1200, annual: 5500 },
  };

  const feeStructures: Record<string, NonNullable<Awaited<ReturnType<typeof FeeStructure.findOne>>>> = {};
  for (const sess of [session2425, session2526, session]) {
    for (const [classCode, amounts] of Object.entries(structureAmountByClass)) {
      const name = `${classCode} Annual Fees ${sess.name}`;
      const doc = await FeeStructure.findOneAndUpdate(
        { instituteId: institute._id, sessionId: sess._id, classId: classes[classCode]._id, name },
        {
          $set: {
            items: [
              { feeHeadId: feeHeads.TUITION._id, amount: amounts.tuition },
              { feeHeadId: feeHeads.LAB._id, amount: amounts.lab },
              { feeHeadId: feeHeads.LIBRARY._id, amount: amounts.library },
              { feeHeadId: feeHeads.ANNUAL._id, amount: amounts.annual },
            ],
            lateFeePerDay: 50,
            deletedAt: null,
          },
          $setOnInsert: {
            instituteId: institute._id,
            sessionId: sess._id,
            classId: classes[classCode]._id,
            name,
          },
        },
        { upsert: true, new: true }
      );
      feeStructures[`${sess.name}:${classCode}`] = doc!;
    }
  }
  console.log('[seed] fee structures upserted:', Object.keys(feeStructures).length);

  // Monthly fee invoices/payments are generated in seedTwoYearHistory (2y→today)


  // --- Salary structures & payroll ---
  const salaryDefs: Record<
    string,
    { basic: number; allowances: { name: string; amount: number }[]; deductions: { name: string; amount: number }[] }
  > = {
    EMP001: {
      basic: 80000,
      allowances: [
        { name: 'HRA', amount: 20000 },
        { name: 'Transport', amount: 3000 },
      ],
      deductions: [{ name: 'PF', amount: 2400 }],
    },
    EMP002: {
      basic: 55000,
      allowances: [
        { name: 'HRA', amount: 14000 },
        { name: 'Teaching Allowance', amount: 4000 },
      ],
      deductions: [{ name: 'PF', amount: 1800 }],
    },
    EMP003: {
      basic: 45000,
      allowances: [{ name: 'HRA', amount: 11000 }],
      deductions: [{ name: 'PF', amount: 1500 }],
    },
    EMP004: {
      basic: 48000,
      allowances: [{ name: 'HRA', amount: 12000 }],
      deductions: [{ name: 'PF', amount: 1600 }],
    },
    EMP005: {
      basic: 28000,
      allowances: [{ name: 'HRA', amount: 7000 }],
      deductions: [{ name: 'PF', amount: 1000 }],
    },
    EMP006: {
      basic: 42000,
      allowances: [
        { name: 'HRA', amount: 10000 },
        { name: 'Tech Allowance', amount: 2500 },
      ],
      deductions: [{ name: 'PF', amount: 1400 }],
    },
  };

  for (const [code, sal] of Object.entries(salaryDefs)) {
    const staff = staffByCode[code];
    const allowancesTotal = sal.allowances.reduce((s, a) => s + a.amount, 0);
    const deductionsTotal = sal.deductions.reduce((s, d) => s + d.amount, 0);
    const netPay = sal.basic + allowancesTotal - deductionsTotal;

    await SalaryStructure.findOneAndUpdate(
      { instituteId: institute._id, staffId: staff._id },
      {
        $set: {
          basic: sal.basic,
          allowances: sal.allowances,
          deductions: sal.deductions,
          effectiveFrom: new Date('2024-04-01'),
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, staffId: staff._id },
      },
      { upsert: true }
    );
  }
  console.log('[seed] salary structures upserted (payroll months via history seed)');

  // --- Transport ---
  const vehicleDefs = [
    {
      number: 'UP16AB1234',
      type: 'bus',
      capacity: 40,
      driverName: 'Ramesh Yadav',
      driverPhone: '+91-9800011001',
      campusCode: 'MAIN',
    },
    {
      number: 'UP14CD5678',
      type: 'bus',
      capacity: 35,
      driverName: 'Suresh Pal',
      driverPhone: '+91-9800011002',
      campusCode: 'EAST',
    },
    {
      number: 'DL01EF9012',
      type: 'van',
      capacity: 12,
      driverName: 'Imran Ali',
      driverPhone: '+91-9800011003',
      campusCode: 'MAIN',
    },
  ];
  const vehicles: Record<string, NonNullable<Awaited<ReturnType<typeof Vehicle.findOne>>>> = {};
  for (const def of vehicleDefs) {
    const doc = await Vehicle.findOneAndUpdate(
      { instituteId: institute._id, number: def.number },
      {
        $set: {
          type: def.type,
          capacity: def.capacity,
          driverName: def.driverName,
          driverPhone: def.driverPhone,
          campusId: campuses[def.campusCode]._id,
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, number: def.number },
      },
      { upsert: true, new: true }
    );
    vehicles[def.number] = doc!;
  }

  const routeDefs = [
    {
      name: 'Route A — Noida Express',
      vehicleNumber: 'UP16AB1234',
      campusCode: 'MAIN',
      stops: [
        { name: 'Sector 18 Metro', order: 1, pickupTime: '07:10' },
        { name: 'Golf Course Road', order: 2, pickupTime: '07:25' },
        { name: 'Main Campus Gate', order: 3, pickupTime: '07:45' },
      ],
    },
    {
      name: 'Route B — Indirapuram Loop',
      vehicleNumber: 'UP14CD5678',
      campusCode: 'EAST',
      stops: [
        { name: 'Shipra Mall', order: 1, pickupTime: '07:05' },
        { name: 'Ahinsa Khand', order: 2, pickupTime: '07:20' },
        { name: 'East Campus Gate', order: 3, pickupTime: '07:40' },
      ],
    },
    {
      name: 'Route C — Staff Van',
      vehicleNumber: 'DL01EF9012',
      campusCode: 'MAIN',
      stops: [
        { name: 'Botanical Garden', order: 1, pickupTime: '07:30' },
        { name: 'Main Campus Gate', order: 2, pickupTime: '07:50' },
      ],
    },
  ];
  const routesByName: Record<string, NonNullable<Awaited<ReturnType<typeof TransportRoute.findOne>>>> = {};
  for (const def of routeDefs) {
    const doc = await TransportRoute.findOneAndUpdate(
      { instituteId: institute._id, name: def.name },
      {
        $set: {
          vehicleId: vehicles[def.vehicleNumber]._id,
          campusId: campuses[def.campusCode]._id,
          stops: def.stops,
          deletedAt: null,
        },
        $setOnInsert: { instituteId: institute._id, name: def.name },
      },
      { upsert: true, new: true }
    );
    routesByName[def.name] = doc!;
  }

  const tierDefs = [
    { name: 'Up to 5 km', maxKm: 5, monthlyAmount: 1600 },
    { name: 'Up to 10 km', maxKm: 10, monthlyAmount: 2200 },
    { name: 'Up to 15 km', maxKm: 15, monthlyAmount: 2800 },
  ];
  const tiersByMaxKm: Record<number, NonNullable<Awaited<ReturnType<typeof TransportFeeTier.findOne>>>> = {};
  for (const t of tierDefs) {
    const doc = await TransportFeeTier.findOneAndUpdate(
      { instituteId: institute._id, maxKm: t.maxKm, deletedAt: null },
      {
        $set: { name: t.name, monthlyAmount: t.monthlyAmount, deletedAt: null },
        $setOnInsert: { instituteId: institute._id, maxKm: t.maxKm },
      },
      { upsert: true, new: true }
    );
    tiersByMaxKm[t.maxKm] = doc!;
  }

  const transportAssignments = [
    {
      admissionNo: 'ADM25001',
      routeName: 'Route A — Noida Express',
      stopName: 'Sector 18 Metro',
      maxKm: 5,
    },
    {
      admissionNo: 'ADM25002',
      routeName: 'Route A — Noida Express',
      stopName: 'Golf Course Road',
      maxKm: 10,
    },
    {
      admissionNo: 'ADM25003',
      routeName: 'Route B — Indirapuram Loop',
      stopName: 'Shipra Mall',
      maxKm: 5,
    },
    {
      admissionNo: 'ADM25006',
      routeName: 'Route B — Indirapuram Loop',
      stopName: 'Ahinsa Khand',
      maxKm: 15,
    },
    {
      admissionNo: 'ADM25009',
      routeName: 'Route B — Indirapuram Loop',
      stopName: 'Shipra Mall',
      maxKm: 10,
    },
  ];
  for (const asg of transportAssignments) {
    const tier = tiersByMaxKm[asg.maxKm];
    await StudentTransport.findOneAndUpdate(
      { instituteId: institute._id, studentId: studentsByAdmission[asg.admissionNo]._id },
      {
        $set: {
          routeId: routesByName[asg.routeName]._id,
          stopName: asg.stopName,
          feeTierId: tier._id,
          monthlyFee: tier.monthlyAmount,
          deletedAt: null,
        },
        $setOnInsert: {
          instituteId: institute._id,
          studentId: studentsByAdmission[asg.admissionNo]._id,
        },
      },
      { upsert: true }
    );
  }
  console.log('[seed] transport vehicles/routes/fee-tiers/assignments upserted');

  const historySessions = [
    { id: session2425._id, name: '2024-25', start: '2024-04-01', end: '2025-03-31' },
    { id: session2526._id, name: '2025-26', start: '2025-04-01', end: '2026-03-31' },
    { id: session._id, name: '2026-27', start: '2026-04-01', end: '2027-03-31', isActive: true },
  ];

  const historyRange = await seedTwoYearHistory({
    institute,
    campuses,
    sessions: historySessions,
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
    transportAdmissionNos: transportAssignments.map((t) => t.admissionNo),
  });
  console.log('[seed] two-year history ready:', historyRange.from, '→', historyRange.to);

  console.log('[seed] done');
  console.log('[seed] login:', env.bootstrapAdminEmail, '/', env.bootstrapAdminPassword);
  process.exit(0);
}

seed().catch((err) => {
  console.error('[seed] failed', err);
  process.exit(1);
});
