export default function Home() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-24">
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

      <h1 className="text-bold flex items-center text-6xl font-medium">
        Hello. Hey.
        <span className="relative ml-3 h-[1em] w-36 overflow-hidden">
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
      </h1>
    </main>
  );
}
