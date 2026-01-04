import YahooFinance from 'yahoo-finance2';
import prisma from '@/lib/prisma';
import { AssetPrice } from '@prisma/client';

const yahooFinance = new YahooFinance({
    queue: {
        concurrency: 1
    }
});

// Helper to fetch and cache asset prices
async function getAssetData(ticker: string, period1Str: string) {
    const period1Date = new Date(period1Str);

    // 1. Check if we synced this ticker today
    const sync = await prisma.syncRegistry.findUnique({
        where: { key: `asset_${ticker}` }
    });

    const isSyncedToday = sync && (new Date().toDateString() === new Date(sync.lastCheck).toDateString());

    // 2. Try to fetch from DB
    const dbData = await prisma.assetPrice.findMany({
        where: {
            ticker: ticker,
            date: {
                gte: period1Date
            }
        },
        orderBy: {
            date: 'asc'
        }
    });

    // If we have data AND we synced today, we are good.
    if (dbData.length > 0 && isSyncedToday) {
        console.log(`[${new Date().toISOString()}] DB CACHE HIT for: ${ticker}`);
        return dbData.map(d => ({
            date: d.date,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            adjClose: d.adjClose,
            volume: Number(d.volume),
        }));
    }

    console.log(`[${new Date().toISOString()}] DB CACHE MISS/STALE for: ${ticker}. Fetching from Yahoo...`);

    // 3. Determine actual period1 for "incremental fetch"
    // If we have data, start from the latest date we have to get missing days.
    let fetchStart = period1Str;
    if (dbData.length > 0) {
        const lastDate = dbData[dbData.length - 1].date;
        fetchStart = lastDate.toISOString().split('T')[0];
        console.log(`[${new Date().toISOString()}] Incremental fetch for ${ticker} starting at ${fetchStart}`);
    }

    // 4. Fetch from Yahoo
    const queryOptions = {
        period1: fetchStart,
        interval: '1d' as any,
    };

    try {
        const chartResult = await yahooFinance.chart(ticker, queryOptions);
        const quotes = chartResult.quotes || [];
        const currency = chartResult.meta?.currency || 'USD';

        // 5. Save data to DB
        const validQuotes = quotes.filter((q: any) => q.date && q.close !== null);

        if (validQuotes.length > 0) {
            const dataToInsert = validQuotes.map((q: any) => ({
                ticker,
                date: new Date(q.date),
                open: q.open || 0,
                high: q.high || 0,
                low: q.low || 0,
                close: q.close || 0,
                volume: BigInt(q.volume || 0),
                adjClose: q.adjclose || q.close || 0,
                currency: currency
            }));

            await prisma.assetPrice.createMany({
                data: dataToInsert,
                skipDuplicates: true
            });
        }

        // 6. Update registry to mark as "checked today"
        await prisma.syncRegistry.upsert({
            where: { key: `asset_${ticker}` },
            update: { lastCheck: new Date() },
            create: { key: `asset_${ticker}`, lastCheck: new Date() }
        });

        // After saving, we should return the FULL set from DB to ensure frontend has everything
        const fullData = await prisma.assetPrice.findMany({
            where: { ticker, date: { gte: period1Date } },
            orderBy: { date: 'asc' }
        });

        return fullData.map(d => ({
            date: d.date,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            adjClose: d.adjClose,
            volume: Number(d.volume),
        }));

    } catch (e: any) {
        console.error(`[${new Date().toISOString()}] Error fetching/saving ${ticker}: ${e.message}`);
        // Fallback to whatever we have in DB
        return dbData.length > 0 ? dbData.map(d => ({
            date: d.date,
            open: d.open,
            high: d.high,
            low: d.low,
            close: d.close,
            adjClose: d.adjClose,
            volume: Number(d.volume),
        })) : [];
    }
}

// Helper for Exchange Rates
async function getExchangeRateData(pair: string, period1Str: string) {
    const period1Date = new Date(period1Str);

    // Check sync
    const sync = await prisma.syncRegistry.findUnique({
        where: { key: `rate_${pair}` }
    });
    const isSyncedToday = sync && (new Date().toDateString() === new Date(sync.lastCheck).toDateString());

    // DB Check
    const dbData = await prisma.exchangeRate.findMany({
        where: {
            pair: pair,
            date: { gte: period1Date }
        },
        orderBy: { date: 'asc' }
    });

    if (dbData.length > 0 && isSyncedToday) {
        return dbData;
    }

    // Determine fetch start for incremental
    let fetchStart = period1Str;
    if (dbData.length > 0) {
        fetchStart = dbData[dbData.length - 1].date.toISOString().split('T')[0];
    }

    // Fetch
    console.log(`[${new Date().toISOString()}] Fetching rate for ${pair} starting at ${fetchStart}...`);
    try {
        const chartResult = await yahooFinance.chart(pair, { period1: fetchStart, interval: '1d' as any });
        const quotes = chartResult.quotes || [];

        const validQuotes = quotes.filter((q: any) => q.date && q.close !== null);
        const dataToInsert = validQuotes.map((q: any) => ({
            pair,
            date: new Date(q.date),
            rate: q.close || 0
        }));

        if (dataToInsert.length > 0) {
            await prisma.exchangeRate.createMany({
                data: dataToInsert,
                skipDuplicates: true
            });
        }

        // Update registry
        await prisma.syncRegistry.upsert({
            where: { key: `rate_${pair}` },
            update: { lastCheck: new Date() },
            create: { key: `rate_${pair}`, lastCheck: new Date() }
        });

        // Return full set
        return prisma.exchangeRate.findMany({
            where: { pair, date: { gte: period1Date } },
            orderBy: { date: 'asc' }
        });

    } catch (error) {
        console.error(`[${new Date().toISOString()}] Rate fetch error ${pair}`, error);
        return dbData.length > 0 ? dbData : [];
    }
}

export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const tickers = searchParams.get('tickers')?.split(',') || [];
    const baseCurrency = searchParams.get('currency') || 'EUR';

    if (!tickers.length) {
        return Response.json({ error: 'No tickers provided' }, { status: 400 });
    }

    try {
        const period1 = new Date();
        period1.setFullYear(period1.getFullYear() - 5);
        const period1Str = period1.toISOString().split('T')[0];

        // 1. Fetch data
        const results = await Promise.all(tickers.map(async (ticker) => {
            try {
                // We need to fetch basic info AND historical data.
                // For currency, we might need a separate 'quote' call if DB doesn't have it, 
                // but let's assume we get it from the historical fetch flow or trigger a quote if needed.
                // However, our getAssetData doesn't return the currency string easily.
                // Let's do a quick quote fetch for metadata if needed, but it's an extra call.
                // Optimization: Store currency in DB? Yes I added 'currency' to AssetPrice.
                // So we can check the first record from DB.

                const data = await getAssetData(ticker, period1Str);

                // Determine currency from data or fallback
                let currency = 'USD';
                if (data.length > 0) {
                    // Try to get currency from DB record if accessed via getAssetData... 
                    // But getAssetData returns mapped object. Let's fix that.
                    // Actually, let's allow getAssetData to populate currency logic if simpler.
                    // Or just fetch quote for metadata? Quote is fast.
                    // Let's stick to the previous pattern: use 'quote' for fresh metadata.
                    // Cache the quote too?
                    // Let's cache the quote in memory or just call it (it's lightweight).
                    // Or reuse DB currency if available.

                    // For now, let's keep the quote call to be safe about current price/metadata,
                    // but we can optimize later.
                }

                const quote = await yahooFinance.quote(ticker);
                // Note: Quote is not cached in DB currently. 

                return {
                    ticker,
                    currency: quote.currency || 'USD',
                    data
                };
            } catch (e: any) {
                console.error(`Error for ${ticker}:`, e.message);
                return { ticker, error: e.message || 'Failed' };
            }
        }));

        // 2. Identify unique currencies
        const uniqueCurrencies = new Set<string>();
        results.forEach(res => {
            if (!res.error && res.currency) {
                const currency = res.currency === 'GBp' ? 'GBP' : res.currency;
                if (currency !== baseCurrency) {
                    uniqueCurrencies.add(currency);
                }
            }
        });

        // 3. Fetch rates
        const rateMap: Record<string, Map<string, number>> = {};
        await Promise.all(Array.from(uniqueCurrencies).map(async (currency) => {
            const pair = `${currency}${baseCurrency}=X`;
            const rates = await getExchangeRateData(pair, period1Str);

            const dateMap = new Map<string, number>();
            rates.forEach((r: any) => {
                const d = r.date instanceof Date ? r.date : new Date(r.date);
                const dateStr = d.toISOString().split('T')[0];
                const rate = r.rate || r.close; // Handle DB vs API shape
                if (rate) dateMap.set(dateStr, rate);
            });
            rateMap[currency] = dateMap;
        }));

        // 4. Convert
        const convertedResults = results.map(res => {
            if (res.error || !res.data) return res;

            const isGBp = res.currency === 'GBp';
            const normCurrency = isGBp ? 'GBP' : res.currency;

            if (normCurrency === baseCurrency && !isGBp) {
                return { ...res, currency: baseCurrency };
            }

            const rates = rateMap[normCurrency];

            const convertedData = res.data.map((day: any) => {
                const dateStr = new Date(day.date).toISOString().split('T')[0];

                let rate = 1;
                if (normCurrency !== baseCurrency && rates) {
                    rate = rates.get(dateStr) || 0;
                    // Forward fill logic
                    if (rate === 0) {
                        const d = new Date(dateStr);
                        for (let i = 1; i <= 7; i++) {
                            d.setDate(d.getDate() - 1);
                            const prevDate = d.toISOString().split('T')[0];
                            const prevRate = rates.get(prevDate);
                            if (prevRate) {
                                rate = prevRate;
                                break;
                            }
                        }
                    }
                }

                if (rate === 0) rate = 1;
                const multiplier = isGBp ? rate * 0.01 : rate;

                return {
                    ...day,
                    close: (day.close || 0) * multiplier,
                    open: (day.open || 0) * multiplier,
                    high: (day.high || 0) * multiplier,
                    low: (day.low || 0) * multiplier,
                    adjClose: (day.adjClose || 0) * multiplier
                };
            });

            return {
                ...res,
                currency: baseCurrency,
                data: convertedData
            };
        });

        return Response.json({ results: convertedResults, baseCurrency });

    } catch (error: any) {
        console.error('Final API Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
