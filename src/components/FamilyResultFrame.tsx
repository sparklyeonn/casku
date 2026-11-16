import type { ReactNode } from "react"
import Link from "next/link"
import { CaskuBrand } from "./CaskuBrand"
import { FamilyNavigation } from "./FamilyNavigation"
import { FamilyLogout } from "./FamilyLogout"
export function FamilyResultFrame({ correo, children }: { correo: string; children: ReactNode }) {
  return <div className="casku-ui family-space">
    <a className="skip-link" href="#contenido-familiar">Saltar al contenido</a>
    <header className="family-header"><div className="family-header-inner">
      <div className="family-identity"><CaskuBrand href="/familias" /><span>Mi espacio familiar</span></div>
      <div className="family-account"><span>{correo}</span><FamilyLogout /></div>
    </div></header>
    <FamilyNavigation />
    <div id="contenido-familiar" tabIndex={-1}>{children}</div>
    <footer className="family-footer"><p>Casku · Acompañando a tu familia</p><Link href="/privacidad">Privacidad y uso de datos</Link></footer>
  </div>
}
