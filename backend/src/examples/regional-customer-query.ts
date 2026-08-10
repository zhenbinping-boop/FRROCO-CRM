import { Prisma, PrismaClient, StoreType } from '@prisma/client';

const regionalCustomerArgs = Prisma.validator<Prisma.CustomerDefaultArgs>()({
  include: {
    dealerGroup: {
      select: {
        id: true,
        code: true,
        dealerName: true,
        regionProvince: true,
        regionCity: true,
        regionDistrict: true,
      },
    },
    store: {
      select: {
        id: true,
        code: true,
        storeName: true,
        regionProvince: true,
        regionCity: true,
        regionDistrict: true,
      },
    },
    tasks: {
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 5,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        assigneeId: true,
        dueAt: true,
        completedAt: true,
      },
    },
  },
});

export type RegionalCustomerItem = Prisma.CustomerGetPayload<typeof regionalCustomerArgs>;

export interface RegionalCustomerQuery {
  dealerGroupId?: string;
  regionProvince?: string;
  regionCity?: string;
  page?: number;
  pageSize?: number;
}

export interface RegionalCustomerListResult {
  items: RegionalCustomerItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
  };
  summary: {
    customerCount: number;
    totalAmount: Prisma.Decimal;
    depositAmount: Prisma.Decimal;
  };
}

export async function queryRegionalDealerCustomers(
  prisma: PrismaClient,
  query: RegionalCustomerQuery,
): Promise<RegionalCustomerListResult> {
  const dealerGroupId = query.dealerGroupId?.trim();
  const regionProvince = query.regionProvince?.trim();
  const regionCity = query.regionCity?.trim();
  if (!dealerGroupId && !regionCity) {
    throw new RangeError('dealerGroupId 或 regionCity 至少提供一个');
  }

  const requestedPage = query.page ?? 1;
  const requestedPageSize = query.pageSize ?? 20;
  if (!Number.isInteger(requestedPage) || requestedPage < 1) {
    throw new RangeError('page 必须是大于等于 1 的整数');
  }
  if (!Number.isInteger(requestedPageSize) || requestedPageSize < 1) {
    throw new RangeError('pageSize 必须是大于等于 1 的整数');
  }
  const page = requestedPage;
  const pageSize = Math.min(100, requestedPageSize);
  const where: Prisma.CustomerWhereInput = {
    storeType: StoreType.DEALER,
    ...(dealerGroupId ? { dealerGroupId } : {}),
    ...(regionProvince ? { regionProvince } : {}),
    ...(regionCity ? { regionCity } : {}),
  };

  const [items, total, amounts] = await prisma.$transaction([
    prisma.customer.findMany({
      ...regionalCustomerArgs,
      where,
      orderBy: [{ dealYear: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.customer.count({ where }),
    prisma.customer.aggregate({
      where,
      _sum: { totalAmount: true, depositAmount: true },
    }),
  ]);

  return {
    items,
    pagination: { page, pageSize, total },
    summary: {
      customerCount: total,
      totalAmount: amounts._sum.totalAmount ?? new Prisma.Decimal(0),
      depositAmount: amounts._sum.depositAmount ?? new Prisma.Decimal(0),
    },
  };
}
