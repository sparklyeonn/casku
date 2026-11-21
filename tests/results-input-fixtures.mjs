// Explicit opt-in for NEW captures. Never apply this factory to stored v1 snapshots.
export function resultMeasurements(overrides = {}) {
  return { ap: 140, bp: 120, di: 135, dd: 138, protocolo: "casku-craneometria-v2", distanciaPOEtragusDer: 125, distanciaPOEtragusIzq: 128, ...overrides }
}
