import { useEffect, useId, useMemo, useRef, useState } from 'react';

interface SearchSelectProps<T> {
  items: T[];
  value: string | null;
  onChange: (id: string | null, item: T | null) => void;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  getItemSearchText?: (item: T) => string;
  placeholder?: string;
  emptyMessage?: string;
  disabled?: boolean;
}

export default function SearchSelect<T>({
  items,
  value,
  onChange,
  getItemId,
  getItemLabel,
  getItemSearchText,
  placeholder = 'Search...',
  emptyMessage = 'No matches found',
  disabled = false,
}: SearchSelectProps<T>) {
  const listId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);

  const selectedItem = useMemo(
    () => items.find((item) => getItemId(item) === value) ?? null,
    [items, value, getItemId],
  );

  const filteredItems = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return items;
    return items.filter((item) => {
      const haystack = (getItemSearchText?.(item) ?? getItemLabel(item)).toLowerCase();
      return haystack.includes(term);
    });
  }, [items, query, getItemLabel, getItemSearchText]);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    setActiveIndex(0);
  }, [query, open]);

  const selectItem = (item: T) => {
    onChange(getItemId(item), item);
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (event.key === 'ArrowDown' || event.key === 'Enter')) {
      setOpen(true);
      return;
    }
    if (!open) return;

    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        setActiveIndex((index) => Math.min(index + 1, filteredItems.length - 1));
        break;
      case 'ArrowUp':
        event.preventDefault();
        setActiveIndex((index) => Math.max(index - 1, 0));
        break;
      case 'Enter':
        event.preventDefault();
        if (filteredItems[activeIndex]) {
          selectItem(filteredItems[activeIndex]);
        }
        break;
      case 'Escape':
        setOpen(false);
        setQuery('');
        break;
      default:
        break;
    }
  };

  const displayValue = open ? query : (selectedItem ? getItemLabel(selectedItem) : '');

  return (
    <div className="search-select" ref={containerRef}>
      <input
        ref={inputRef}
        type="text"
        className="search-select-input"
        value={displayValue}
        placeholder={placeholder}
        disabled={disabled}
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        role="combobox"
        onFocus={() => {
          setOpen(true);
          setQuery('');
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setOpen(true);
          if (value) {
            onChange(null, null);
          }
        }}
        onKeyDown={handleKeyDown}
      />
      {open && (
        <ul id={listId} className="search-select-list" role="listbox">
          {filteredItems.length === 0 ? (
            <li className="search-select-empty">{emptyMessage}</li>
          ) : (
            filteredItems.map((item, index) => (
              <li key={getItemId(item)}>
                <button
                  type="button"
                  className={`search-select-option${index === activeIndex ? ' is-active' : ''}`}
                  role="option"
                  aria-selected={index === activeIndex}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => selectItem(item)}
                  onMouseEnter={() => setActiveIndex(index)}
                >
                  {getItemLabel(item)}
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
