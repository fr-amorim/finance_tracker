'use client';

import { useState, useEffect, useMemo } from 'react';
import PortfolioInput from '@/components/PortfolioInput';
import Chart from '@/components/Chart';
import styles from './page.module.css';

export default function Home() {
    const [portfolios, setPortfolios] = useState<{ id: string, name: string, indices: any[], classes: string[] }[]>([]);
    const [activePortfolioId, setActivePortfolioId] = useState<string>('');
    const [currency, setCurrency] = useState('EUR');
    const [allocations, setAllocations] = useState<Record<string, number>>({});
    const [selectedClass, setSelectedClass] = useState<string>('All');
    const [isClient, setIsClient] = useState(false);

    // Reset filter when switching portfolios
    useEffect(() => {
        setSelectedClass('All');
    }, [activePortfolioId]);

    // Initial load and migration
    useEffect(() => {
        setIsClient(true);
        const savedPortfolios = localStorage.getItem('portfolios');
        const oldIndices = localStorage.getItem('portfolio_indices');

        if (savedPortfolios) {
            const parsed = JSON.parse(savedPortfolios);
            // Ensure all portfolios have a classes array for backward compatibility
            const normalized = parsed.map((p: any) => ({
                ...p,
                classes: p.classes || ['Stocks', 'Funds', 'Crypto']
            }));
            setPortfolios(normalized);
            if (normalized.length > 0) setActivePortfolioId(normalized[0].id);
        } else if (oldIndices) {
            const defaultPortfolio = {
                id: crypto.randomUUID(),
                name: 'Main Portfolio',
                indices: JSON.parse(oldIndices),
                classes: ['Stocks', 'Funds', 'Crypto']
            };
            setPortfolios([defaultPortfolio]);
            setActivePortfolioId(defaultPortfolio.id);
            localStorage.removeItem('portfolio_indices');
        } else {
            const defaultPortfolio = {
                id: crypto.randomUUID(),
                name: 'My Portfolio',
                indices: [],
                classes: ['Stocks', 'Funds', 'Crypto']
            };
            setPortfolios([defaultPortfolio]);
            setActivePortfolioId(defaultPortfolio.id);
        }
    }, []);

    // Save to local storage
    useEffect(() => {
        if (!isClient || portfolios.length === 0) return;
        localStorage.setItem('portfolios', JSON.stringify(portfolios));
    }, [portfolios, isClient]);

    const activePortfolio = portfolios.find(p => p.id === activePortfolioId) || portfolios[0];

    const addIndex = (newIndex: any) => {
        setPortfolios(prev => prev.map(p => {
            if (p.id === activePortfolioId) {
                // Normalize class casing based on existing classes
                const existingClass = p.classes.find(c => c.toLowerCase() === (newIndex.class || '').toLowerCase());
                const finalClass = existingClass || newIndex.class || 'Stocks';
                const newClasses = existingClass || !newIndex.class ? p.classes : [...p.classes, newIndex.class];

                return {
                    ...p,
                    classes: newClasses,
                    indices: [...p.indices, { ...newIndex, class: finalClass }]
                };
            }
            return p;
        }));
    };

    const removeIndex = (ticker: string) => {
        setPortfolios(prev => prev.map(p => {
            if (p.id === activePortfolioId) {
                return { ...p, indices: p.indices.filter((i: any) => i.ticker !== ticker) };
            }
            return p;
        }));
    };

    const updateIndex = (ticker: string, newAmount: number) => {
        setPortfolios(prev => prev.map(p => {
            if (p.id === activePortfolioId) {
                return {
                    ...p,
                    indices: p.indices.map((i: any) =>
                        i.ticker === ticker ? { ...i, amount: newAmount } : i
                    )
                };
            }
            return p;
        }));
    };

    const updateClass = (ticker: string, newClass: string) => {
        setPortfolios(prev => prev.map(p => {
            if (p.id === activePortfolioId) {
                // Check if class exists (case-insensitive) and use existing casing if found
                const existingClass = p.classes.find(c => c.toLowerCase() === newClass.toLowerCase());
                const finalClass = existingClass || newClass;
                const newClasses = existingClass ? p.classes : [...p.classes, newClass];

                return {
                    ...p,
                    classes: newClasses,
                    indices: p.indices.map((i: any) =>
                        i.ticker === ticker ? { ...i, class: finalClass } : i
                    )
                };
            }
            return p;
        }));
    };

    const removeClass = (className: string) => {
        if (!confirm(`Are you sure you want to delete the class "${className}"? All assets in this class will be reset.`)) return;

        setPortfolios(prev => prev.map(p => {
            if (p.id === activePortfolioId) {
                return {
                    ...p,
                    classes: p.classes.filter(c => c !== className),
                    indices: p.indices.map((i: any) =>
                        i.class === className ? { ...i, class: '' } : i
                    )
                };
            }
            return p;
        }));
    };

    const createPortfolio = () => {
        const name = prompt('Portfolio Name:');
        if (!name) return;
        const newPortfolio = {
            id: crypto.randomUUID(),
            name,
            indices: [],
            classes: ['Stocks', 'Funds', 'Crypto']
        };
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

    const renamePortfolio = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        const portfolio = portfolios.find(p => p.id === id);
        if (!portfolio) return;

        const newName = prompt('New title for your portfolio:', portfolio.name);
        if (!newName || newName === portfolio.name) return;

        setPortfolios(prev => prev.map(p =>
            p.id === id ? { ...p, name: newName } : p
        ));
    };

    if (!isClient || !activePortfolio) return null;

    return (
        <main className={styles.main}>
            <header className={styles.header}>
                <div className={styles.headerTop}>
                    <h1>Portfolio Tracker</h1>
                    <div className={styles.headerControls}>
                        <div className={styles.currencyToggle}>
                            <button
                                className={currency === 'EUR' ? styles.active : ''}
                                onClick={() => setCurrency('EUR')}
                            >
                                EUR
                            </button>
                            <button
                                className={currency === 'USD' ? styles.active : ''}
                                onClick={() => setCurrency('USD')}
                            >
                                USD
                            </button>
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
                                <button
                                    className={styles.renameTab}
                                    onClick={(e) => renamePortfolio(e, p.id)}
                                    title="Rename Portfolio"
                                >
                                    ✎
                                </button>
                                <button
                                    className={styles.deleteTab}
                                    onClick={(e) => deletePortfolio(e, p.id)}
                                    title="Delete Portfolio"
                                >
                                    ×
                                </button>
                            </div>
                        </div>
                    ))}
                    <button className={styles.addTab} onClick={createPortfolio}>+ New Portfolio</button>
                </div>
            </header>

            <div className={styles.grid}>
                <section className={styles.inputSection}>
                    <PortfolioInput
                        onAdd={addIndex}
                        indices={activePortfolio.indices}
                        onRemove={removeIndex}
                        onUpdate={updateIndex}
                        onUpdateClass={updateClass}
                        onRemoveClass={removeClass}
                        allocations={allocations}
                        availableClasses={activePortfolio.classes}
                        selectedClass={selectedClass}
                    />
                </section>

                <section className={styles.chartSection}>
                    <Chart
                        indices={activePortfolio.indices}
                        availableClasses={activePortfolio.classes}
                        currency={currency}
                        onAllocationUpdate={setAllocations}
                        selectedClass={selectedClass}
                        onClassChange={setSelectedClass}
                    />
                </section>
            </div>
        </main>
    );
}
