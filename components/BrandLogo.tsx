export function BrandLogo({ size = 20, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: "inline-block", verticalAlign: "middle" }}
    >
      {/* 3x3 Grid Matrix Cyber Monogram as in reference */}
      <rect x="2" y="2" width="5.5" height="5.5" rx="1.5" fill="#67e8f9" />
      <rect x="9.25" y="2" width="5.5" height="5.5" rx="1.5" fill="#38bdf8" />
      <rect x="16.5" y="2" width="5.5" height="5.5" rx="1.5" fill="#67e8f9" />

      <rect x="2" y="9.25" width="5.5" height="5.5" rx="1.5" fill="#38bdf8" />
      <rect x="9.25" y="9.25" width="5.5" height="5.5" rx="1.5" fill="#00f59b" />
      <rect x="16.5" y="9.25" width="5.5" height="5.5" rx="1.5" fill="#38bdf8" />

      <rect x="2" y="16.5" width="5.5" height="5.5" rx="1.5" fill="#67e8f9" />
      <rect x="9.25" y="16.5" width="5.5" height="5.5" rx="1.5" fill="#38bdf8" />
      <rect x="16.5" y="16.5" width="5.5" height="5.5" rx="1.5" fill="#67e8f9" />
    </svg>
  );
}
