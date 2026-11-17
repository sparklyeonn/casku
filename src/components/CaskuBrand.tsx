import Image from "next/image"
import Link from "next/link"

export function CaskuBrand({ href = "/" }: { href?: string }) {
  return <Link href={href} className="casku-brand" aria-label="Casku · Inicio">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcSet="/brand/casku-wordmark-calipso.svg" />
      <Image unoptimized src="/brand/casku-wordmark-azul.svg" alt="Casku 3D" width={1436} height={675} />
    </picture>
  </Link>
}
