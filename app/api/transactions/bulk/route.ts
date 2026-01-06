import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { portfolioId, transactions } = body;

        if (!portfolioId || !transactions || !Array.isArray(transactions)) {
            return NextResponse.json({ error: 'Missing portfolioId or transactions array' }, { status: 400 });
        }

        // Ensure portfolio exists
        await prisma.portfolio.upsert({
            where: { id: portfolioId },
            update: {},
            create: {
                id: portfolioId,
                name: 'My Portfolio',
            },
        });

        // Use a transaction to ensure all or nothing
        const createdCount = await prisma.$transaction(async (tx) => {
            let count = 0;
            for (const t of transactions) {
                // Determine date
                let resolvedDate: Date;
                if (!t.date) {
                    const earliestPrice = await tx.assetPrice.findFirst({
                        where: { ticker: t.ticker.toUpperCase() },
                        orderBy: { date: 'asc' }
                    });
                    resolvedDate = earliestPrice ? earliestPrice.date : new Date();
                } else {
                    // Try to handle Excel number dates or string dates
                    resolvedDate = new Date(t.date);
                }

                await tx.transaction.create({
                    data: {
                        portfolioId,
                        ticker: t.ticker.toUpperCase(),
                        type: t.type.toUpperCase(),
                        quantity: parseFloat(t.quantity),
                        date: resolvedDate,
                        assetClass: t.assetClass || null
                    },
                });
                count++;
            }
            return count;
        });

        return NextResponse.json({ success: true, count: createdCount });
    } catch (error: any) {
        console.error('Error creating bulk transactions:', error);
        return NextResponse.json({ error: error.message || 'Failed to create bulk transactions' }, { status: 500 });
    }
}
