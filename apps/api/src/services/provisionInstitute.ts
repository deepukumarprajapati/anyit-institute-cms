import bcrypt from 'bcryptjs';
import { DEFAULT_ROLE_KEYS, ROLE_PERMISSION_MAP, Permission } from '@anyit/shared';
import { Types } from 'mongoose';
import { AcademicSession } from '../models/AcademicSession';
import { Campus } from '../models/Campus';
import { Institute } from '../models/Institute';
import { Role } from '../models/Role';
import { User } from '../models/User';
import { notDeleted } from '../models/base';
import { AppError } from '../utils/errors';

export type ProvisionInput = {
  instituteName: string;
  instituteCode?: string;
  email: string;
  phone?: string;
  address?: string;
  pincode?: string;
  adminName: string;
  password: string;
  branch?: {
    name: string;
    code: string;
    schoolCode?: string;
    phone?: string;
    address?: string;
    pincode?: string;
    mapUrl?: string;
    latitude?: number;
    longitude?: number;
    imageUrl?: string;
  };
};

function roleName(key: string) {
  return key
    .split('_')
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');
}

export function normalizeInstituteCode(raw: string) {
  return raw.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16);
}

export function codeFromName(name: string) {
  const code = normalizeInstituteCode(name);
  return code.length >= 2 ? code.slice(0, 12) : 'INST';
}

export function currentAcademicYear(now = new Date()) {
  const month = now.getMonth();
  const startYear = month >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  const endYear = startYear + 1;
  return {
    name: `${startYear}-${String(endYear).slice(-2)}`,
    startDate: new Date(Date.UTC(startYear, 3, 1)),
    endDate: new Date(Date.UTC(endYear, 2, 31)),
  };
}

async function allocateCode(preferred: string, explicit: boolean) {
  const base = normalizeInstituteCode(preferred);
  if (base.length < 2) {
    throw new AppError(400, 'INVALID_CODE', 'Institute code must be at least 2 letters or digits');
  }

  const taken = await Institute.findOne({ code: base, ...notDeleted() });
  if (!taken) return base;
  if (explicit) {
    throw new AppError(409, 'CODE_TAKEN', 'This institute code is already in use');
  }

  for (let i = 0; i < 8; i++) {
    const candidate = `${base.slice(0, 10)}${Math.floor(10 + Math.random() * 90)}`;
    const clash = await Institute.findOne({ code: candidate, ...notDeleted() });
    if (!clash) return candidate;
  }
  throw new AppError(409, 'CODE_TAKEN', 'This institute code is already in use');
}

export async function provisionInstitute(input: ProvisionInput) {
  const email = input.email.toLowerCase().trim();
  const explicitCode = Boolean(input.instituteCode?.trim());
  const preferredCode = explicitCode ? input.instituteCode!.trim() : codeFromName(input.instituteName);
  const code = await allocateCode(preferredCode, explicitCode);

  const existingEmail = await User.findOne({ email, ...notDeleted() });
  if (existingEmail) {
    throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists');
  }

  const year = currentAcademicYear();
  let instituteId: Types.ObjectId | undefined;

  try {
    const institute = await Institute.create({
      name: input.instituteName.trim(),
      code,
      email,
      phone: input.phone?.trim() || undefined,
      address: input.address?.trim() || undefined,
      pincode: input.pincode?.trim() || undefined,
      settings: {
        timezone: 'Asia/Kolkata',
        currency: 'INR',
        academicYearLabel: year.name,
      },
    });
    instituteId = institute._id;

    const campus = await Campus.create({
      instituteId: institute._id,
      name: 'Head Office',
      code: 'HO',
      address: input.address?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      pincode: input.pincode?.trim() || undefined,
      isPrimary: true,
    });

    let branchCampus = null;
    if (input.branch?.name?.trim()) {
      const branchCode = (input.branch.code || 'BR1').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 16) || 'BR1';
      branchCampus = await Campus.create({
        instituteId: institute._id,
        name: input.branch.name.trim(),
        code: branchCode,
        address: input.branch.address?.trim() || undefined,
        phone: input.branch.phone?.trim() || undefined,
        pincode: input.branch.pincode?.trim() || undefined,
        schoolCode: input.branch.schoolCode?.trim() || undefined,
        mapUrl: input.branch.mapUrl?.trim() || undefined,
        latitude: input.branch.latitude,
        longitude: input.branch.longitude,
        imageUrl: input.branch.imageUrl?.trim() || undefined,
        isPrimary: false,
      });
    }

    await Role.insertMany(
      DEFAULT_ROLE_KEYS.map((key) => {
        const perms = ROLE_PERMISSION_MAP[key];
        return {
          instituteId: institute._id,
          key,
          name: roleName(key),
          permissions: perms === '*' ? (['*'] as unknown as Permission[]) : perms,
          isSystem: true,
        };
      })
    );

    const superRole = await Role.findOne({ instituteId: institute._id, key: 'super_admin' });
    if (!superRole) throw new AppError(500, 'INTERNAL_ERROR', 'Failed to create admin role');

    const user = await User.create({
      instituteId: institute._id,
      campusId: campus._id,
      email,
      name: input.adminName.trim(),
      phone: input.phone?.trim() || undefined,
      passwordHash: await bcrypt.hash(input.password, 10),
      roleId: superRole._id,
      isActive: true,
    });

    await AcademicSession.create({
      instituteId: institute._id,
      name: year.name,
      startDate: year.startDate,
      endDate: year.endDate,
      isActive: true,
    });

    return { institute, campus, branchCampus, user, role: superRole };
  } catch (err) {
    if (instituteId) {
      await Promise.all([
        User.deleteMany({ instituteId }),
        Role.deleteMany({ instituteId }),
        Campus.deleteMany({ instituteId }),
        AcademicSession.deleteMany({ instituteId }),
        Institute.deleteOne({ _id: instituteId }),
      ]);
    }
    if (err instanceof AppError) throw err;
    if (typeof err === 'object' && err && (err as { code?: number }).code === 11000) {
      throw new AppError(409, 'CONFLICT', 'Institute code or email is already in use');
    }
    throw err;
  }
}
