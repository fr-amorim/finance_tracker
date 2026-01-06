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
    preloadedData?: { results: any[], portfolioSeries: any[] };
    transactions?: any[];
}

export default function Chart({
    indices,
    currency,
    availableClasses = [],
    onAllocationUpdate,
    selectedClass,
    onClassChange,
    preloadedData,
    transactions = []
}: ChartProps) {
    const [rawResults, setRawResults] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [tickerErrors, setTickerErrors] = useState<{ ticker: string, error: string }[]>([]);
    const [view, setView] = useState<'performance' | 'allocation' | 'evolution' | 'yield'>('performance');
    const [yieldStartDate, setYieldStartDate] = useState<string>('');
    const [hiddenTickers, setHiddenTickers] = useState<Set<string>>(new Set());
    const [timeWindow, setTimeWindow] = useState('ALL');

    const filterStartDate = useMemo(() => {
        if (timeWindow === 'ALL') return null;
        const now = new Date();
        const start = new Date();
        switch (timeWindow) {
            case '5D': start.setDate(now.getDate() - 5); break;
            case '1M': start.setMonth(now.getMonth() - 1); break;
            case '3M': start.setMonth(now.getMonth() - 3); break;
            case '6M': start.setMonth(now.getMonth() - 6); break;
            case 'YTD':
                start.setFullYear(now.getFullYear(), 0, 1);
                start.setHours(0, 0, 0, 0);
                break;
            case '1A': start.setFullYear(now.getFullYear() - 1); break;
            case '5A': start.setFullYear(now.getFullYear() - 5); break;
            default: return null;
        }
        return start.toISOString().split('T')[0];
    }, [timeWindow]);

    const filteredIndices = useMemo(() => {
        const target = selectedClass.toLowerCase();
        return indices.filter(idx =>
            target === 'all' ||
            (idx.class && idx.class.toLowerCase() === target)
        );
    }, [indices, selectedClass]);

    // Help map tickers to classes (including those fully sold)
    const tickerToClass = useMemo(() => {
        const map: Record<string, string> = {};
        transactions.forEach(tx => {
            if (tx.ticker && tx.assetClass) map[tx.ticker] = tx.assetClass;
        });
        indices.forEach(idx => {
            if (idx.ticker && idx.class) map[idx.ticker] = idx.class;
        });
        return map;
    }, [transactions, indices]);

    const usedClasses = useMemo(() => {
        const classes = new Set<string>();
        // Use provided classes
        availableClasses.forEach(c => classes.add(c));
        // Add classes from current indices
        indices.forEach(i => { if (i.class) classes.add(i.class); });
        // Add classes from transactions
        transactions.forEach(t => { if (t.assetClass) classes.add(t.assetClass); });

        return Array.from(classes).sort();
    }, [availableClasses, indices, transactions]);

    const toggleTicker = (ticker: string) => {
        setHiddenTickers(prev => {
            const next = new Set(prev);
            if (next.has(ticker)) next.delete(ticker);
            else next.add(ticker);
            return next;
        });
    };

    useEffect(() => {
        if (preloadedData) {
            setRawResults(preloadedData.results || []);
            return;
        }

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
    }, [indices, currency, preloadedData]);

    const processedData = useMemo(() => {
        // Use preloaded series if available (Transaction Mode)
        if (preloadedData && preloadedData.portfolioSeries) {
            const target = selectedClass.toLowerCase();

            const filteredSeries = preloadedData.portfolioSeries.map(day => {
                if (target === 'all') return day;

                let classTotal = 0;
                const newDay: any = { date: day.date };

                // Copy over individual ticker values if they belong to the selected class
                // Identify tickers from the keys of the day object (excluding date and value)
                Object.keys(day).forEach(key => {
                    if (key === 'date' || key === 'value') return;

                    const tickerClass = (tickerToClass[key] || 'Stocks').toLowerCase();
                    if (tickerClass === target) {
                        newDay[key] = day[key];
                        classTotal += day[key];
                    }
                });

                newDay.value = classTotal;
                return newDay;
            }).filter(day => {
                const isClassValid = target === 'all' || (day.value && day.value > 0);
                if (!isClassValid) return false;
                if (filterStartDate && day.date < filterStartDate) return false;
                return true;
            });

            return {
                chartData: filteredSeries,
                evolutionData: filteredSeries
            };
        }

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

        const finalDates = filterStartDate ? sortedDates.filter(d => d >= filterStartDate) : sortedDates;

        return {
            chartData: finalDates.map(date => ({ date, value: aggregated[date] })),
            evolutionData: finalDates.map(date => stacked[date])
        };
    }, [rawResults, filteredIndices, preloadedData, filterStartDate, selectedClass, tickerToClass]);

    const data = processedData?.chartData || [];
    const evolutionData = processedData?.evolutionData || [];

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

        // 2. Filter dates based on time window or yieldStartDate
        let plotStartDate = yieldStartDate || sortedDates[0];
        if (filterStartDate && (!yieldStartDate || filterStartDate > yieldStartDate)) {
            plotStartDate = filterStartDate;
        }
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
    }, [rawResults, yieldStartDate, filterStartDate]);

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
    // Custom Tooltip for Transactions
    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const date = label;
            const target = selectedClass.toLowerCase();
            const dailyTransactions = transactions.filter(t => {
                const isMatch = t.date.split('T')[0] === date;
                if (target !== 'all' && isMatch) {
                    return t.assetClass && t.assetClass.toLowerCase() === target;
                }
                return isMatch;
            });

            return (
                <div className={styles.customTooltip}>
                    <p className={styles.tooltipDate}>{new Date(date).toLocaleDateString()}</p>
                    {payload.map((p: any, i: number) => (
                        <div key={i} className={styles.tooltipValue} style={{ color: p.color || p.fill }}>
                            <span>{p.name}: {view === 'yield' ? `${p.value.toFixed(2)}%` : formatCurrency(p.value)}</span>
                        </div>
                    ))}
                    {dailyTransactions.length > 0 && (
                        <div className={styles.tooltipTransactions}>
                            <div className={styles.txHeader}>Transactions:</div>
                            {dailyTransactions.map((tx, idx) => (
                                <div key={idx} className={styles.txRow}>
                                    <span className={tx.type === 'BUY' ? styles.buyText : styles.sellText}>
                                        {tx.type}
                                    </span>
                                    <span className={styles.txInfo}>
                                        {tx.quantity} {tx.ticker}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            );
        }
        return null;
    };

    // Custom Dot for Transaction Events
    const EventDot = (props: any) => {
        const { cx, cy, payload } = props;
        if (!payload || !payload.date) return null;

        const date = payload.date;
        const target = selectedClass.toLowerCase();
        const ticker = props.dataKey; // Recharts passes dataKey to the dot component

        const dailyTransactions = transactions.filter(t => {
            const txDate = t.date.split('T')[0];
            const isMatch = txDate === date;

            // If ticker is provided (and not 'value'), filter by that ticker specifically
            if (ticker && ticker !== 'value' && isMatch) {
                return t.ticker === ticker;
            }

            if (target !== 'all' && isMatch) {
                return t.assetClass && t.assetClass.toLowerCase() === target;
            }
            return isMatch;
        });

        if (dailyTransactions.length === 0) return null;

        const isBuy = dailyTransactions.some(t => t.type === 'BUY');
        const isSell = dailyTransactions.some(t => t.type === 'SELL');

        let color = '#3b82f6'; // Mixed
        if (isBuy && !isSell) color = '#22c55e';
        if (isSell && !isBuy) color = '#ef4444';

        return (
            <circle
                cx={cx}
                cy={cy}
                r={6}
                fill={color}
                stroke="#fff"
                strokeWidth={2}
                style={{ cursor: 'pointer', filter: 'drop-shadow(0 0 4px rgba(0,0,0,0.5))' }}
            />
        );
    };

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
                    <div className={styles.classPills} style={{ marginLeft: 'auto' }}>
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
                    <div className={styles.viewToggle}>
                        <button className={view === 'performance' ? styles.active : ''} onClick={() => setView('performance')}>Performance</button>
                        <button className={view === 'evolution' ? styles.active : ''} onClick={() => setView('evolution')}>Composition</button>
                        <button className={view === 'yield' ? styles.active : ''} onClick={() => setView('yield')}>Yield</button>
                        <button className={view === 'allocation' ? styles.active : ''} onClick={() => setView('allocation')}>Allocation</button>
                    </div>
                </div>

                <div className={styles.classPills} style={{ marginLeft: 'auto' }}>
                    {['5D', '1M', '3M', '6M', 'YTD', '1A', '5A', 'ALL'].map(w => (
                        <button
                            key={w}
                            className={`${styles.pill} ${timeWindow === w ? styles.activePill : ''}`}
                            onClick={() => setTimeWindow(w)}
                        >
                            {w}
                        </button>
                    ))}
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
                            <Tooltip content={<CustomTooltip />} />
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#3b82f6"
                                fillOpacity={1}
                                fill="url(#colorValue)"
                                dot={<EventDot />}
                                activeDot={{ r: 8 }}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                ) : view === 'evolution' ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={evolutionData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                            <XAxis dataKey="date" stroke="#666" fontSize={12} tickFormatter={(str) => str.substring(0, 4)} />
                            <YAxis stroke="#666" fontSize={12} tickFormatter={(val) => formatCurrency(val)} />
                            <Tooltip content={<CustomTooltip />} />
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
                                    dot={<EventDot />}
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
                            <Tooltip content={<CustomTooltip />} />
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
                                    dot={<EventDot />}
                                />
                            ))}
                        </LineChart>
                    </ResponsiveContainer>
                ) : (
                    <AllocationChart data={allocationData} currency={currency} />
                )}
            </div>
        </div >
    );
}
