import yahooFinance from 'yahoo-finance2';

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

        // 1. Fetch raw data for all tickers
        const results = await Promise.all(tickers.map(async (ticker) => {
            try {
                const queryOptions = {
                    period1: period1Str,
                    interval: '1d',
                };
                const [historicalData, quote] = await Promise.all([
                    yahooFinance.historical(ticker, queryOptions as any),
                    yahooFinance.quote(ticker)
                ]);

                return {
                    ticker,
                    currency: quote.currency || 'USD',
                    data: historicalData
                };
            } catch (e: any) {
                console.error(`Error fetching ${ticker}:`, e.message);
                return { ticker, error: e.message || 'Failed to fetch' };
            }
        }));

        // 2. Identify unique currencies that need conversion
        const uniqueCurrencies = new Set<string>();
        results.forEach(res => {
            if (!res.error && res.currency) {
                // Normalize GBp to GBP
                const currency = res.currency === 'GBp' ? 'GBP' : res.currency;
                if (currency !== baseCurrency) {
                    uniqueCurrencies.add(currency);
                }
            }
        });

        // 3. Fetch historical exchange rates
        const rateMap: Record<string, Map<string, number>> = {};

        await Promise.all(Array.from(uniqueCurrencies).map(async (currency) => {
            const pair = `${currency}${baseCurrency}=X`;
            try {
                const rates = await yahooFinance.historical(pair, {
                    period1: period1Str,
                    interval: '1d'
                } as any);

                const dateMap = new Map<string, number>();
                rates.forEach((r: any) => {
                    const dateStr = new Date(r.date).toISOString().split('T')[0];
                    if (r.close) dateMap.set(dateStr, r.close);
                });
                rateMap[currency] = dateMap;
            } catch (e) {
                console.error(`Failed to fetch rate for ${pair}`, e);
            }
        }));

        // 4. Convert data to base currency
        const convertedResults = results.map(res => {
            if (res.error || !res.data) return res;

            const isGBp = res.currency === 'GBp';
            const normCurrency = isGBp ? 'GBP' : res.currency;

            // Even if currency matches base, we might need to handle GBp vs GBP
            if (normCurrency === baseCurrency && !isGBp) {
                return { ...res, currency: baseCurrency };
            }

            const rates = rateMap[normCurrency];

            const convertedData = res.data.map((day: any) => {
                const dateStr = new Date(day.date).toISOString().split('T')[0];

                let rate = 1;
                if (normCurrency !== baseCurrency && rates) {
                    rate = rates.get(dateStr) || 0;

                    // Fallback: look back up to 7 days
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

                // Use 1 if still no rate to avoid zeroing out (but log it if possible)
                if (rate === 0) rate = 1;

                // Multiplier for price: rate * (0.01 if GBp)
                const multiplier = isGBp ? rate * 0.01 : rate;

                return {
                    ...day,
                    close: (day.close || 0) * multiplier,
                    open: (day.open || 0) * multiplier,
                    high: (day.high || 0) * multiplier,
                    low: (day.low || 0) * multiplier,
                    adjClose: (day.adjClose || 0) * multiplier,
                };
            });

            return {
                ...res,
                currency: baseCurrency,
                data: convertedData
            };
        });

        return Response.json({ results: convertedResults, baseCurrency });
    } catch (error) {
        console.error('API Error:', error);
        return Response.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
