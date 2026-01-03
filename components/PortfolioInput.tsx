import { useState, useEffect } from 'react';
import styles from './PortfolioInput.module.css';

interface IndexItem {
    ticker: string;
    amount: number;
    name?: string;
    class?: string;
}

interface PortfolioInputProps {
    indices: IndexItem[];
    onAdd: (item: IndexItem) => void;
    onRemove: (ticker: string) => void;
    onUpdate: (ticker: string, amount: number) => void;
    onUpdateClass: (ticker: string, newClass: string) => void;
    onRemoveClass: (className: string) => void;
    allocations?: Record<string, number>;
    availableClasses?: string[];
    selectedClass?: string;
}

function EditableAmount({ ticker, amount, onUpdate }: { ticker: string, amount: number, onUpdate: (t: string, a: number) => void }) {
    const [localValue, setLocalValue] = useState(amount.toString());

    useEffect(() => {
        setLocalValue(amount.toString());
    }, [amount]);

    const handleChange = (val: string) => {
        setLocalValue(val);
        const parsed = parseFloat(val);
        if (!isNaN(parsed)) {
            onUpdate(ticker, parsed);
        }
    };

    return (
        <input
            type="number"
            value={localValue}
            onChange={(e) => handleChange(e.target.value)}
            className={styles.amountInput}
            step="any"
        />
    );
}

function EditableClass({ ticker, currentClass, onUpdate, availableClasses }: { ticker: string, currentClass: string, onUpdate: (t: string, c: string) => void, availableClasses: string[] }) {
    const [isEditing, setIsEditing] = useState(false);
    const [localClass, setLocalClass] = useState(currentClass);

    const handleBlur = () => {
        setIsEditing(false);
        if (localClass !== currentClass && localClass.trim()) {
            onUpdate(ticker, localClass.trim());
        }
    };

    if (isEditing) {
        return (
            <input
                autoFocus
                type="text"
                value={localClass}
                onChange={(e) => setLocalClass(e.target.value)}
                onBlur={handleBlur}
                onKeyDown={(e) => e.key === 'Enter' && handleBlur()}
                className={styles.classEditInput}
                list={`classes-edit-${ticker}`}
            />
        );
    }

    return (
        <span
            className={styles.classTag}
            onClick={() => setIsEditing(true)}
            title="Click to edit class"
        >
            {currentClass || 'Stocks'}
        </span>
    );
}

export default function PortfolioInput({
    indices,
    onAdd,
    onRemove,
    onUpdate,
    onUpdateClass,
    onRemoveClass,
    allocations = {},
    availableClasses = [],
    selectedClass = 'All'
}: PortfolioInputProps) {
    const [ticker, setTicker] = useState('');
    const [amount, setAmount] = useState('');
    const [name, setName] = useState('');
    const [assetClass, setAssetClass] = useState('Stocks');

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!ticker || !amount) return;

        onAdd({
            ticker: ticker.toUpperCase(),
            amount: parseFloat(amount),
            name,
            class: assetClass || 'Stocks'
        });

        setTicker('');
        setAmount('');
        setName('');
    };

    return (
        <div className={styles.container}>
            <div className={styles.headerRow}>
                <h2>Portfolio Assets</h2>
            </div>

            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.formRow}>
                    <div className={styles.inputGroup}>
                        <label>Ticker</label>
                        <input
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value)}
                            placeholder="e.g. AAPL"
                            required
                        />
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Amount</label>
                        <input
                            type="number"
                            value={amount}
                            onChange={(e) => setAmount(e.target.value)}
                            placeholder="Shares"
                            required
                            step="any"
                        />
                    </div>
                </div>

                <div className={styles.formRow}>
                    <div className={styles.inputGroup}>
                        <label>Asset Class</label>
                        <input
                            type="text"
                            value={assetClass}
                            onChange={(e) => setAssetClass(e.target.value)}
                            list="available-classes"
                            placeholder="e.g. Stocks, Crypto"
                        />
                        <datalist id="available-classes">
                            {availableClasses.map(c => <option key={c} value={c} />)}
                        </datalist>
                    </div>
                    <div className={styles.inputGroup}>
                        <label>Label (Optional)</label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="Investment Name"
                        />
                    </div>
                </div>

                {availableClasses.length > 0 && (
                    <div className={styles.classManagement}>
                        <label className={styles.sectionLabel}>Active Class Tags</label>
                        <div className={styles.classTagList}>
                            {availableClasses.map(c => (
                                <div key={c} className={styles.manageClassTag}>
                                    <span>{c}</span>
                                    <button
                                        type="button"
                                        onClick={() => onRemoveClass(c)}
                                        className={styles.deleteClassBtn}
                                        title={`Delete class "${c}"`}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                <small className={styles.hint}>Try <b>.DE</b> for German, <b>.L</b> for London, etc.</small>
                <button type="submit" className={styles.addButton}>Add Asset</button>
            </form>

            <div className={styles.listHeader}>
                <span>Manage Holdings</span>
            </div>

            <ul className={styles.list}>
                {indices
                    .filter(idx => {
                        if (!selectedClass || selectedClass === 'All') return true;
                        return (idx.class || '').toLowerCase() === selectedClass.toLowerCase();
                    })
                    .map((idx) => (
                        <li key={idx.ticker} className={styles.item}>
                            <div className={styles.info}>
                                <div className={styles.topInfo}>
                                    <div className={styles.tickerGroup}>
                                        <span className={styles.ticker}>{idx.ticker}</span>
                                        <EditableClass
                                            ticker={idx.ticker}
                                            currentClass={idx.class || 'Stocks'}
                                            onUpdate={onUpdateClass}
                                            availableClasses={availableClasses}
                                        />
                                        <datalist id={`classes-edit-${idx.ticker}`}>
                                            {availableClasses.map(c => <option key={c} value={c} />)}
                                        </datalist>
                                    </div>
                                    {allocations[idx.ticker] !== undefined && (
                                        <span className={styles.allocationBadge}>
                                            {allocations[idx.ticker].toFixed(1)}%
                                        </span>
                                    )}
                                </div>
                                <div className={styles.editGroup}>
                                    <EditableAmount
                                        ticker={idx.ticker}
                                        amount={idx.amount}
                                        onUpdate={onUpdate}
                                    />
                                    <span className={styles.unitLabel}>shares</span>
                                </div>
                                <span className={styles.details}>{idx.name || 'Unnamed Asset'}</span>
                            </div>
                            <button onClick={() => onRemove(idx.ticker)} className={styles.removeButton}>Remove</button>
                        </li>
                    ))}
            </ul>
        </div>
    );
}
