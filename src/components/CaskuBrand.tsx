import Link from "next/link"
/** Identificador tipográfico provisional, pendiente del archivo de marca oficial. */
export function CaskuBrand({ href = "/" }: { href?: string }) {
  return <Link href={href} className="casku-brand" aria-label="Casku · Inicio">casku<span aria-hidden="true">3D</span></Link>
}
