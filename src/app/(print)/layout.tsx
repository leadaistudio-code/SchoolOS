/**
 * The print surface.
 *
 * A route group of its own rather than a page inside the application shell,
 * because a question paper on paper has to be the only thing on the page. The
 * alternative — rendering inside the shell and hiding the navigation with a
 * print stylesheet — leaves the sidebar's layout width in the flow and prints a
 * paper with a two-inch margin nobody asked for.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-white text-black">{children}</div>
}
