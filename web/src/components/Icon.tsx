const paths: Record<string, string> = {
  dashboard: "M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z",
  points: "M12 8v4l3 2 M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  autopoint: "M4 7h16v10H4z M8 3h8 M12 7v10 M7 12h.01 M17 12h.01",
  employees:
    "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M17 4a4 4 0 0 1 0 8 M22 21v-2a4 4 0 0 0-3-3.87",
  reports:
    "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M8 13h8 M8 17h5",
  adjustments:
    "m9 11 3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  schedules:
    "M8 2v4 M16 2v4 M3 10h18 M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2 M8 14h2 M14 14h2 M8 18h2",
  occurrences:
    "M12 9v4 M12 17h.01 M10 3 2 18a2 2 0 0 0 2 3h16a2 2 0 0 0 2-3L14 3a2 2 0 0 0-4 0",
  locations:
    "M21 10c0 7-9 12-9 12S3 17 3 10a9 9 0 0 1 18 0 M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0",
  companies:
    "M3 21h18 M5 21V3h14v18 M9 7h1 M14 7h1 M9 11h1 M14 11h1 M10 21v-5h4v5",
  settings: "M4 5h16 M4 12h16 M4 19h16 M8 2v6 M16 9v6 M10 16v6",
  password: "M5 11h14v10H5z M8 11V7a4 4 0 0 1 8 0v4 M12 15v2",
  search: "M11 3a8 8 0 1 1 0 16 8 8 0 0 1 0-16 M17 17l5 5",
  help: "M12 3a9 9 0 1 1 0 18 9 9 0 0 1 0-18 M9.5 9a2.5 2.5 0 1 1 4 2c-1 .5-1.5 1-1.5 2 M12 17h.01",
  arrow: "M5 12h14 M13 6l6 6-6 6",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M13 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0 M19 8v6 M22 11h-6",
  plans: "M4 7h16 M4 12h16 M4 17h10 M3 4h18v16H3z",
  subscription: "M3 6h18v12H3z M7 10h4 M7 14h7",
  finance: "M4 5h16v14H4z M7 9h10 M7 13h4 M14 13h3 M7 17h3 M13 17h4 M12 2v3",
  proposal: "M6 2h9l5 5v15H6z M14 2v6h6 M9 13h6 M9 17h4",
  contract: "M6 2h9l5 5v15H6z M14 2v6h6 M9 12h6 M9 16h6 M9 20h3",
  audit: "M12 3 4 6v5c0 5 3.5 8 8 10 4.5-2 8-5 8-10V9z M9 13l2 2 4-4",
  mail: "M3 5h18v14H3z M3 7l9 6 9-6",
  logout: "M10 17l5-5-5-5 M15 12H3 M12 3h7a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-7",
  menu: "M4 6h16 M4 12h16 M4 18h16",
  close: "M6 6l12 12 M18 6 6 18",
  check: "m5 12 4 4L19 6",
};
export function Icon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="ui-icon"
    >
      <path d={paths[name] || paths.settings} />
    </svg>
  );
}
