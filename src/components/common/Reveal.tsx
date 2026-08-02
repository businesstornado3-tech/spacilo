import { cn } from "@/lib/utils";
import { useInView } from "@/hooks/use-motion";

/**
 * Gently fades and lifts its children into view once.
 * Motion is suppressed automatically by the global reduced-motion rules.
 */
export function Reveal({
  children,
  delay = 0,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  /** milliseconds */
  delay?: number;
  className?: string | undefined;
  as?: "div" | "section" | "li";
}) {
  const { ref, inView } = useInView<HTMLDivElement>();

  return (
    <Tag
      ref={ref as never}
      style={{ transitionDelay: `${delay}ms` }}
      className={cn(
        "transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none",
        inView ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0 motion-reduce:opacity-100",
        className,
      )}
    >
      {children}
    </Tag>
  );
}
