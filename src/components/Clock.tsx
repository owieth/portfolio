'use client';

import ClockLib from 'react-live-clock';

const Clock = () => {
  return (
    <div className="flex flex-col items-center gap-8 font-mono">
      <ClockLib
        format="HH:mm:ss"
        timezone="Europe/Zurich"
        className="text-6xl"
        ticking
        noSsr
      />
      <ClockLib
        format="dddd, MMMM DD YYYY"
        timezone="Europe/Zurich"
        ticking
        noSsr
      />
    </div>
  );
};

export default Clock;
