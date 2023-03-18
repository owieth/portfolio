import { ReactNode } from 'react'
import Dock from '../dock/dock'
import Popup from '../popup/popup'

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <main>{children}</main>
      <Dock />
      <Popup />
    </>
  )
}