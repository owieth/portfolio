import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/wo-haere/cn';

/**
 * shadcn/ui's button, base-nova style
 * (https://ui.shadcn.com/r/styles/base-nova/button.json, taken 2026-09-28),
 * restyled onto the site's own buttons:
 *
 * - `outline` is the cookie notice's secondary button, a pill that darkens its
 *   border on hover, and `ghost` is bare text in the colour around it that
 *   underlines on hover. The other variants had no counterpart here and are
 *   gone.
 * - `cell` fills a table header, so its label lines up with the column under
 *   it. The table leaves room around itself for the focus ring.
 * - The browser's focus ring, like every other control on the site, and no
 *   transition or press nudge.
 * - Disabled styles key on `data-disabled` rather than `:disabled`: with
 *   `focusableWhenDisabled`, Base UI keeps the button focusable by setting
 *   `aria-disabled` instead of the attribute.
 * - `className` is a string only. Base UI also takes a function of its state,
 *   which cva would drop without a word.
 */
const buttonVariants = cva(
  "group/button inline-flex shrink-0 items-center justify-center gap-1.5 text-sm font-medium whitespace-nowrap select-none data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        outline: 'border-line hover:border-foreground rounded-full border',
        ghost: 'underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-4 py-1.5',
        cell: 'w-full justify-start py-2 pr-4 text-left',
      },
    },
    defaultVariants: {
      variant: 'outline',
      size: 'default',
    },
  },
);

function Button({
  className,
  variant = 'outline',
  size = 'default',
  ...props
}: Omit<ButtonPrimitive.Props, 'className'> &
  VariantProps<typeof buttonVariants> & { className?: string }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button };
