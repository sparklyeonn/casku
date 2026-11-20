import { timingSafeEqual } from "node:crypto"
export function cronAllowed(request:Request) {
 const secret=process.env.CRON_SECRET || ""
 if(!/^[A-Za-z0-9_-]{32,256}$/.test(secret))return false
 const given=Buffer.from(request.headers.get("authorization")||""),expected=Buffer.from(`Bearer ${secret}`)
 return given.length===expected.length&&timingSafeEqual(given,expected)
}
