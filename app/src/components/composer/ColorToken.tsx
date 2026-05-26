export function ColorToken({ value }: { value: string }) {
  return (
    <span className="composer-color-token" title={value}>
      <span className="composer-color-token-swatch" style={{ backgroundColor: value }} />
      <code>{value}</code>
    </span>
  );
}