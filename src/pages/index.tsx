import styles from '@/styles/Home.module.scss';
import { Inter } from 'next/font/google';
import Head from 'next/head';

const inter = Inter({ subsets: ['latin'] });

const footerItems = [];

export default function Home() {
  return (
    <>
      <Head>
        <title>Create Next App</title>
      </Head>
      <div className={styles.main}>
        <div className={styles.description}>
          <h1 className={inter.className}>Hello. Hallo. Hola. Hej. Hoi.</h1>

          {/* <h2 className={inter.className}>I'm Olivier</h2> */}
        </div>
      </div>
    </>
  )
}
