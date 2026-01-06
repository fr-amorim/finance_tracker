import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import CustomSelect from './CustomSelect';
import styles from './PortfolioInput.module.css';

interface TransactionFormProps {
    onAdd: (transaction: { ticker: string; type: 'BUY' | 'SELL'; quantity: number; date: string; assetClass?: string }) => void;
    onBulkAdd?: (transactions: any[]) => void;
    availableClasses?: string[];
}

export default function TransactionForm({ onAdd, onBulkAdd, availableClasses = [] }: TransactionFormProps) {
    const [ticker, setTicker] = useState('');
    const [quantity, setQuantity] = useState('');
    const [type, setType] = useState<'BUY' | 'SELL'>('BUY');
    const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
    const [assetClass, setAssetClass] = useState(availableClasses[0] || 'Stocks');
    const [importing, setImporting] = useState(false);
    const [showModal, setShowModal] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (!ticker || !quantity || !date) return;

        onAdd({
            ticker: ticker.toUpperCase(),
            type,
            quantity: parseFloat(quantity),
            date,
            assetClass
        });

        setTicker('');
        setQuantity('');
        setDate(new Date().toISOString().split('T')[0]);
    };

    const processFile = (file: File) => {
        if (!file || !onBulkAdd) return;

        setImporting(true);
        const reader = new FileReader();
        reader.onload = (evt) => {
            try {
                const bstr = evt.target?.result;
                const wb = XLSX.read(bstr, { type: 'binary', cellDates: true });
                const wsname = wb.SheetNames[0];
                const ws = wb.Sheets[wsname];
                const data = XLSX.utils.sheet_to_json(ws);

                if (data.length === 0) {
                    alert('File is empty');
                    return;
                }

                const transactions = data.map((row: any) => ({
                    ticker: (row.Ticker || row.ticker || '').toString().toUpperCase(),
                    type: (row.Type || row.type || 'BUY').toString().toUpperCase(),
                    quantity: parseFloat(row.Quantity || row.quantity || 0),
                    date: row.Date || row.date || undefined,
                    assetClass: row.Class || row.class || row.assetClass || undefined
                })).filter(tx => tx.ticker && tx.quantity > 0);

                if (transactions.length > 0) {
                    onBulkAdd(transactions);
                    setShowModal(false);
                } else {
                    alert('No valid transactions found in file. Columns should be: Ticker, Type, Quantity, Date, Class');
                }
            } catch (err: any) {
                console.error(err);
                alert('Failed to parse Excel file: ' + err.message);
            } finally {
                setImporting(false);
                if (fileInputRef.current) fileInputRef.current.value = '';
            }
        };
        reader.readAsBinaryString(file);
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) processFile(file);
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(true);
    };

    const handleDragLeave = () => {
        setIsDragging(false);
    };

    const handleDrop = (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) processFile(file);
    };

    return (
        <div className={styles.formContainer}>
            <form onSubmit={handleSubmit} className={styles.form}>
                <div className={styles.headerRow}>
                    <h3>Add Transaction</h3>
                    <div className={styles.tooltipContainer}>
                        <button
                            type="button"
                            className={styles.newClassBtn}
                            onClick={() => setShowModal(true)}
                            disabled={importing}
                        >
                            {importing ? 'Importing...' : 'Bulk Import'}
                        </button>
                        <div className={styles.tooltip}>
                            <b>Import Instructions:</b><br />
                            Upload an Excel or CSV file. Columns must include:
                            <b>Ticker</b>, <b>Type</b> (BUY/SELL), <b>Quantity</b>.<br />
                            <i>Optional: Date, Class.</i>
                        </div>
                    </div>
                </div>

                <div className={styles.formRow}>
                    <div className={styles.inputGroup}>
                        <label>Ticker</label>
                        <input
                            type="text"
                            value={ticker}
                            onChange={(e) => setTicker(e.target.value)}
                            placeholder="e.g. MSFT"
                            required
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Type</label>
                        <CustomSelect
                            options={[
                                { value: 'BUY', label: 'BUY' },
                                { value: 'SELL', label: 'SELL' }
                            ]}
                            value={type}
                            onChange={(val) => setType(val as 'BUY' | 'SELL')}
                        />
                    </div>
                </div>

                <div className={styles.formRow}>
                    <div className={styles.inputGroup}>
                        <label>Quantity</label>
                        <input
                            type="number"
                            value={quantity}
                            onChange={(e) => setQuantity(e.target.value)}
                            placeholder="Shares"
                            required
                            step="any"
                            min="0"
                        />
                    </div>

                    <div className={styles.inputGroup}>
                        <label>Date</label>
                        <input
                            type="date"
                            value={date}
                            className={styles.dateInput}
                            onChange={(e) => setDate(e.target.value)}
                            required
                        />
                    </div>
                </div>

                <div className={styles.formRow}>
                    <div className={styles.inputGroup} style={{ width: '100%' }}>
                        <label>Asset Class</label>
                        <CustomSelect
                            options={availableClasses}
                            value={assetClass}
                            onChange={setAssetClass}
                        />
                    </div>
                </div>

                <button
                    type="submit"
                    className={styles.addButton}
                    style={{ backgroundColor: type === 'BUY' ? '#22c55e' : '#ef4444' }}
                >
                    {type} {ticker ? ticker.toUpperCase() : 'Asset'}
                </button>
            </form>

            {showModal && (
                <div className={styles.importModalOverlay} onClick={() => setShowModal(false)}>
                    <div className={styles.importModalContent} onClick={(e) => e.stopPropagation()}>
                        <button className={styles.closeModal} onClick={() => setShowModal(false)}>×</button>
                        <h3>Bulk Import Transactions</h3>
                        <p style={{ color: '#9ca3af', fontSize: '0.85rem', marginBottom: '1.5rem' }}>
                            Drag and drop your Excel (.xlsx, .xls) or CSV file here to import your trades.
                        </p>

                        <div
                            className={`${styles.dropZone} ${isDragging ? styles.dropZoneActive : ''}`}
                            onDragOver={handleDragOver}
                            onDragLeave={handleDragLeave}
                            onDrop={handleDrop}
                            onClick={() => fileInputRef.current?.click()}
                        >
                            <span style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}>📄</span>
                            <strong>{importing ? 'Processing...' : 'Click or Drag File'}</strong>
                            <p style={{ fontSize: '0.75rem', opacity: 0.6, marginTop: '0.5rem' }}>
                                Supports .xlsx, .xls, and .csv
                            </p>
                        </div>

                        <input
                            type="file"
                            ref={fileInputRef}
                            style={{ display: 'none' }}
                            accept=".xlsx, .xls, .csv"
                            onChange={handleFileUpload}
                        />

                        <div className={styles.hint} style={{ marginTop: '1.5rem', background: 'rgba(255,255,255,0.03)', padding: '1rem', borderRadius: '10px' }}>
                            <p style={{ marginBottom: '0.5rem', fontStyle: 'normal', color: '#f3f4f6' }}><b>Example Structure:</b></p>
                            <table style={{ width: '100%', fontSize: '0.7rem', textAlign: 'left', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr>
                                        <th style={{ borderBottom: '1px solid #333', padding: '4px' }}>Ticker</th>
                                        <th style={{ borderBottom: '1px solid #333', padding: '4px' }}>Type</th>
                                        <th style={{ borderBottom: '1px solid #333', padding: '4px' }}>Quantity</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    <tr>
                                        <td style={{ padding: '4px' }}>AAPL</td>
                                        <td style={{ padding: '4px' }}>BUY</td>
                                        <td style={{ padding: '4px' }}>10</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '4px' }}>BTC-USD</td>
                                        <td style={{ padding: '4px' }}>SELL</td>
                                        <td style={{ padding: '4px' }}>0.5</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
