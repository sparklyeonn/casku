export function TeamPageHeading({ area, title, description }: { area: string; title: string; description: string }) {
  return <div className="team-page-heading"><p className="casku-eyebrow">{area}</p><h1>{title}</h1><p>{description}</p></div>
}
