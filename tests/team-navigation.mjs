import { expect as pwExpect } from "@playwright/test"
const expect=pwExpect.configure({timeout:30000})
export async function teamNavigate(page,label) {
  await expect(page.getByRole("navigation",{name:"Menú de equipo"})).toBeVisible()
  const toggle=page.getByRole("button",{name:"Menú del equipo",exact:true})
  if(await toggle.isVisible() && await toggle.getAttribute("aria-expanded")==="false")await toggle.click()
  const link=page.getByRole("navigation",{name:"Menú de equipo"}).getByRole("link",{name:label,exact:true})
  const href=await link.getAttribute("href")
  await link.click()
  await expect(page.getByRole("navigation",{name:"Menú de equipo"}).getByRole("link",{name:label,exact:true,includeHidden:true})).toHaveAttribute("aria-current","page")
  await expect(page).toHaveURL(url=>url.pathname===href)
  await page.waitForLoadState("networkidle")
}
