export type Resultado = {
  indiceCraneal: number
  indiceAsimetria: number
  diagCraneal: string
  diagAsim: string | null
  severidad: "normal" | "leve" | "moderado"
  recomendacion: string
}

export function calcularDiagnostico(ap: number, bp: number, di: number, dd: number): Resultado {
  const ic = (bp / ap) * 100
  const ia = Math.abs(di - dd)

  let diagCraneal: string
  let sevCraneal: "normal" | "leve" | "moderado"

  if (ic < 76) {
    diagCraneal = "Escafocefalia / Dolicocefalia"
    sevCraneal = ic < 70 ? "moderado" : "leve"
  } else if (ic <= 85) {
    diagCraneal = "Cráneo normal"
    sevCraneal = "normal"
  } else if (ic <= 93) {
    diagCraneal = "Braquicefalia leve"
    sevCraneal = "leve"
  } else {
    diagCraneal = "Braquicefalia moderada-severa"
    sevCraneal = "moderado"
  }

  let diagAsim: string | null = null
  let sevAsim: "normal" | "leve" | "moderado" = "normal"

  if (ia >= 12) {
    diagAsim = "Plagiocefalia severa"
    sevAsim = "moderado"
  } else if (ia >= 6) {
    diagAsim = "Plagiocefalia leve-moderada"
    sevAsim = "leve"
  }

  const severidad: "normal" | "leve" | "moderado" =
    sevCraneal === "moderado" || sevAsim === "moderado" ? "moderado"
    : sevCraneal === "leve" || sevAsim === "leve" ? "leve"
    : "normal"

  const recomendacion = {
    normal: "Morfología craneal dentro de rangos normales. Se recomienda continuar con controles de rutina.",
    leve: "Se detectan leves alteraciones. Se recomienda evaluación de seguimiento y ejercicios de reposicionamiento.",
    moderado: "Se detectan alteraciones significativas. Se recomienda derivación a especialista y evaluación de ortesis craneal.",
  }[severidad]

  return { indiceCraneal: ic, indiceAsimetria: ia, diagCraneal, diagAsim, severidad, recomendacion }
}

