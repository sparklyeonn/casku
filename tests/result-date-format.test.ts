import test from 'node:test'
import assert from 'node:assert/strict'
import {formatResultBirthDate,formatResultDateTime} from '../src/lib/results/date-format.ts'
test('fechas clínicas: conserva el día del nacimiento y usa Santiago con hora24 consistente',()=>{
 assert.equal(formatResultBirthDate('2026-01-01'),'1 de enero de 2026')
 assert.equal(formatResultDateTime('2026-11-21T09:00:00Z'),'21 de noviembre de 2026, 06:00')
 assert.equal(formatResultDateTime('2026-11-21T02:30:00Z'),'20 de noviembre de 2026, 23:30')
})
