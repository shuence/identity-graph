import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  className,
  variant = "default",
}: {
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
  /** `desk` = soft panel used under /app */
  variant?: "default" | "desk";
}) {
  return (
    <div
      className={cn(
        variant === "desk"
          ? "desk-page-header flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
          : "flex flex-col gap-4 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between",
        className
      )}
    >
      <div className="flex flex-col gap-1.5">
        <h1
          className={cn(
            "font-heading font-semibold tracking-tight text-foreground",
            variant === "desk"
              ? "text-2xl md:text-[1.75rem]"
              : "text-2xl md:text-3xl"
          )}
        >
          {title}
        </h1>
        {description ? (
          <p className="max-w-2xl text-sm text-muted-foreground md:text-[0.95rem]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
