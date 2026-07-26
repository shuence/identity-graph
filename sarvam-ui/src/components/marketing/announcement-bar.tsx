import Link from "next/link";

export function AnnouncementBar() {
  return (
    <div className="bg-indigo-deep text-primary-foreground">
      <div className="mx-auto flex max-w-7xl items-center justify-center gap-2 px-4 py-2.5 text-center text-sm">
        <span className="font-medium">
          IdentityGraph India · Sarvam Epoch Buildathon · Voice + document intelligence
        </span>
        <span className="hidden text-primary-foreground/60 sm:inline">·</span>
        <Link
          href="/app"
          className="underline underline-offset-4 transition-opacity hover:opacity-80"
        >
          Open desk
        </Link>
      </div>
    </div>
  );
}
