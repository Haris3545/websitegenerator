import { AutoFitHeading } from "@/components/site/AutoFitHeading";

export function SiteHeader({
  projectTitle,
  tagline,
}: {
  projectTitle: string;
  tagline: string;
}) {
  return (
    <div className="px-6 pt-6 sm:px-10">
      <div className="font-[inherit]">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--accent)] sm:text-xs">
          {tagline}
        </p>
        <AutoFitHeading
          maxFontSizePx={36}
          minFontSizePx={18}
          className="mt-1 text-white"
          style={{
            fontWeight: "var(--header-font-weight, 700)",
            fontStyle: "var(--header-font-style, normal)",
          }}
        >
          {projectTitle}
        </AutoFitHeading>
      </div>
      <div className="mt-1.5 h-[3.4px] w-full rounded-full bg-[var(--accent)]" />
    </div>
  );
}
