import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

export const UserManager = {
  async listUsers() {
    return prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
    });
  },

  async createUser(data: { email: string; password: string; name?: string }) {
    const count = await prisma.user.count();
    const role = count === 0 ? 'superadmin' : 'admin';
    const hashed = await bcrypt.hash(data.password, 10);
    return prisma.user.create({
      data: { ...data, password: hashed, role },
    });
  },

  async deleteUser(id: string) {
    return prisma.user.delete({ where: { id } });
  },
};
