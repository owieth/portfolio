import { Fragment } from 'react';

/**
 * A log cell that keeps its code and gains its name: `LX 316` stays the thing
 * you scan for, because it is what is on the boarding pass, and `Swiss` sits
 * under it in the body colour the table already uses.
 */
const Named = ({ code, name }: { code: string; name?: string }) => (
  <Fragment>
    <span className="text-foreground">{code}</span>
    {name && <span className="mt-0.5 block text-xs">{name}</span>}
  </Fragment>
);

export default Named;
