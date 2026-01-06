import { useState, useRef, useEffect } from 'react';
import styles from './CustomSelect.module.css';

interface Option {
    value: string;
    label: string;
}

interface CustomSelectProps {
    options: Option[] | string[];
    value: string;
    onChange: (value: string) => void;
    label?: string;
    placeholder?: string;
}

export default function CustomSelect({ options, value, onChange, placeholder = 'Select...' }: CustomSelectProps) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const normalizedOptions: Option[] = options.map(opt =>
        typeof opt === 'string' ? { value: opt, label: opt } : opt
    );

    const selectedOption = normalizedOptions.find(opt => opt.value === value);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleSelect = (val: string) => {
        onChange(val);
        setIsOpen(false);
    };

    return (
        <div className={styles.container} ref={containerRef}>
            <div
                className={`${styles.trigger} ${isOpen ? styles.triggerOpen : ''}`}
                onClick={() => setIsOpen(!isOpen)}
            >
                <span className={selectedOption ? styles.value : styles.placeholder}>
                    {selectedOption ? selectedOption.label : placeholder}
                </span>
                <svg
                    className={`${styles.arrow} ${isOpen ? styles.arrowRotate : ''}`}
                    width="12" height="12" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                >
                    <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
            </div>

            {isOpen && (
                <div className={styles.dropdown}>
                    {normalizedOptions.map((opt) => (
                        <div
                            key={opt.value}
                            className={`${styles.option} ${opt.value === value ? styles.optionActive : ''}`}
                            onClick={() => handleSelect(opt.value)}
                        >
                            {opt.label}
                            {opt.value === value && (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            )}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
