/**
 * Generates the next order number in format ORD000001 using a row-locked sequence.
 */
export async function nextOrderNumber(prisma) {
  return await prisma.$transaction(async (tx) => {
    const seq = await tx.orderSequence.findUnique({ where: { id: 1 } });
    if (!seq) {
      await tx.orderSequence.create({ data: { id: 1, current: 0 } });
    }
    // lock row
    const rows = await tx.$queryRaw`SELECT id, current FROM "OrderSequence" WHERE id = 1 FOR UPDATE`;
    const current = rows[0].current;
    const next = current + 1;
    await tx.orderSequence.update({ where: { id: 1 }, data: { current: next } });
    return `ORD${String(next).padStart(6, "0")}`;
  });
}
