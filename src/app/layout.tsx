import type { Metadata } from "next"
import localFont from "next/font/local"
import "./globals.css"
import { Providers } from "./providers"

const montserrat = localFont({ src: "./fonts/Montserrat.ttf", variable: "--font-casku-sans", display: "swap", weight: "100 900" })
const playfair = localFont({ src: "./fonts/PlayfairDisplay.ttf", variable: "--font-casku-display", display: "swap", weight: "400 900" })

export const metadata: Metadata = {
  title: "Casku Craneometría",
  description: "Evaluación craneal para bebés",
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body className={`${montserrat.variable} ${playfair.variable} antialiased`}>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}