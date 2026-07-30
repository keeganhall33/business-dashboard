export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  // Route-group layout already provides max-width + padding; keep dashboard layout minimal.
  return <>{children}</>;
}
