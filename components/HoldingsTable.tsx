import { useState } from 'react';
import CustomSelect from './CustomSelect';
import styles from './PortfolioInput.module.css'; // Reusing styles

interface Holding {
    ticker: string;
    quantity: number;
    currentPrice: number;
    currentValue: number;
    assetClass: string;
}

interface Transaction {
    id: number;
    ticker: string;
    type: 'BUY' | 'SELL';
    quantity: number;
    date: string;
    assetClass?: string;
}

interface HoldingsTableProps {
    portfolioId: string;
    holdings: Holding[];
    transactions: Transaction[];
    availableClasses: string[];
    onRefresh: () => void;
}

export default function HoldingsTable({ portfolioId, holdings, transactions, availableClasses, onRefresh }: HoldingsTableProps) {
    const [expandedTicker, setExpandedTicker] = useState<string | null>(null);

    const toggleExpand = (ticker: string) => {
        setExpandedTicker(expandedTicker === ticker ? null : ticker);
    };

    const updateAssetClass = async (ticker: string, newClass: string) => {
        // Bulk update all transactions for this ticker
        const relevantTx = transactions.filter(tx => tx.ticker === ticker);
        try {
            await Promise.all(relevantTx.map(tx =>
                fetch('/api/transactions', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: tx.id, assetClass: newClass })
                })
            ));
            onRefresh();
        } catch (error) {
            console.error(error);
        }
    };

    const deleteAsset = async (e: React.MouseEvent, ticker: string) => {
        e.stopPropagation();
        if (!confirm(`Are you sure you want to delete ALL transactions for ${ticker}? This will remove the asset from your portfolio.`)) return;

        try {
            const res = await fetch(`/api/transactions?portfolioId=${portfolioId}&ticker=${ticker}`, {
                method: 'DELETE'
            });
            if (res.ok) onRefresh();
            else alert('Failed to delete asset');
        } catch (error) {
            console.error(error);
        }
    };

    const deleteTransaction = async (id: number) => {
        if (!confirm('Delete this transaction?')) return;
        try {
            const res = await fetch(`/api/transactions?id=${id}`, {
                method: 'DELETE'
            });
            if (res.ok) onRefresh();
            else alert('Failed to delete transaction');
        } catch (error) {
            console.error(error);
        }
    };

    const editTransaction = async (tx: Transaction) => {
        const newQty = prompt('New Quantity:', tx.quantity.toString());
        if (newQty === null) return;

        const newDate = prompt('New Date (YYYY-MM-DD):', tx.date.split('T')[0]);
        if (newDate === null) return;

        try {
            const res = await fetch('/api/transactions', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    id: tx.id,
                    quantity: parseFloat(newQty),
                    date: newDate
                })
            });
            if (res.ok) onRefresh();
            else alert('Failed to update transaction');
        } catch (error) {
            console.error(error);
        }
    };

    if (holdings.length === 0) {
        return <div className={styles.emptyState}>No holdings found. Add a transaction to start.</div>;
    }

    const totalValue = holdings.reduce((sum, h) => sum + h.currentValue, 0);

    return (
        <div className={styles.container}>
            <div className={styles.listHeader}>
                <span>Current Holdings</span>
                <span style={{ float: 'right', fontWeight: 'bold' }}>
                    Total: {totalValue.toLocaleString(undefined, { style: 'currency', currency: 'EUR' })}
                </span>
            </div>
            <ul className={styles.list}>
                {holdings.map((h) => {
                    const isExpanded = expandedTicker === h.ticker;
                    const tickerTransactions = transactions
                        .filter(tx => tx.ticker === h.ticker)
                        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

                    return (
                        <li key={h.ticker} className={`${styles.item} ${isExpanded ? styles.itemExpanded : ''}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
                            <div className={styles.info} onClick={() => toggleExpand(h.ticker)} style={{ cursor: 'pointer' }}>
                                <div className={styles.topInfo}>
                                    <div className={styles.tickerGroup}>
                                        <span className={styles.ticker}>{h.ticker}</span>
                                        <span style={{ fontSize: '0.8rem', opacity: 0.5 }}>{isExpanded ? '▼' : '▶'}</span>
                                        <span className={styles.classBadge} style={{ fontSize: '0.65rem', marginLeft: '8px', padding: '2px 6px', background: 'rgba(59, 130, 246, 0.1)', color: '#60a5fa', borderRadius: '4px' }}>
                                            {h.assetClass}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <span className={styles.details} style={{ color: '#fff', fontWeight: '600' }}>
                                            {h.currentValue.toLocaleString(undefined, { style: 'currency', currency: 'EUR' })}
                                        </span>
                                        <button
                                            className={styles.deleteTab}
                                            onClick={(e) => deleteAsset(e, h.ticker)}
                                            title="Delete Asset History"
                                            style={{ opacity: 0.5 }}
                                        >×</button>
                                    </div>
                                </div>
                                <div className={styles.editGroup}>
                                    <span className={styles.unitLabel}>
                                        {h.quantity.toLocaleString(undefined, { maximumFractionDigits: 4 })} shares
                                        @ {h.currentPrice.toLocaleString(undefined, { style: 'currency', currency: 'EUR' })}
                                    </span>
                                </div>
                            </div>

                            {isExpanded && (
                                <div className={styles.transactionsList}>
                                    <div className={styles.bulkActions} style={{ marginBottom: '12px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', alignItems: 'center' }}>
                                        <label style={{ fontSize: '0.7rem', color: '#9ca3af', marginRight: '8px' }}>Assign Class:</label>
                                        <div style={{ width: '150px' }}>
                                            <CustomSelect
                                                options={availableClasses}
                                                value={h.assetClass}
                                                onChange={(val) => updateAssetClass(h.ticker, val)}
                                            />
                                        </div>
                                    </div>
                                    {tickerTransactions.map((tx) => (
                                        <div key={tx.id} className={styles.transactionItem}>
                                            <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                <span className={`${styles.txType} ${tx.type === 'BUY' ? styles.txBuy : styles.txSell}`}>
                                                    {tx.type}
                                                </span>
                                                <span>{tx.quantity.toLocaleString()} @ {new Date(tx.date).toLocaleDateString()}</span>
                                                {tx.assetClass && tx.assetClass !== h.assetClass && (
                                                    <span style={{ fontSize: '0.6rem', opacity: 0.5 }}>({tx.assetClass})</span>
                                                )}
                                            </div>
                                            <div className={styles.tabActions} style={{ position: 'static', opacity: 1, transform: 'none' }}>
                                                <button className={styles.renameTab} onClick={() => editTransaction(tx)} title="Edit">✎</button>
                                                <button className={styles.deleteTab} onClick={() => deleteTransaction(tx.id)} title="Delete">×</button>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
