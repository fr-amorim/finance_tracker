'use client';

import { useState, useEffect } from 'react';
import TransactionForm from '@/components/TransactionForm';
import HoldingsTable from '@/components/HoldingsTable';
import Chart from '@/components/Chart';
import styles from './page.module.css';

interface PortfolioRef {
    id: string;
    name: string;
}

export default function Home() {
    const [portfolios, setPortfolios] = useState<PortfolioRef[]>([]);
    const [activePortfolioId, setActivePortfolioId] = useState<string>('');
    const [currency, setCurrency] = useState('EUR');

    // Data loaded from API
    const [holdings, setHoldings] = useState<any[]>([]);
    const [portfolioSeries, setPortfolioSeries] = useState<any[]>([]);
    const [chartResults, setChartResults] = useState<any[]>([]);
    const [transactions, setTransactions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const [selectedClass, setSelectedClass] = useState<string>('All');
    const [availableClasses, setAvailableClasses] = useState<string[]>([]);

    const [isClient, setIsClient] = useState(false);

    // Initial load
    useEffect(() => {
        setIsClient(true);
        const savedPortfolios = localStorage.getItem('portfolios');

        if (savedPortfolios) {
            try {
                const parsed = JSON.parse(savedPortfolios);
                // Migrate or just take ID/Name
                const normalized = parsed.map((p: any) => ({
                    id: p.id,
                    name: p.name
                }));
                setPortfolios(normalized);
                if (normalized.length > 0) setActivePortfolioId(normalized[0].id);
            } catch (e) {
                console.error("Failed to parse portfolios", e);
            }
        } else {
            // Default first portfolio
            const defaultId = crypto.randomUUID();
            const defaultPortfolio = { id: defaultId, name: 'Main Portfolio' };
            setPortfolios([defaultPortfolio]);
            setActivePortfolioId(defaultId);
        }
    }, []);

    // Save portfolios metadata to local storage
    useEffect(() => {
        if (!isClient || portfolios.length === 0) return;
        // Only save ID and Name to avoid storing stale data
        const toSave = portfolios.map(p => ({ id: p.id, name: p.name }));
        localStorage.setItem('portfolios', JSON.stringify(toSave));
    }, [portfolios, isClient]);

    // Fetch Data when active portfolio or currency changes
    const fetchData = async () => {
        if (!activePortfolioId) return;
        setLoading(true);
        try {
            const res = await fetch(`/api/portfolio?portfolioId=${activePortfolioId}&currency=${currency}`);
            const data = await res.json();

            if (data.error) {
                console.error("API Error:", data.error);
                return;
            }

            setHoldings(data.holdings || []);
            setPortfolioSeries(data.portfolioSeries || []);
            setChartResults(data.results || []);
            setTransactions(data.transactions || []);
            setAvailableClasses(data.availableClasses || []);

        } catch (error) {
            console.error("Fetch error:", error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [activePortfolioId, currency]);

    const forceRefresh = async () => {
        if (refreshing) return;
        setRefreshing(true);
        try {
            const res = await fetch('/api/admin/refresh', { method: 'POST' });
            if (res.ok) {
                await fetchData();
            } else {
                console.error("Refresh failed");
            }
        } catch (error) {
            console.error("Refresh error:", error);
        } finally {
            setRefreshing(false);
        }
    };

    const addTransaction = async (tx: { ticker: string; type: 'BUY' | 'SELL'; quantity: number; date: string; assetClass?: string }) => {
        if (!activePortfolioId) return;

        try {
            const res = await fetch('/api/transactions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    portfolioId: activePortfolioId,
                    ...tx
                })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(`Error adding transaction: ${err.error}`);
                return;
            }

            // Refresh data
            fetchData();

        } catch (e: any) {
            alert('Failed to add transaction: ' + e.message);
        }
    };

    const addBulkTransactions = async (txs: any[]) => {
        if (!activePortfolioId) return;

        try {
            const res = await fetch('/api/transactions/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    portfolioId: activePortfolioId,
                    transactions: txs
                })
            });

            if (!res.ok) {
                const err = await res.json();
                alert(`Error adding bulk transactions: ${err.error}`);
                return;
            }

            const result = await res.json();
            alert(`Successfully imported ${result.count} transactions!`);
            fetchData();
        } catch (e: any) {
            alert('Bulk import failed: ' + e.message);
        }
    };

    // Portfolio Management
    const createPortfolio = () => {
        const name = prompt('Portfolio Name:');
        if (!name) return;
        const newPortfolio = { id: crypto.randomUUID(), name };
        setPortfolios(prev => [...prev, newPortfolio]);
        setActivePortfolioId(newPortfolio.id);
    };

    const deletePortfolio = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (portfolios.length <= 1) {
            alert('Cannot delete the last portfolio');
            return;
        }
        if (!confirm('Are you sure you want to delete this portfolio?')) return;

        const newPortfolios = portfolios.filter(p => p.id !== id);
        setPortfolios(newPortfolios);
        if (activePortfolioId === id) {
            setActivePortfolioId(newPortfolios[0].id);
        }
    };

    const renamePortfolio = async (e: React.MouseEvent, id: string, currentName: string) => {
        e.stopPropagation();
        const newName = prompt('New Portfolio Name:', currentName);
        if (!newName || newName === currentName) return;

        // Update local state
        setPortfolios(prev => prev.map(p => p.id === id ? { ...p, name: newName } : p));

        // Update Backend
        try {
            await fetch('/api/portfolio', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id, name: newName })
            });
        } catch (error) {
            console.error('Failed to update portfolio name in DB:', error);
        }
    };

    // Helper to format holdings for Chart (backward compatibility with Chart props)
    const chartIndices = holdings.map(h => ({
        ticker: h.ticker,
        amount: h.quantity,
        class: h.assetClass || 'Stocks'
    }));

    if (!isClient) return null;

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div className={styles.headerTop}>
                    <h1>Portfolio Tracker</h1>
                    <div className={styles.headerControls}>
                        <div className={styles.currencyToggle}>
                            <button className={currency === 'EUR' ? styles.active : ''} onClick={() => setCurrency('EUR')}>EUR</button>
                            <button className={currency === 'USD' ? styles.active : ''} onClick={() => setCurrency('USD')}>USD</button>
                        </div>
                    </div>
                </div>

                <div className={styles.portfolioTabs}>
                    {portfolios.map(p => (
                        <div
                            key={p.id}
                            className={`${styles.tab} ${p.id === activePortfolioId ? styles.activeTab : ''}`}
                            onClick={() => setActivePortfolioId(p.id)}
                        >
                            {p.name}
                            <div className={styles.tabActions}>
                                <button className={styles.renameTab} onClick={(e) => renamePortfolio(e, p.id, p.name)}>✎</button>
                                <button className={styles.deleteTab} onClick={(e) => deletePortfolio(e, p.id)}>×</button>
                            </div>
                        </div>
                    ))}
                    <div className={styles.addTabBox}>
                        <button className={styles.addTab} onClick={createPortfolio}>+ New</button>
                        <button
                            className={`${styles.refreshBtn} ${refreshing ? styles.spinning : ''}`}
                            onClick={forceRefresh}
                            title="Force Refresh Data"
                            disabled={refreshing}
                        >
                            ↻
                        </button>
                    </div>
                </div>
            </header>

            <div className={styles.grid}>
                <section className={styles.inputSection}>
                    <TransactionForm
                        onAdd={addTransaction}
                        onBulkAdd={addBulkTransactions}
                        availableClasses={availableClasses}
                    />
                    <HoldingsTable
                        holdings={holdings}
                        transactions={transactions}
                        portfolioId={activePortfolioId}
                        availableClasses={availableClasses}
                        onRefresh={fetchData}
                    />
                </section>

                <section className={styles.chartSection}>
                    {loading ? (
                        <div style={{ color: '#666', padding: '20px' }}>Loading data...</div>
                    ) : (
                        <Chart
                            indices={chartIndices}
                            currency={currency}
                            selectedClass={selectedClass}
                            onClassChange={setSelectedClass}
                            preloadedData={{
                                results: chartResults,
                                portfolioSeries: portfolioSeries
                            }}
                            transactions={transactions}
                        />
                    )}
                </section>
            </div>
        </main>
    );
}
