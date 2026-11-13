import Link from "next/link";

export function InclusiveLogo({ className = "h-9 w-auto", href }: { className?: string; href?: string }) {
  const content = (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/inclusive-logo.png"
      alt="Inclusive Staffing"
      className={`${className} object-contain shrink-0 mix-blend-multiply`}
    />
  );

  return href ? (
    <Link href={href} className="inline-flex items-center hover:opacity-90 transition">
      {content}
    </Link>
  ) : (
    <div className="inline-flex items-center">{content}</div>
  );
}
