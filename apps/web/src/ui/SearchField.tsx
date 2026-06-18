export function SearchField({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="dc-search">
      <span className="dc-search-glyph" aria-hidden>
        ⌕
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      {value ? (
        <button type="button" className="dc-search-clear" onClick={() => onChange("")} aria-label="Clear search">
          ×
        </button>
      ) : null}
    </label>
  );
}
