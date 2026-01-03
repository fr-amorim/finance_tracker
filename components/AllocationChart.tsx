import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import styles from './AllocationChart.module.css';

interface AllocationChartProps {
    data: { name: string; value: number; class: string }[];
    currency: string;
}

const CLASS_COLORS: Record<string, string> = {
    'Stocks': '#3b82f6',    // Blue
    'Funds': '#10b981',     // Green
    'Crypto': '#8b5cf6',    // Purple
    'Commodities': '#f59e0b', // Orange
    'Real Estate': '#ef4444', // Red
    'Cash': '#6b7280'       // Gray
};

const DEFAULT_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1', '#14b8a6', '#f43f5e'];

export default function AllocationChart({ data, currency }: AllocationChartProps) {
    if (!data || data.length === 0) return null;

    const totalValue = data.reduce((sum, item) => sum + item.value, 0);

    // Helper to adjust color brightness
    const lightenColor = (color: string, percent: number) => {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const B = ((num >> 8) & 0x00FF) + amt;
        const G = (num & 0x0000FF) + amt;
        return '#' + (
            0x1000000 +
            (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
            (B < 255 ? (B < 1 ? 0 : B) : 255) * 0x100 +
            (G < 255 ? (G < 1 ? 0 : G) : 255)
        ).toString(16).slice(1);
    };

    // 1. Prepare Classes Data (Inner Ring)
    const classGroups = data.reduce((acc, curr) => {
        const cls = curr.class || 'Other';
        if (!acc[cls]) acc[cls] = 0;
        acc[cls] += curr.value;
        return acc;
    }, {} as Record<string, number>);

    // Sort classes alphabetically to ensure stable order
    const sortedClassNames = Object.keys(classGroups).sort();

    const innerData = sortedClassNames.map((name, index) => ({
        name,
        value: classGroups[name],
        color: CLASS_COLORS[name] || DEFAULT_COLORS[index % DEFAULT_COLORS.length]
    }));

    // 2. Prepare Assets Data (Outer Ring)
    // Group assets by class first
    const assetsByClass: Record<string, typeof data> = {};
    data.forEach(asset => {
        const cls = asset.class || 'Other';
        if (!assetsByClass[cls]) assetsByClass[cls] = [];
        assetsByClass[cls].push(asset);
    });

    const outerData: any[] = [];

    // Iterate classes in the SAME order as inner ring
    sortedClassNames.forEach(cls => {
        const assets = assetsByClass[cls].sort((a, b) => b.value - a.value); // Sort assets by value descending within class
        const baseColor = CLASS_COLORS[cls] || '#333';

        assets.forEach((asset, index) => {
            // Calculate shading: spread from slightly darker to slightly lighter
            // e.g. -20% to +20% lightness based on position
            let shade = 0;
            if (assets.length > 1) {
                // Spread range: -15 (darker) to +15 (lighter)
                const step = 30 / (assets.length);
                shade = -15 + (step * index);
            }

            outerData.push({
                ...asset,
                color: lightenColor(baseColor, shade)
            });
        });
    });

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            maximumFractionDigits: 0
        }).format(val);
    };

    const CustomTooltip = ({ active, payload }: any) => {
        if (active && payload && payload.length) {
            const data = payload[0].payload;
            return (
                <div style={{ backgroundColor: '#171717', border: '1px solid #333', padding: '10px', borderRadius: '8px' }}>
                    <p style={{ margin: 0, fontWeight: 'bold', color: 'white' }}>{data.name}</p>
                    {data.class && <p style={{ margin: 0, fontSize: '0.8rem', color: '#888' }}>Class: {data.class}</p>}
                    <p style={{ margin: 0, color: '#3b82f6' }}>{formatCurrency(data.value)}</p>
                </div>
            );
        }
        return null;
    };

    return (
        <div className={styles.container}>
            <h3>Portfolio Allocation</h3>
            <div className={styles.content}>
                <div className={styles.chartWrapper}>
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            {/* Center Text */}
                            <text x="50%" y="50%" textAnchor="middle" dominantBaseline="middle">
                                <tspan x="50%" dy="-10" fontSize="12" fill="#9ca3af">Total Value</tspan>
                                <tspan x="50%" dy="24" fontSize="18" fontWeight="bold" fill="#f3f4f6">
                                    {formatCurrency(totalValue)}
                                </tspan>
                            </text>

                            {/* Inner Pie - Classes (Donut) */}
                            <Pie
                                data={innerData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={60}
                                outerRadius={85}
                                stroke="#171717"
                                strokeWidth={2}
                                paddingAngle={1}
                            >
                                {innerData.map((entry, index) => (
                                    <Cell key={`inner-${index}`} fill={entry.color} />
                                ))}
                            </Pie>

                            {/* Outer Pie - Assets (Sunburst - Connected) */}
                            <Pie
                                data={outerData}
                                dataKey="value"
                                nameKey="name"
                                cx="50%"
                                cy="50%"
                                innerRadius={86}
                                outerRadius={125}
                                stroke="#171717"
                                strokeWidth={1}
                                paddingAngle={1}
                            >
                                {outerData.map((entry, index) => (
                                    <Cell
                                        key={`outer-${index}`}
                                        fill={entry.color}
                                        fillOpacity={0.8}
                                    />
                                ))}
                            </Pie>
                            <Tooltip content={<CustomTooltip />} />
                        </PieChart>
                    </ResponsiveContainer>
                </div>

                <div className={styles.legendContainer}>
                    <div className={styles.legendSection}>
                        <h4>Categories</h4>
                        <div className={styles.legendGrid}>
                            {innerData.map((entry, index) => (
                                <div key={`legend-inner-${index}`} className={styles.legendItem}>
                                    <span className={styles.dot} style={{ backgroundColor: entry.color }}></span>
                                    <span className={styles.name}>{entry.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className={styles.legendSection}>
                        <h4>Holdings</h4>
                        <div className={styles.legendGrid}>
                            {outerData.map((entry, index) => (
                                <div key={`legend-outer-${index}`} className={styles.legendItem}>
                                    <span className={styles.dot} style={{ backgroundColor: entry.color, opacity: 0.8 }}></span>
                                    <span className={styles.name}>{entry.name}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
