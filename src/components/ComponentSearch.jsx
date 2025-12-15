import React, { useState, useEffect, useRef } from 'react';
import { tools } from '../data/tools';
import './ComponentSearch.css';

const ComponentSearch = ({ isOpen, onClose, onSelect }) => {
    const [query, setQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const inputRef = useRef(null);

    const filteredTools = tools.filter(tool =>
        tool.label.toLowerCase().includes(query.toLowerCase()) ||
        tool.id.toLowerCase().includes(query.toLowerCase())
    );

    useEffect(() => {
        if (isOpen) {
            setQuery('');
            setSelectedIndex(0);
            setTimeout(() => inputRef.current?.focus(), 50); // Small delay to ensure render
        }
    }, [isOpen]);

    // Reset selection when list changes
    useEffect(() => {
        setSelectedIndex(0);
    }, [query]);

    const handleKeyDown = (e) => {
        if (!isOpen) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setSelectedIndex(prev => (prev + 1) % filteredTools.length);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setSelectedIndex(prev => (prev - 1 + filteredTools.length) % filteredTools.length);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filteredTools.length > 0) {
                onSelect(filteredTools[selectedIndex].id);
                onClose();
            }
        } else if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
        }
    };

    if (!isOpen) return null;

    return (
        <div className="search-overlay" onClick={onClose}>
            <div className="search-box" onClick={e => e.stopPropagation()}>
                <div className="search-header">
                    <span className="search-icon">🔍</span>
                    <input
                        ref={inputRef}
                        type="text"
                        value={query}
                        onChange={e => setQuery(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Type to search components..."
                        className="search-input"
                    />
                    <span className="search-hint">ESC to close</span>
                </div>

                <div className="search-results">
                    {filteredTools.length > 0 ? (
                        filteredTools.map((tool, index) => (
                            <div
                                key={tool.id}
                                className={`search-item ${index === selectedIndex ? 'selected' : ''}`}
                                onClick={() => {
                                    onSelect(tool.id);
                                    onClose();
                                }}
                                onMouseEnter={() => setSelectedIndex(index)}
                            >
                                <span className="item-icon">{tool.icon}</span>
                                <span className="item-label">{tool.label}</span>
                                {index === selectedIndex && <span className="item-enter">↵</span>}
                            </div>
                        ))
                    ) : (
                        <div className="no-results">No matches found</div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ComponentSearch;
