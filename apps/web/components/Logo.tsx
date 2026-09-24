export function Logo({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" fill="var(--accent)" />
      {/* hull + keel: a steady line under a moving surface */}
      <path d="M6 12.5c3 0 3-2 6-2s3 2 6 2 3-2 6-2 2 1 2 1" stroke="var(--accent-ink)" strokeWidth="1.8" fill="none" strokeLinecap="round" opacity="0.6" />
      <path d="M7 16h18l-4 5H11z" fill="var(--accent-ink)" />
      <path d="M16 21v6" stroke="var(--accent-ink)" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
