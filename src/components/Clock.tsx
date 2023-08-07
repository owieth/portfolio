'use client';

import { useEffect, useState } from 'react';

const Clock = () => {
  const [date, setDate] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setDate(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const styles = {
    wrapper: [
      'relative',
      'flex',
      'items-center',
      'justify-center',
      'text-sm',
      'rounded-full',
      'h-[40px]',
      'w-[40px]',
      'border',
    ].join(' '),
    center: [
      'bg-white',
      'h-[2px]',
      'w-[2px]',
      'absolute',
      'z-50',
      'flex',
      'rounded-full',
    ].join(' '),
    hour: [
      'bg-white',
      'h-[16px]',
      'w-[2px]',
      'absolute',
      'top-[3px]',
      'z-30',
      'w-1',
      'origin-bottom',
      'rounded-md',
    ].join(' '),
    minute: [
      'bg-white',
      'h-[10px]',
      'w-[2px]',
      'absolute',
      'top-[9px]',
      'z-20',
      'origin-bottom',
      'rounded-md',
    ].join(' '),
    second: [
      'bg-white',
      'h-[12px]',
      'w-px',
      'absolute',
      'top-[7px]',
      'z-10',
      'origin-bottom',
      'rounded-md',
    ].join(' '),
  };

  return (
    <div className={styles.wrapper}>
      <span className={styles.center} />

      <span
        className={styles.second}
        style={{
          transform: `rotate(${date.getSeconds() * 6}deg)`,
        }}
      />

      <span
        className={styles.minute}
        style={{ transform: `rotate(${date.getMinutes() * 6}deg)` }}
      />

      <span
        className={styles.hour}
        style={{
          transform: `rotate(${
            date.getHours() * 30 + date.getMinutes() / 2
          }deg)`,
        }}
      />
    </div>
  );
};

export default Clock;
