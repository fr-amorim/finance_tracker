import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function POST() {
    try {
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);

        // Run delete operations in a transaction
        const result = await prisma.$transaction([
            // Clear specific asset prices updated since yesterday
            prisma.assetPrice.deleteMany({
                where: {
                    updatedAt: {
                        gte: yesterday
                    }
                }
            }),
            // Clear sync registry entries updated since yesterday
            prisma.syncRegistry.deleteMany({
                where: {
                    lastCheck: {
                        gte: yesterday
                    }
                }
            })
        ]);

        return NextResponse.json({
            success: true,
            deletedPrices: result[0].count,
            deletedRegistry: result[1].count
        });
    } catch (error: any) {
        console.error('Force refresh error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
