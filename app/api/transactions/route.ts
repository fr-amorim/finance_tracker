import prisma from '@/lib/prisma';
import { NextRequest, NextResponse } from 'next/server';

// GET /api/transactions?portfolioId=...
export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const portfolioId = searchParams.get('portfolioId');

    if (!portfolioId) {
        return NextResponse.json({ error: 'portfolioId is required' }, { status: 400 });
    }

    try {
        const transactions = await prisma.transaction.findMany({
            where: { portfolioId },
            orderBy: { date: 'desc' },
        });

        return NextResponse.json(transactions);
    } catch (error) {
        console.error('Error fetching transactions:', error);
        return NextResponse.json({ error: 'Failed to fetch transactions' }, { status: 500 });
    }
}

// POST /api/transactions
export async function POST(request: NextRequest) {
    try {
        const body = await request.json();
        const { portfolioId, ticker, type, quantity, assetClass } = body;
        let { date } = body;

        if (!portfolioId || !ticker || !type || !quantity) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Default Date Logic: If no date is provided, find the earliest price date for this ticker
        let resolvedDate: Date;
        if (!date) {
            const earliestPrice = await prisma.assetPrice.findFirst({
                where: { ticker: ticker.toUpperCase() },
                orderBy: { date: 'asc' }
            });
            resolvedDate = earliestPrice ? earliestPrice.date : new Date();
        } else {
            resolvedDate = new Date(date);
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

        const transaction = await prisma.transaction.create({
            data: {
                portfolioId,
                ticker: ticker.toUpperCase(),
                type,
                quantity: parseFloat(quantity),
                date: resolvedDate,
                assetClass
            },
        });

        return NextResponse.json(transaction);
    } catch (error: any) {
        console.error('Error creating transaction:', error);
        return NextResponse.json({ error: error.message || 'Failed to create transaction' }, { status: 500 });
    }
}

// DELETE /api/transactions?id=... OR /api/transactions?portfolioId=...&ticker=...
export async function DELETE(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const portfolioId = searchParams.get('portfolioId');
    const ticker = searchParams.get('ticker');

    try {
        if (id) {
            await prisma.transaction.delete({
                where: { id: parseInt(id) }
            });
            return NextResponse.json({ success: true });
        } else if (portfolioId && ticker) {
            await prisma.transaction.deleteMany({
                where: {
                    portfolioId,
                    ticker: ticker.toUpperCase()
                }
            });
            return NextResponse.json({ success: true });
        } else {
            return NextResponse.json({ error: 'Missing id or portfolioId+ticker' }, { status: 400 });
        }
    } catch (error: any) {
        console.error('Error deleting transaction(s):', error);
        return NextResponse.json({ error: error.message || 'Failed to delete' }, { status: 500 });
    }
}

// PUT /api/transactions
export async function PUT(request: NextRequest) {
    try {
        const body = await request.json();
        const { id, type, quantity, date, ticker, assetClass } = body;

        if (!id) {
            return NextResponse.json({ error: 'Missing transaction id' }, { status: 400 });
        }

        const transaction = await prisma.transaction.update({
            where: { id: parseInt(id) },
            data: {
                ticker: ticker ? ticker.toUpperCase() : undefined,
                type,
                quantity: quantity ? parseFloat(quantity) : undefined,
                date: date ? new Date(date) : undefined,
                assetClass
            }
        });

        return NextResponse.json(transaction);
    } catch (error: any) {
        console.error('Error updating transaction:', error);
        return NextResponse.json({ error: error.message || 'Failed to update' }, { status: 500 });
    }
}

