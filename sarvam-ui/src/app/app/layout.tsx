import { SidebarInset, SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/shell/app-sidebar";
import { Separator } from "@/components/ui/separator";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <AppSidebar />
      <SidebarInset>
        <div className="desk-tricolor print:hidden" aria-hidden>
          <span />
          <span />
          <span />
        </div>
        <header className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-[#0b3d91] px-4 text-white print:hidden">
          <SidebarTrigger className="text-white hover:bg-white/10 hover:text-white" />
          <Separator orientation="vertical" className="mr-1 h-4 bg-white/30" />
          <div className="flex min-w-0 flex-col leading-tight">
            <span className="truncate text-sm font-semibold tracking-wide">
              IdentityGraph · Suvidha Desk
            </span>
            <span className="truncate text-[11px] text-white/75">
              Citizen identity check before portal submit
            </span>
          </div>
        </header>
        <div className="desk-gov flex flex-1 flex-col gap-5 bg-[#f4f6f9] p-3 md:p-6 print:bg-white print:p-0">
          {children}
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
