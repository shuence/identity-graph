import Link from "next/link";

export function AnnouncementBar() {
  return (
    <div className="bg-indigo-deep text-primary-foreground">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1 px-4 py-2.5 text-center text-sm">
        <span>
          Portal rejections caught at the desk — before upload
        </span>
        <span className="hidden text-primary-foreground/40 sm:inline">|</span>
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
