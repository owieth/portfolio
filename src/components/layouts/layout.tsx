import Head from 'next/head';
import { ReactNode } from 'react';
import Dock from '../dock/dock';
import Popup from '../popup/popup';
import styles from './layout.module.scss';

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <Head>
        <title>✦ Olivier Winkler ✦</title>
      </Head>
      <main className={styles.container}>
        {children}
        <Dock />
      </main>
      <Popup />
    </>
  )
}