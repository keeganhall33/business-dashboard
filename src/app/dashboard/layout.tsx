export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main
      className="mx-auto w-full max-w-7xl flex-1 px-4 sm:px-6 lg:px-8 pt-[max(2.5rem,env(safe-area-inset-top))] pb-[max(2.5rem,env(safe-area-inset-bottom))]"
    >
      {children}
    </main>
  );
}
