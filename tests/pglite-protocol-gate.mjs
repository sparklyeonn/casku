import { createServer, createConnection } from "node:net"
// PGlite tiene un único backend. Su multiplexor puede intercalar Parse/Bind/Execute
// y perder el portal sin nombre de pg. Conservamos cada ciclo hasta ReadyForQuery,
// y cada transacción hasta COMMIT/ROLLBACK. Solo afecta al transporte del ensayo.
export async function protocolGate(upstream) {
  const connections = new Set(), pending = []
  let active = null, transaction = null, stopped = false
  function pump() {
    if (active || stopped) return
    const index = pending.findIndex(item => !transaction || item.client === transaction)
    if (index < 0) return
    active = pending.splice(index, 1)[0]
    active.client.up.write(active.data)
  }
  const server = createServer(down => {
    const up = createConnection(upstream), client = { down, up, input: Buffer.alloc(0), output: Buffer.alloc(0), group: [], startup: true }
    connections.add(client)
    function enqueue(data) { pending.push({ client, data }); pump() }
    down.on("data", data => {
      client.input = Buffer.concat([client.input, data])
      if (client.startup) {
        if (client.input.length < 4) return
        const length = client.input.readInt32BE(0)
        if (client.input.length < length) return
        const packet = client.input.subarray(0, length); client.input = client.input.subarray(length)
        if (length === 8 && packet.readInt32BE(4) === 80877103) { down.write("N"); return }
        client.startup = false; enqueue(packet)
      }
      while (client.input.length >= 5) {
        const length = 1 + client.input.readInt32BE(1)
        if (client.input.length < length) return
        const packet = client.input.subarray(0, length); client.input = client.input.subarray(length)
        const type = String.fromCharCode(packet[0])
        if (type === "X") { up.end(); return }
        client.group.push(packet)
        if (type === "S" || type === "Q") { enqueue(Buffer.concat(client.group)); client.group = [] }
      }
    })
    up.on("data", data => {
      down.write(data)
      client.output = Buffer.concat([client.output, data])
      while (client.output.length >= 5) {
        const length = 1 + client.output.readInt32BE(1)
        if (client.output.length < length) break
        const packet = client.output.subarray(0, length); client.output = client.output.subarray(length)
        if (packet[0] === 90) {
          transaction = packet[5] === 73 ? null : client
          active = null; pump()
        }
      }
    })
    function close() {
      if (!connections.delete(client)) return
      down.destroy(); up.destroy()
      for (let index = pending.length - 1; index >= 0; index--) if (pending[index].client === client) pending.splice(index, 1)
      if (active?.client === client) active = null
      if (transaction === client) transaction = null
      pump()
    }
    down.on("error", close); up.on("error", close); down.on("close", close); up.on("close", close)
  })
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve))
  return { port: server.address().port, close: async () => { stopped = true; for (const client of connections) { client.down.destroy(); client.up.destroy() }; await new Promise(resolve => server.close(resolve)) } }
}
