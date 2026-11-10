"use client"
import { useEffect, useRef, useState } from "react"
import type { IScannerControls } from "@zxing/browser"

export function ReceptionQrScanner({ onCode, onClose, description = "Apunta al QR del comprobante. Después podrás revisar la inscripción y confirmar la llegada." }: { onCode: (code: string) => void; onClose: () => void; description?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const callback = useRef(onCode)
  const [error, setError] = useState("")
  useEffect(() => { callback.current = onCode }, [onCode])
  useEffect(() => {
    const element = video.current!
    let active = true, accepted = false, controls: IScannerControls | undefined
    async function start() {
      try {
        if (!navigator.mediaDevices?.getUserMedia || !window.isSecureContext) throw new Error("CAMERA_UNAVAILABLE")
        const { BrowserQRCodeReader } = await import("@zxing/browser")
        if (!active) return
        controls = await new BrowserQRCodeReader().decodeFromConstraints({ audio: false, video: { facingMode: { ideal: "environment" } } }, element, (result, _error, scanner) => {
          if (active && !accepted && result) {
            accepted = true; scanner.stop(); callback.current(result.getText())
          }
        })
        if (!active || accepted) controls.stop()
      } catch {
        if (active) setError("No pudimos abrir la cámara. Revisa su permiso o ingresa el dato manualmente. La cámara requiere HTTPS o localhost.")
      }
    }
    void start()
    return () => {
      active = false; controls?.stop()
      const stream = element.srcObject
      if (stream instanceof MediaStream) stream.getTracks().forEach(track => track.stop())
      element.srcObject = null
    }
  }, [])
  return <div className="space-y-3 rounded-xl border p-4"><p>{description}</p><video ref={video} muted playsInline className="max-h-72 w-full rounded-lg bg-black" aria-label="Cámara para leer el QR" />{error && <p role="alert" className="text-red-700 dark:text-red-200">{error}</p>}<button type="button" onClick={onClose} className="rounded-lg border px-4 py-2">Cerrar cámara</button></div>
}
