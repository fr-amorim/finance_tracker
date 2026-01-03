import { ResponsiveContainer, AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { useEffect, useState, useMemo } from 'react';
import styles from './Chart.module.css';
import summaryStyles from './SummaryCards.module.css';
import AllocationChart from './AllocationChart';

interface ChartProps {
    indices: any[];
    currency: string;
    availableClasses?: string[];
    onAllocationUpdate?: (allocations: Record<string, number>) => void;
    selectedClass: string;
    onClassChange: (value: string) => void;
}

export default function Chart({
    indices,
    currency,
    availableClasses = [],
    onAllocationUpdate,
    selectedClass,
    onClassChange
}: ChartProps) {
    const [rawResults, setRawResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tickerErrors, setTickerErrors] = useState<{ ticker: string, error: string }[]>([]);
    const [view, setView] = useState<'performance' | 'allocation' | 'evolution' | 'yield'>('performance');
    const [yieldStartDate, setYieldStartDate] = useState<string>('');
    const [hiddenTickers, setHiddenTickers] = useState<Set<string>>(new Set());

    const filteredIndices = useMemo(() => {
        const target = selectedClass.toLowerCase();
        return indices.filter(idx =>
            target === 'all' ||
            (idx.class && idx.class.toLowerCase() === target)
        );
    }, [indices, selectedClass]);

    // Only show classes that are actually used in the current indices
    const usedClasses = useMemo(() => {
        const classes = new Set(indices.map(i => i.class).filter(Boolean));
        return Array.from(classes).sort() as string[];
    }, [indices]);

    const toggleTicker = (ticker: string) => {
        setHiddenTickers(prev => {
            const next = new Set(prev);
            if (next.has(ticker)) next.delete(ticker);
            else next.add(ticker);
            return next;
        });
    };

    useEffect(() => {
        if (indices.length === 0) {
            setTickerErrors([]);
            setRawResults([]);
            return;
        }

        const fetchData = async () => {
            setLoading(true);
            setError('');
            setTickerErrors([]);
            try {
                // Fetch ALL indices regardless of current filter
                const tickers = indices.map(i => i.ticker).join(',');
                const res = await fetch(`/api/portfolio?tickers=${tickers}&currency=${currency}`);
                const json = await res.json();

                if (json.error) throw new Error(json.error);

                setRawResults(json.results || []);

                const errors: { ticker: string, error: string }[] = [];
                json.results.forEach((item: any) => {
                    if (item.error) errors.push({ ticker: item.ticker, error: item.error });
                });
                setTickerErrors(errors);

            } catch (err: any) {
                setError(err.message || 'Failed to load data');
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, [indices, currency]);

    const processedData = useMemo(() => {
        if (!rawResults.length || filteredIndices.length === 0) return { chartData: [], evolutionData: [] };

        // 1. Collect all unique dates across all valid tickers in the current filter
        const allDatesSet = new Set<string>();
        rawResults.forEach((item: any) => {
            const isFiltered = filteredIndices.some(i => i.ticker === item.ticker);
            if (!item.error && item.data && isFiltered) {
                item.data.forEach((day: any) => allDatesSet.add(day.date.split('T')[0]));
            }
        });

        const sortedDates = Array.from(allDatesSet).sort((a, b) =>
            new Date(a).getTime() - new Date(b).getTime()
        );

        const aggregated: Record<string, number> = {};
        const stacked: Record<string, any> = {};

        // 2. Process each ticker with forward-filling
        rawResults.forEach((item: any) => {
            const indexInfo = filteredIndices.find(i => i.ticker === item.ticker);
            if (item.error || !indexInfo) return;

            const amount = indexInfo.amount;
            const tickerPrices = new Map<string, number>();

            let firstAvailableClose = 0;
            if (item.data && item.data.length > 0) {
                const sortedTickerData = [...item.data].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
                firstAvailableClose = sortedTickerData[0].close || 0;
            }

            item.data.forEach((day: any) => {
                tickerPrices.set(day.date.split('T')[0], day.close || 0);
            });

            let lastKnownClose = firstAvailableClose;

            sortedDates.forEach(date => {
                if (tickerPrices.has(date)) {
                    lastKnownClose = tickerPrices.get(date)!;
                }

                const value = lastKnownClose * amount;
                if (!aggregated[date]) aggregated[date] = 0;
                aggregated[date] += value;

                if (!stacked[date]) stacked[date] = { date };
                stacked[date][item.ticker] = value;
            });
        });

        return {
            chartData: sortedDates.map(date => ({ date, value: aggregated[date] })),
            evolutionData: sortedDates.map(date => stacked[date])
        };
    }, [rawResults, filteredIndices]);

    const data = processedData.chartData;
    const evolutionData = processedData.evolutionData;

    const yieldDataProcessed = useMemo(() => {
        if (!rawResults.length) return [];

        // 1. Get all unique dates
        const allDatesSet = new Set<string>();
        rawResults.forEach((item: any) => {
            if (!item.error && item.data) {
                item.data.forEach((day: any) => allDatesSet.add(day.date.split('T')[0]));
            }
        });
        const sortedDates = Array.from(allDatesSet).sort((a, b) =>
            new Date(a).getTime() - new Date(b).getTime()
        );

        // 2. Filter dates to start from the requested start date (or earliest)
        const plotStartDate = yieldStartDate || sortedDates[0];
        const plotDates = sortedDates.filter(d => d >= plotStartDate);

        if (plotDates.length === 0) return [];

        // 3. Prepare result structure
        const resultsByDate: Record<string, any> = {};
        plotDates.forEach(date => resultsByDate[date] = { date });

        // 4. Calculate yield for each ticker
        rawResults.forEach((item: any) => {
            if (item.error) return;

            const tickerPrices = new Map<string, number>();
            item.data.forEach((day: any) => {
                tickerPrices.set(day.date.split('T')[0], day.close || 0);
            });

            // Find starting price for this specific ticker (first available on or after plotStartDate)
            let startPrice = 0;
            let tickerStartDate = '';

            // We need to find the specific price that acts as the baseline
            for (const date of sortedDates) {
                if (date >= plotStartDate) {
                    const price = tickerPrices.get(date);
                    if (price !== undefined && price > 0) {
                        startPrice = price;
                        tickerStartDate = date;
                        break;
                    }
                }
            }

            if (startPrice === 0) return; // No data for this ticker in the requested range

            // Forward fill prices and calculate yield for all dates in plotDates
            let lastKnownPrice = startPrice;

            plotDates.forEach(date => {
                // If the ticker hasn't "started" yet relative to its first available price in this range, don't plot it
                if (date < tickerStartDate) return;

                const currentPrice = tickerPrices.get(date);
                if (currentPrice !== undefined) {
                    lastKnownPrice = currentPrice;
                }

                const yieldVal = ((lastKnownPrice - startPrice) / startPrice) * 100;
                resultsByDate[date][item.ticker] = yieldVal;
            });
        });

        return Object.values(resultsByDate);
    }, [rawResults, yieldStartDate]);

    const metrics = useMemo(() => {
        if (data.length === 0) return null;

        const latest = data[data.length - 1].value;
        let highest = data[0].value;
        let highestDate = data[0].date;

        data.forEach(d => {
            if (d.value > highest) {
                highest = d.value;
                highestDate = d.date;
            }
        });

        const getReturn = (startDate: Date) => {
            const startData = data.find(d => new Date(d.date) >= startDate) || data[0];
            if (!startData) return { percent: 0, absolute: 0 };
            const percent = ((latest - startData.value) / startData.value) * 100;
            const absolute = latest - startData.value;
            return { percent, absolute };
        };

        const today = new Date();
        const ytdDate = new Date(today.getFullYear(), 0, 1);

        const subMonths = (m: number) => { const d = new Date(); d.setMonth(d.getMonth() - m); return d; };
        const subYears = (y: number) => { const d = new Date(); d.setFullYear(d.getFullYear() - y); return d; };

        return {
            latest,
            highest,
            highestDate,
            athGap: ((latest - highest) / highest) * 100,
            athGapAbs: latest - highest,
            ytd: getReturn(ytdDate),
            m1: getReturn(subMonths(1)),
            m3: getReturn(subMonths(3)),
            m6: getReturn(subMonths(6)),
            m9: getReturn(subMonths(9)),
            y1: getReturn(subYears(1)),
            y2: getReturn(subYears(2)),
            y3: getReturn(subYears(3)),
            y5: getReturn(subYears(5)),
        };
    }, [data]);

    const allocationData = useMemo(() => {
        if (!rawResults.length || filteredIndices.length === 0) return [];

        return filteredIndices.map(idx => {
            const result = rawResults.find(r => r.ticker === idx.ticker);
            if (!result || result.error || !result.data || result.data.length === 0) return null;

            const lastClose = result.data[result.data.length - 1].close || 0;
            const value = lastClose * idx.amount;

            return {
                name: idx.ticker,
                value,
                class: idx.class || 'Stocks'
            };
        }).filter(item => item !== null) as { name: string; value: number; class: string }[];
    }, [filteredIndices, rawResults]);

    useEffect(() => {
        if (allocationData.length > 0 && onAllocationUpdate) {
            const total = allocationData.reduce((sum, item) => sum + item.value, 0);
            if (total > 0) {
                const percentages: Record<string, number> = {};
                allocationData.forEach(item => {
                    percentages[item.name] = (item.value / total) * 100;
                });
                onAllocationUpdate(percentages);
            }
        }
    }, [allocationData, onAllocationUpdate]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0
        }).format(val);
    };

    const renderMetricCard = (label: string, valueData: { percent: number, absolute: number } | number, monthsCount?: number, isCurrency = false) => {
        const isObject = typeof valueData === 'object';
        const percent = isObject ? valueData.percent : (isCurrency ? 0 : valueData);
        const absolute = isObject ? valueData.absolute : (isCurrency ? valueData : 0);

        const isPositive = percent >= 0;
        const cardClass = !isCurrency ? (isPositive ? summaryStyles.positiveCard : summaryStyles.negativeCard) : '';

        return (
            <div className={`${summaryStyles.card} ${cardClass}`}>
                <span className={summaryStyles.label}>{label}</span>
                <span className={`${summaryStyles.value} ${!isCurrency ? (isPositive ? summaryStyles.positive : summaryStyles.negative) : ''}`}>
                    {isCurrency ? formatCurrency(absolute) : `${isPositive ? '+' : ''}${percent.toFixed(2)}%`}
                </span>
                {!isCurrency && isObject && (
                    <span className={summaryStyles.detail}>
                        {absolute >= 0 ? '+' : ''}{formatCurrency(absolute)}
                        {monthsCount && monthsCount > 1 && (
                            <span className={summaryStyles.monthlySub}>
                                ({absolute >= 0 ? '+' : ''}{formatCurrency(absolute / monthsCount)}/month)
                            </span>
                        )}
                    </span>
                )}
            </div>
        );
    };

    if (loading) return <div className={styles.loading}>Loading chart data...</div>;
    if (error && data.length === 0) return <div className={styles.error}>{error}</div>;

    // Check if we have assets to display
    if (indices.length === 0) {
        return <div className={styles.empty}>Add indices to see historical performance</div>;
    }

    if (filteredIndices.length === 0) {
        return (
            <div className={styles.chartContainer}>
                <div className={styles.topControlsRow}>
                    <div className={styles.filterControl}>
                        <select
                            value={selectedClass}
                            onChange={(e) => onClassChange(e.target.value)}
                            className={styles.classFilterSelect}
                        >
                            <option value="All">All</option>
                            {usedClasses.map(c => (
                                <option key={c} value={c}>{c}</option>
                            ))}
                        </select>
                    </div>
                </div>
                <div className={styles.empty}>No assets found in category "{selectedClass}"</div>
            </div>
        );
    }

    return (
        <div className={styles.chartContainer}>
            {tickerErrors.length > 0 && (
                <div className={summaryStyles.tickerErrors}>
                    <h4><span role="img" aria-label="warning">⚠️</span> Some data could not be fetched</h4>
                    <ul>
                        {tickerErrors.map(te => (
                            <li key={te.ticker}><b>{te.ticker}</b>: {te.error}</li>
                        ))}
                    </ul>
                </div>
            )}

            <div className={styles.topControlsRow}>
                <div className={styles.filterGroup}>
                    <span className={styles.filterLabel}>Filter by Category:</span>
                    <div className={styles.classPills}>
                        <button
                            className={`${styles.pill} ${selectedClass === 'All' ? styles.activePill : ''}`}
                            onClick={() => onClassChange('All')}
                        >
                            All
                        </button>
                        {usedClasses.map(c => (
                            <button
                                key={c}
                                className={`${styles.pill} ${selectedClass === c ? styles.activePill : ''}`}
                                onClick={() => onClassChange(c)}
                            >
                                {c}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {metrics && (
                <div className={summaryStyles.summaryGrid}>
                    <div className={summaryStyles.card}>
                        <span className={summaryStyles.label}>Current Value</span>
                        <span className={summaryStyles.value}>{formatCurrency(metrics.latest)}</span>
                        <div className={`${summaryStyles.detail} ${metrics.athGap >= 0 ? summaryStyles.positive : summaryStyles.negative}`}>
                            <span>{metrics.athGapAbs >= 0 ? '+' : ''}{formatCurrency(metrics.athGapAbs)}</span>
                            <span style={{ fontSize: '0.75rem', marginLeft: '6px', opacity: 0.8 }}>
                                ({metrics.athGap.toFixed(2)}%)
                            </span>
                            <span style={{ marginLeft: '4px' }}>from ATH</span>
                        </div>
                    </div>
                    <div className={summaryStyles.card}>
                        <span className={summaryStyles.label}>All-Time High</span>
                        <span className={summaryStyles.value}>{formatCurrency(metrics.highest)}</span>
                        <span className={summaryStyles.detail}>
                            Hit on {new Date(metrics.highestDate).toLocaleDateString()}
                        </span>
                    </div>
                    {renderMetricCard('YTD', metrics.ytd, new Date().getMonth() + 1)}
                    {renderMetricCard('1M', metrics.m1, 1)}
                    {renderMetricCard('3M', metrics.m3, 3)}
                    {renderMetricCard('6M', metrics.m6, 6)}
                    {renderMetricCard('1Y', metrics.y1, 12)}
                    {renderMetricCard('3Y', metrics.y3, 36)}
                    {renderMetricCard('5Y', metrics.y5, 60)}
                </div>
            )}

            <div className={styles.headerRow}>
                <div className={styles.headerTitleGroup}>
                    <h3>Portfolio Performance</h3>
                </div>
                <div className={styles.viewToggle}>
                    <button
                        className={view === 'performance' ? styles.active : ''}
                        onClick={() => setView('performance')}
                    >
                        Performance
                    </button>
                    <button
                        className={view === 'evolution' ? styles.active : ''}
                        onClick={() => setView('evolution')}
                    >
                        Composition
                    </button>
                    <button
                        className={view === 'allocation' ? styles.active : ''}
                        onClick={() => setView('allocation')}
                    >
                        Allocation
                    </button>
                    <button
                        className={view === 'yield' ? styles.active : ''}
                        onClick={() => setView('yield')}
                    >
                        Yield
                    </button>
                </div>
            </div>

            {view === 'yield' && (
                <div className={styles.controls}>
                    <div className={styles.dateGroup}>
                        <label>Start Date:</label>
                        <input
                            type="date"
                            className={styles.dateInput}
                            value={yieldStartDate}
                            onChange={(e) => setYieldStartDate(e.target.value)}
                        />
                    </div>
                </div>
            )}

            <div className={styles.chartWrapper}>
                {view === 'performance' ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={data}>
                            <defs>
                                <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.8} />
                                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="date" stroke="#666" fontSize={12} tickFormatter={(str) => str.substring(0, 4)} />
                            <YAxis stroke="#666" fontSize={12} tickFormatter={(val) => formatCurrency(val)} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#171717', border: '1px solid #333' }}
                                formatter={(val: number) => [formatCurrency(val), 'Value']}
                            />
                            <Area type="monotone" dataKey="value" stroke="#3b82f6" fillOpacity={1} fill="url(#colorValue)" />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : view === 'evolution' ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={evolutionData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="date" stroke="#666" fontSize={12} tickFormatter={(str) => str.substring(0, 4)} />
                            <YAxis stroke="#666" fontSize={12} tickFormatter={(val) => formatCurrency(val)} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#171717', border: '1px solid #333' }}
                                formatter={(val: number) => formatCurrency(val)}
                            />
                            <Legend
                                onClick={(e) => toggleTicker(e.dataKey as string)}
                                wrapperStyle={{ paddingTop: '20px', cursor: 'pointer' }}
                            />
                            {filteredIndices.map((idx, i) => (
                                <Area
                                    key={idx.ticker}
                                    type="monotone"
                                    dataKey={idx.ticker}
                                    stackId="1"
                                    hide={hiddenTickers.has(idx.ticker)}
                                    stroke={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'][i % 7]}
                                    fill={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'][i % 7]}
                                    fillOpacity={0.6}
                                />
                            ))}
                        </AreaChart>
                    </ResponsiveContainer>
                ) : view === 'yield' ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={yieldDataProcessed}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="date" stroke="#666" fontSize={12} tickFormatter={(str) => str.substring(0, 4)} />
                            <YAxis stroke="#666" fontSize={12} tickFormatter={(val) => `${val.toFixed(1)}%`} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#171717', border: '1px solid #333' }}
                                formatter={(val: number) => [`${val.toFixed(2)}%`, 'Yield']}
                            />
                            <Legend
                                onClick={(e) => toggleTicker(e.dataKey as string)}
                                wrapperStyle={{ paddingTop: '20px', cursor: 'pointer' }}
                            />
                            {filteredIndices.map((idx, i) => (
                                <Line
                                    key={idx.ticker}
                                    type="monotone"
                                    dataKey={idx.ticker}
                                    hide={hiddenTickers.has(idx.ticker)}
                                    stroke={['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'][i % 7]}
                                    strokeWidth={2}
                                    dot={false}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <AllocationChart data={allocationData} currency={currency} />
                )}
            </div>
        </div>
    );
}
