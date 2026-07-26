import Link from "next/link";

export function AnnouncementBar() {
  return (
    <div className="bg-indigo-deep text-primary-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-3 px-4 py-2 text-center text-sm">
        <span>Sarvam Epoch · Suvidha Desk</span>
        <Link
          href="/app"
          className="font-medium underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          Open desk
        </Link>
      </div>
    </div>
  );
}
