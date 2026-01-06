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
        return dbData.map((d: AssetPrice) => ({
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

        return fullData.map((d: AssetPrice) => ({
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
        return dbData.length > 0 ? dbData.map((d: AssetPrice) => ({
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
    const portfolioId = searchParams.get('portfolioId');
    let tickers = searchParams.get('tickers')?.split(',') || [];
    const baseCurrency = searchParams.get('currency') || 'EUR';

    // 0. Fetch Portfolio Info
    let portfolioClasses: string[] = ["Stocks", "Funds", "Crypto", "Etf"];
    if (portfolioId) {
        const p = await prisma.portfolio.findUnique({ where: { id: portfolioId } });
        if (p) portfolioClasses = p.classes;
    }

    // 1. Resolve Tickers & Transactions
    let transactions: any[] = [];
    if (portfolioId) {
        transactions = await prisma.transaction.findMany({
            where: { portfolioId },
            orderBy: { date: 'asc' }
        });
        const uniqueTickers = new Set(transactions.map((t: any) => t.ticker));
        tickers = Array.from(uniqueTickers) as string[];
    }

    if (!tickers.length) {
        // Return empty if no tickers found
        return Response.json({ results: [], baseCurrency, portfolioSeries: [] });
    }

    try {
        // Determine start date: Earliest transaction OR 5 years ago if only tickers provided
        let period1Str: string;
        if (transactions.length > 0) {
            // Find earliest date
            const earliest = transactions[0].date;
            // Go back a bit to ensure we have open price for that day? Or just start there.
            period1Str = earliest.toISOString().split('T')[0];
        } else {
            const period1 = new Date();
            period1.setFullYear(period1.getFullYear() - 5);
            period1Str = period1.toISOString().split('T')[0];
        }

        // 2. Fetch data (Reuse existing logic)
        const results = await Promise.all(tickers.map(async (ticker: string) => {
            try {
                const data = await getAssetData(ticker, period1Str);
                const quote = await yahooFinance.quote(ticker);
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

        // 3. Identify unique currencies & Fetch Rates
        const uniqueCurrencies = new Set<string>();
        results.forEach(res => {
            if (!res.error && res.currency) {
                const currency = res.currency === 'GBp' ? 'GBP' : res.currency;
                if (currency !== baseCurrency) {
                    uniqueCurrencies.add(currency);
                }
            }
        });

        const rateMap: Record<string, Map<string, number>> = {};
        await Promise.all(Array.from(uniqueCurrencies).map(async (currency) => {
            const pair = `${currency}${baseCurrency}=X`;
            const rates = await getExchangeRateData(pair, period1Str);

            const dateMap = new Map<string, number>();
            rates.forEach((r: any) => {
                const d = r.date instanceof Date ? r.date : new Date(r.date);
                const dateStr = d.toISOString().split('T')[0];
                const rate = r.rate || r.close;
                if (rate) dateMap.set(dateStr, rate);
            });
            rateMap[currency] = dateMap;
        }));

        // 4. Convert Prices to Base Currency
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
                            const prevRate = rates.get(d.toISOString().split('T')[0]);
                            if (prevRate) { rate = prevRate; break; }
                        }
                    }
                }
                if (rate === 0) rate = 1;
                const multiplier = isGBp ? rate * 0.01 : rate;

                return {
                    ...day,
                    close: (day.close || 0) * multiplier,
                    // We only strictly *need* close for value, but nice to have others
                    open: (day.open || 0) * multiplier,
                    high: (day.high || 0) * multiplier,
                    low: (day.low || 0) * multiplier,
                };
            });

            return { ...res, currency: baseCurrency, data: convertedData };
        });

        // 5. Calculate Portfolio Value Series
        let portfolioSeries: any[] = [];
        if (transactions.length > 0) {
            // Map dates to prices per ticker
            const priceMap: Record<string, Map<string, number>> = {};

            convertedResults.forEach(res => {
                if (res.error || !res.data) return;
                const map = new Map<string, number>();
                res.data.forEach((d: any) => {
                    const dateStr = new Date(d.date).toISOString().split('T')[0];
                    map.set(dateStr, d.close);
                });
                priceMap[res.ticker!] = map;
            });

            // Iterate days from start to today
            const startDate = new Date(period1Str);
            const today = new Date();
            const oneDay = 24 * 60 * 60 * 1000;

            // Group transactions by ticker
            const txByTicker: Record<string, any[]> = {};
            transactions.forEach(tx => {
                if (!txByTicker[tx.ticker]) txByTicker[tx.ticker] = [];
                txByTicker[tx.ticker].push(tx);
            });

            for (let d = startDate; d <= today; d = new Date(d.getTime() + oneDay)) {
                const dateStr = d.toISOString().split('T')[0];
                let dailyTotal = 0;

                // For each ticker, check quantity held on this date
                Object.keys(txByTicker).forEach(ticker => {
                    // Filter transactions that happened ON or BEFORE today
                    // Since transactions are sorted by date, we could optimize, but filter is safe.
                    const applicableTx = txByTicker[ticker].filter(tx =>
                        new Date(tx.date).getTime() <= d.getTime()
                    );

                    const quantity = applicableTx.reduce((sum, tx) => {
                        return sum + (tx.type === 'BUY' ? tx.quantity : -tx.quantity);
                    }, 0);

                    if (quantity > 0) {
                        // Get price for this date
                        // Use forward filled price logic? or exact?
                        const prices = priceMap[ticker];
                        let price = prices?.get(dateStr);

                        // Simple fallback if price missing (weekend/holiday) - use last known
                        if (!price && prices) {
                            // Look back 7 days max
                            const tempD = new Date(d);
                            for (let k = 1; k <= 7; k++) {
                                tempD.setDate(tempD.getDate() - 1);
                                const p = prices.get(tempD.toISOString().split('T')[0]);
                                if (p) { price = p; break; }
                            }
                        }

                        if (price) {
                            dailyTotal += quantity * price;
                        }
                    }
                });

                if (dailyTotal > 0 || portfolioSeries.length > 0) {
                    // Create the series item with total value
                    const seriesItem: any = { date: dateStr, value: dailyTotal };

                    // Add breakdown for each ticker (for stacked chart)
                    Object.keys(txByTicker).forEach(ticker => {
                        // We need the current held quantity and price
                        const applicableTx = txByTicker[ticker].filter(tx =>
                            new Date(tx.date).getTime() <= d.getTime()
                        );

                        const quantity = applicableTx.reduce((sum, tx) => {
                            return sum + (tx.type === 'BUY' ? tx.quantity : -tx.quantity);
                        }, 0);

                        if (quantity > 0) {
                            const prices = priceMap[ticker];
                            // Same price logic as above
                            let price = prices?.get(dateStr);
                            if (!price && prices) {
                                const tempD = new Date(d);
                                for (let k = 1; k <= 7; k++) {
                                    tempD.setDate(tempD.getDate() - 1);
                                    const p = prices.get(tempD.toISOString().split('T')[0]);
                                    if (p) { price = p; break; }
                                }
                            }

                            if (price) {
                                seriesItem[ticker] = quantity * price;
                            }
                        }
                    });

                    portfolioSeries.push(seriesItem);
                }
            }
        }

        // 6. Calculate Current Holdings Summary
        let holdings: any[] = [];
        if (transactions.length > 0) {
            // Group transactions by ticker
            const txByTicker: Record<string, any[]> = {};
            transactions.forEach(tx => {
                if (!txByTicker[tx.ticker]) txByTicker[tx.ticker] = [];
                txByTicker[tx.ticker].push(tx);
            });

            holdings = Object.keys(txByTicker).map(ticker => {
                const quantity = txByTicker[ticker].reduce((sum: number, tx: any) => {
                    return sum + (tx.type === 'BUY' ? tx.quantity : -tx.quantity);
                }, 0);

                // Get latest price for value calculation
                // Find the result object for this ticker
                const res = convertedResults.find(r => r.ticker === ticker);
                let currentPrice = 0;
                if (res && res.data && res.data.length > 0) {
                    currentPrice = res.data[res.data.length - 1].close;
                }

                // Get most recent assetClass for this ticker
                const sortedTx = [...txByTicker[ticker]].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const assetClass = sortedTx[0]?.assetClass || "Stocks";

                return {
                    ticker,
                    quantity,
                    currentPrice,
                    currentValue: quantity * currentPrice,
                    assetClass
                };
            }).filter(h => h.quantity > 0); // Only show active holdings
        }

        return Response.json({
            results: convertedResults,
            baseCurrency,
            portfolioSeries,
            holdings,
            transactions,
            availableClasses: portfolioClasses
        });

    } catch (error: any) {
        console.error('Final API Error:', error);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
