import CustomLink from '@/components/Link';

export default function Home() {
  const styles = {
    title: [
      'text-bold',
      'flex',
      'items-center',
      'text-6xl',
      'font-medium',
    ].join(' '),
    slider: [
      'relative',
      'ml-3',
      'h-[1em]',
      'w-40',
      'overflow-hidden',
      'before:absolute',
      'before:-top-px',
      'before:h-5',
      'before:w-full',
      'before:bg-gradient-to-t from-transparent to-black',
      'before:z-[1]',
      'after:absolute',
      'after:-bottom-px',
      'after:h-5',
      'after:w-full',
      'after:bg-gradient-to-b from-transparent to-black',
      'after:z-[1]',
    ].join(' '),
  };

  return (
    <>
      <span className="italic">Building Software for the Future.</span>
      <CustomLink
        link="https://frigg.eco"
        className="text-white/100 hover:border-[#71BC92] hover:text-[#71BC92]"
      >
        frigg.eco
      </CustomLink>

      {/* <h1 className="flex items-center text-6xl font-medium text-bold">
        <span className="relative ml-3 h-[1em] w-36 overflow-hidden">
          {['Hello.', 'Hallo.', 'Hola.'].map((word, i) => (
            <span
              key={i}
              className={"absolute h-full w-full -translate-y-full animate-slide leading-none text-white"}
              style={{ animationDelay: `${i > 0 ? i += 3 : 0}s` }}
            >
              {word}
            </span>
          ))}
        </span>
      </h1> */}

      {/* <h1 className={styles.title}>
        Hello. Hey.
        <span className={styles.slider}>
          <span className="absolute h-full w-full -translate-y-full animate-slide leading-none text-white">
            Hola.
          </span>
          <span className="absolute h-full w-full -translate-y-full animate-slide leading-none text-white [animation-delay:0.83s]">
            Hallo.
          </span>
          <span className="absolute h-full w-full -translate-y-full animate-slide leading-none text-white [animation-delay:1.83s]">
            Hoi.
          </span>
        </span>
      </h1> */}
    </>
  );
}
