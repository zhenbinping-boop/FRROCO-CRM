import type { Prisma, PrismaClient } from "@prisma/client";

type TransactionClient = Prisma.TransactionClient;

/** Keep the identity on the same connection as the protected queries. */
export function withRlsContext<T>(prisma: PrismaClient, userId: string, work: (tx: TransactionClient) => Promise<T>) {
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
    return work(tx);
  });
}
