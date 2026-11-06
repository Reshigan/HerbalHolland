// A template remounts on every navigation, so each page gets the .hh-route fade (globals.css). A layout would not.
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="hh-route">{children}</div>;
}
